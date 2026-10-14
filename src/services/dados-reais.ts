// Dados REAIS da conta (fora do modo demonstração).
//
// Lê do banco o que as funções `mercadolivre-sincronizar`,
// `shopee-sincronizar` e `tiktok-sincronizar` trouxeram dos
// marketplaces — contas, anúncios e pedidos — e converte para os mesmos
// formatos que as telas já usam (Anuncio, Pedido, ContaMarketplace). Assim
// nenhuma tela precisa saber se o dado é de exemplo ou real.

import { supabase } from "@/lib/supabase";
import type {
  Anuncio,
  ContaMarketplace,
  ItemEstoqueDetalhado,
  MarketplaceId,
  Pedido,
  StatusAnuncio,
  StatusPedido,
  TipoLogistica,
} from "@/types";

/** Alíquota usada enquanto o seller não configura o regime dele. */
const IMPOSTO_PADRAO = 0.1;

const STATUS_ANUNCIO: StatusAnuncio[] = ["ativo", "pausado", "sem-estoque"];
const STATUS_PEDIDO: StatusPedido[] = ["entregue", "em-transito", "aguardando-envio", "cancelado"];
const LOGISTICAS: TipoLogistica[] = ["full", "flex", "padrao"];

const num = (v: unknown) => Number(v ?? 0) || 0;

export interface DadosReais {
  contas: ContaMarketplace[];
  anuncios: Anuncio[];
  pedidos: Pedido[];
  /** Estoque próprio (fora do Full), a partir do estoque de cada anúncio. */
  estoque: ItemEstoqueDetalhado[];
}

/** Prazo de reposição usado enquanto o seller não informa o do fornecedor. */
const PRAZO_FORNECEDOR_PADRAO = 7;

export async function carregarDadosReais(perfilId: string): Promise<DadosReais> {
  const [rContas, rConexoes, rLojasShopee, rLojasTikTok, rAnuncios, rPedidos, rProdutos] = await Promise.all([
    supabase
      .from("contas_marketplace")
      .select("id, marketplace_id, nome, status_conexao, credencial_ref, ultima_sincronizacao, ativo")
      .eq("perfil_id", perfilId)
      .eq("ativo", true),
    supabase.from("ml_conexoes").select("id, status").eq("perfil_id", perfilId),
    supabase.from("shopee_conexoes").select("id, status").eq("perfil_id", perfilId),
    supabase.from("tiktok_conexoes").select("id, status").eq("perfil_id", perfilId),
    supabase
      .from("anuncios")
      .select(
        "id, conta_id, produto_id, id_externo, sku, ean, titulo, preco_atual, preco_cheio, em_promocao, comissao_percentual, taxa_fixa, frete_unitario, custo_midia_unitario, custo_afiliado_unitario, origem_taxas, status, unidades_vendidas, data_ultima_venda, estoque, logistica",
      )
      .eq("perfil_id", perfilId)
      .limit(5000),
    supabase
      .from("pedidos")
      .select(
        "id, conta_id, anuncio_id, id_externo, data_venda, sku, produto, quantidade, preco_venda, cmv, comissao, status, logistica, comprador, origem_valor, id_pedido_ml, frete, uf",
      )
      .eq("perfil_id", perfilId)
      .order("data_venda", { ascending: false })
      .limit(10000),
    supabase.from("produtos").select("sku, cmv").eq("perfil_id", perfilId),
  ]);

  for (const r of [rContas, rConexoes, rLojasShopee, rLojasTikTok, rAnuncios, rPedidos, rProdutos]) {
    if (r.error) console.error("carregarDadosReais:", r.error.message);
  }

  // Alíquota que o seller salvou em Configurações → Fiscal (sem salvar: 10%).
  let aliquota = IMPOSTO_PADRAO;
  {
    const { data, error } = await supabase
      .from("preferencias_usuario")
      .select("aliquota_imposto")
      .eq("perfil_id", perfilId)
      .maybeSingle();
    if (!error && data && data.aliquota_imposto !== null && data.aliquota_imposto !== undefined) {
      const n = Number(data.aliquota_imposto);
      if (Number.isFinite(n) && n >= 0 && n <= 1) aliquota = n;
    }
  }

  // Só entram contas cuja conexão ainda existe (desconectou → some).
  // (Mercado Livre, Shopee e TikTok Shop: o credencial_ref aponta para a conexão de cada um.)
  const conexoes = new Map(
    [...(rConexoes.data ?? []), ...(rLojasShopee.data ?? []), ...(rLojasTikTok.data ?? [])].map((c) => [c.id as string, c.status as string]),
  );
  const linhasContas = (rContas.data ?? []).filter(
    (c) => !c.credencial_ref || conexoes.has(c.credencial_ref as string),
  );
  const marketplaceDaConta = new Map(
    linhasContas.map((c) => [c.id as string, c.marketplace_id as MarketplaceId]),
  );

  const anuncios: Anuncio[] = (rAnuncios.data ?? [])
    .filter((a) => marketplaceDaConta.has(a.conta_id as string))
    .map((a) => ({
      id: a.id as string,
      marketplaceId: marketplaceDaConta.get(a.conta_id as string)!,
      contaId: a.conta_id as string,
      sku: (a.sku as string) ?? (a.id_externo as string),
      ean: (a.ean as string | null) ?? null,
      produto: (a.titulo as string) ?? (a.id_externo as string),
      precoAtual: num(a.preco_atual),
      precoCheio: a.preco_cheio === null ? null : num(a.preco_cheio),
      emPromocao: Boolean(a.em_promocao),
      // O custo vem do catálogo (Produtos): é preenchido quando o SKU do
      // anúncio bate com um produto cadastrado (reconciliarComAnuncios).
      cmv: null,
      impostoPercentual: aliquota,
      comissaoPercentual: num(a.comissao_percentual),
      taxaFixa: num(a.taxa_fixa),
      freteUnitario: num(a.frete_unitario),
      custoMidiaUnitario: num(a.custo_midia_unitario),
      ads: null,
      custoAfiliadoUnitario: num(a.custo_afiliado_unitario),
      origemTaxas: a.origem_taxas === "liquidado" ? "liquidado" : "estimado",
      produtoId: (a.produto_id as string | null) ?? null,
      status: STATUS_ANUNCIO.includes(a.status as StatusAnuncio) ? (a.status as StatusAnuncio) : "pausado",
      elegivelPromocao: false,
      unidadesVendidas: num(a.unidades_vendidas),
      dataUltimaVenda: (a.data_ultima_venda as string | null) ?? null,
      roasObjetivo: null,
    }));

  // CMV de cada venda: o custo cadastrado no catálogo (Produtos) para o SKU.
  const cmvPorSku = new Map(
    (rProdutos.data ?? []).map((p) => [p.sku as string, num(p.cmv)]),
  );

  const pedidos: Pedido[] = (rPedidos.data ?? [])
    .filter((p) => marketplaceDaConta.has(p.conta_id as string))
    .map((p) => {
      const quantidade = num(p.quantidade) || 1;
      const precoUnitario = num(p.preco_venda);
      const faturamento = precoUnitario * quantidade;
      const comissao = num(p.comissao);
      const cmvCadastrado = p.cmv !== null ? num(p.cmv) : cmvPorSku.get(p.sku as string);
      const semCmv = !(cmvCadastrado !== undefined && cmvCadastrado > 0);
      const cmvUnitario = cmvCadastrado ?? 0;
      const cmv = cmvUnitario * quantidade;
      const impostos = faturamento * aliquota;
      // Frete que o canal descontou do seller (null = ainda não consultado).
      const frete = p.frete === null || p.frete === undefined ? 0 : num(p.frete);
      const lucroLiquido = faturamento - cmv - comissao - impostos - frete;
      const status = STATUS_PEDIDO.includes(p.status as StatusPedido)
        ? (p.status as StatusPedido)
        : "aguardando-envio";
      return {
        id: p.id as string,
        numero: (p.id_pedido_ml as string | null) ?? undefined,
        data: p.data_venda as string,
        marketplaceId: marketplaceDaConta.get(p.conta_id as string)!,
        contaId: p.conta_id as string,
        sku: (p.sku as string) ?? "",
        produto: (p.produto as string) ?? (p.sku as string) ?? "",
        quantidade,
        precoUnitario,
        faturamento,
        cmv,
        comissao,
        taxaFixa: 0,
        impostos,
        descontos: 0,
        outrosCustos: 0,
        custoMidia: 0,
        lucroLiquido,
        margem: faturamento > 0 ? lucroLiquido / faturamento : 0,
        semCmv,
        status,
        cliente: (p.comprador as string) ?? "",
        telefone: "",
        tipoLogistica: LOGISTICAS.includes(p.logistica as TipoLogistica)
          ? (p.logistica as TipoLogistica)
          : "padrao",
        estado: ((p.uf as string | null) ?? "").toUpperCase(),
        parcelas: 1,
        repasses:
          status === "cancelado" ? [] : [{ data: p.data_venda as string, valor: faturamento - comissao - frete }],
        valorDevolvido: 0,
        dataDevolucao: null,
        motivoDevolucao: null,
        campanhaId: null,
        freteVendedor: frete,
        freteEsperado: frete,
        freteCobrado: frete,
      };
    });

  const hoje = new Date().toDateString(); // dia de hoje no fuso de quem vê
  const contas: ContaMarketplace[] = linhasContas.map((c) => {
    const id = c.id as string;
    const statusMl = c.credencial_ref ? conexoes.get(c.credencial_ref as string) : "ativa";
    const anunciosDaConta = anuncios.filter((a) => a.contaId === id);
    const media = (lista: number[]) =>
      lista.length ? lista.reduce((s, v) => s + v, 0) / lista.length : 0;
    return {
      id,
      marketplaceId: c.marketplace_id as MarketplaceId,
      nome: (c.nome as string) ?? "Conta",
      cnpj: "",
      empresaId: "emp-principal",
      conectada: statusMl === "ativa",
      statusConexao: statusMl === "ativa" ? "conectado" : "desconectado",
      ultimaSincronizacao: (c.ultima_sincronizacao as string | null) ?? null,
      skusAtivos: new Set(anunciosDaConta.filter((a) => a.status === "ativo").map((a) => a.sku)).size,
      vendasHoje: pedidos
        .filter((p) => p.contaId === id && p.status !== "cancelado" && new Date(p.data).toDateString() === hoje)
        .reduce((s, p) => s + p.faturamento, 0),
      comissaoPercentual: media(anunciosDaConta.map((a) => a.comissaoPercentual)),
      taxaFixa: media(anunciosDaConta.map((a) => a.taxaFixa)),
      freteMedio: 0,
      metas: null,
      reputacao: null,
    };
  });

  // Estoque: um item por SKU de cada canal. Anúncios do mesmo SKU costumam
  // dividir o mesmo estoque físico, então vale o MAIOR estoque entre eles (não
  // a soma). Venda/dia = unidades vendidas nos últimos 30 dias ÷ 30.
  const limite30 = Date.now() - 30 * 86400000;
  const vendidas = new Map<string, number>();
  for (const p of pedidos) {
    if (p.status === "cancelado" || new Date(p.data).getTime() < limite30) continue;
    const k = `${p.marketplaceId}|${p.sku}`;
    vendidas.set(k, (vendidas.get(k) ?? 0) + p.quantidade);
  }
  const porSku = new Map<string, ItemEstoqueDetalhado>();
  for (const a of rAnuncios.data ?? []) {
    const mp = marketplaceDaConta.get(a.conta_id as string);
    if (!mp || a.logistica === "full") continue;
    const sku = ((a.sku as string) ?? (a.id_externo as string)) || "";
    const k = `${mp}|${sku}`;
    const qtd = Math.max(0, num(a.estoque));
    const atual = porSku.get(k);
    if (atual) {
      atual.quantidade = Math.max(atual.quantidade, qtd);
      continue;
    }
    porSku.set(k, {
      sku,
      produto: (a.titulo as string) ?? sku,
      marketplaceId: mp,
      quantidade: qtd,
      vendasDia: 0,
      coberturaDias: 0,
      custoUnitario: cmvPorSku.get(sku) ?? 0,
      valorEstoque: 0,
      prazoFornecedorDias: PRAZO_FORNECEDOR_PADRAO,
      custoArmazenagemMensal: 0,
    });
  }
  const estoque = [...porSku.entries()].map(([k, i]) => {
    const vendasDia = Math.round(((vendidas.get(k) ?? 0) / 30) * 100) / 100;
    return {
      ...i,
      vendasDia,
      // Sem venda nos últimos 30 dias, a cobertura não tem fim: 999 = sem giro.
      coberturaDias: i.quantidade === 0 ? 0 : vendasDia > 0 ? Math.round(i.quantidade / vendasDia) : 999,
      valorEstoque: Math.round(i.quantidade * i.custoUnitario * 100) / 100,
    };
  });

  return { contas, anuncios, pedidos, estoque };
}

/** Pede ao servidor para buscar agora os anúncios e pedidos no marketplace. */
export async function sincronizarAgora(): Promise<{ erro: string | null; resumo: string }> {
  const { data, error } = await supabase.functions.invoke("mercadolivre-sincronizar", {
    method: "POST",
    body: {},
  });
  if (error) return { erro: "Não consegui falar com o servidor. Tente de novo.", resumo: "" };
  const resultados = (data?.resultados ?? []) as {
    ok: boolean;
    conta: string;
    anuncios?: number;
    pedidos?: number;
    erro?: string;
  }[];
  const falha = resultados.find((r) => !r.ok);
  if (falha) return { erro: `${falha.conta}: ${falha.erro}`, resumo: "" };
  const resumo = resultados
    .map((r) => `${r.conta}: ${r.anuncios} anúncios e ${r.pedidos} vendas`)
    .join(" · ");
  return { erro: null, resumo: resumo || "Nenhuma conta conectada." };
}
