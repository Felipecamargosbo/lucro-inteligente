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
  ConteudoPublicado,
  HistoricoAdsDia,
  HistoricoTaxaAnuncio,
  ItemEstoqueDetalhado,
  OportunidadeRecuperacao,
  Promocao,
  PromocaoAtiva,
  MarketplaceId,
  Pedido,
  StatusAnuncio,
  StatusPedido,
  TipoLogistica,
} from "@/types";

/** Alíquota usada enquanto o seller não configura o regime dele. */
const IMPOSTO_PADRAO = 0.1;

/** Situação do anúncio no canal em português; null quando está ativo normal. */
function situacaoNoCanal(status: string | null, sub: string[] | null): string | null {
  const subs = Array.isArray(sub) ? sub : [];
  if (status === "under_review" || subs.includes("under_review")) return "Inativo para revisar";
  if (status === "inactive") return "Inativo";
  if (status === "closed") return "Encerrado";
  if (status === "paused") return subs.includes("out_of_stock") ? "Pausado sem estoque" : "Pausado";
  if (status === "payment_required") return "Aguardando pagamento";
  return null;
}

/** Nome que o seller conhece para cada tipo de anúncio do Mercado Livre. */
const TIPO_ANUNCIO: Record<string, string> = { gold_special: "Clássico", gold_pro: "Premium", free: "Grátis" };

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
  /** Campanhas do canal em que cada anúncio pode entrar ou já está. */
  promocoes: Promocao[];
  /** Vendas canceladas e não pagas dos últimos 30 dias. */
  recuperacao: OportunidadeRecuperacao[];
  /** Mercado Ads: investimento, cliques e vendas por anúncio, dia a dia. */
  historicoAds: HistoricoAdsDia[];
  /** Mudanças de comissão/custo fixo detectadas na sincronização. */
  historicoTaxas: HistoricoTaxaAnuncio[];
  /** Título, descrição e ficha técnica publicados no canal (por SKU). */
  conteudos: ConteudoPublicado[];
}

/** Link do pedido no painel do vendedor, por canal. */
function linkDoPedido(marketplace: MarketplaceId, numero: string | null): string | null {
  if (!numero) return null;
  if (marketplace === "mercado-livre") return `https://www.mercadolivre.com.br/vendas/${numero}/detalhe`;
  return null;
}

/** Prazo de reposição usado enquanto o seller não informa o do fornecedor. */
const PRAZO_FORNECEDOR_PADRAO = 7;

/**
 * Lê TODAS as linhas de uma consulta, de 1000 em 1000. O banco nunca devolve
 * mais que 1000 por vez — sem isso, contas com mais vendas ou anúncios que
 * isso ficavam com dados faltando sem nenhum aviso.
 */
async function todasAsLinhas<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maximo = 50000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const todas: T[] = [];
  for (let de = 0; de < maximo; de += 1000) {
    const { data, error } = await consulta(de, de + 999);
    if (error) return { data: todas, error };
    todas.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: todas, error: null };
}

export async function carregarDadosReais(perfilId: string): Promise<DadosReais> {
  const [rContas, rConexoes, rLojasShopee, rLojasTikTok, rAnuncios, rPedidos, rProdutos, rPromocoes, rAds, rTaxas] = await Promise.all([
    supabase
      .from("contas_marketplace")
      .select("id, marketplace_id, nome, status_conexao, credencial_ref, ultima_sincronizacao, ativo, ads_status")
      .eq("perfil_id", perfilId)
      .eq("ativo", true),
    supabase.from("ml_conexoes").select("id, status").eq("perfil_id", perfilId),
    supabase.from("shopee_conexoes").select("id, status").eq("perfil_id", perfilId),
    supabase.from("tiktok_conexoes").select("id, status").eq("perfil_id", perfilId),
    todasAsLinhas((de, ate) =>
      supabase
        .from("anuncios")
        .select(
          "id, conta_id, produto_id, id_externo, sku, ean, titulo, preco_atual, preco_cheio, em_promocao, comissao_percentual, taxa_fixa, frete_unitario, custo_midia_unitario, custo_afiliado_unitario, origem_taxas, status, unidades_vendidas, data_ultima_venda, estoque, logistica, modalidade, link, foto_url, nota_media, avaliacoes_total, avaliacoes_ruins, avaliacoes_comentarios, descricao, atributos, catalogo, status_ml, sub_status_ml, user_product_id, atualizado_em",
        )
        .eq("perfil_id", perfilId)
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("pedidos")
        .select(
          "id, conta_id, anuncio_id, id_externo, data_venda, sku, produto, quantidade, preco_venda, cmv, comissao, status, status_ml, logistica, comprador, origem_valor, id_pedido_ml, frete, uf",
        )
        .eq("perfil_id", perfilId)
        .order("data_venda", { ascending: false })
        .order("id")
        .range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase.from("produtos").select("sku, cmv").eq("perfil_id", perfilId).order("sku").range(de, ate),
    ),
    todasAsLinhas((de, ate) =>
      supabase
        .from("promocoes_canal")
        .select(
          "id, conta_id, id_promocao, tipo, nome, inicio, fim, prazo_adesao, anuncio_id, status_item, preco_original, preco_promocional, preco_minimo, preco_maximo, desconto_canal_percentual, desconto_vendedor_percentual, offer_id",
        )
        .eq("perfil_id", perfilId)
        .order("id")
        .range(de, ate),
    ),
    // Só os dias com algum movimento (impressão, clique ou gasto).
    todasAsLinhas((de, ate) =>
      supabase
        .from("ads_metricas_diarias")
        .select("conta_id, anuncio_id, data, impressoes, cliques, investimento, receita, unidades")
        .eq("perfil_id", perfilId)
        .or("impressoes.gt.0,cliques.gt.0,investimento.gt.0,receita.gt.0")
        .order("data")
        .order("anuncio_id")
        .range(de, ate),
    ),
    supabase
      .from("historico_taxas_anuncio")
      .select("id, anuncio_id, sku, produto, campo, valor_anterior, valor_novo, detectado_em")
      .eq("perfil_id", perfilId)
      .gte("detectado_em", new Date(Date.now() - 90 * 86400000).toISOString())
      .order("detectado_em", { ascending: false })
      .limit(1000),
  ]);

  for (const r of [rContas, rConexoes, rLojasShopee, rLojasTikTok, rAnuncios, rPedidos, rProdutos, rPromocoes, rAds, rTaxas]) {
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

  // Anúncio que aparece em alguma campanha do canal = elegível a promoção.
  const emCampanha = new Set(
    (rPromocoes.data ?? []).map((p) => p.anuncio_id as string | null).filter(Boolean) as string[],
  );

  // Promoção em andamento no canal, por anúncio (a de menor preço vale).
  const campanhaAtivaPorAnuncio = new Map<string, Record<string, unknown>>();
  for (const p of rPromocoes.data ?? []) {
    if (p.status_item !== "started" || !p.anuncio_id) continue;
    const atual = campanhaAtivaPorAnuncio.get(p.anuncio_id as string);
    if (!atual || num(p.preco_promocional) < num(atual.preco_promocional)) {
      campanhaAtivaPorAnuncio.set(p.anuncio_id as string, p);
    }
  }
  /** O que o cliente paga hoje: o canal mostra preço riscado (original) quando
   * há promoção valendo, qualquer que seja ela. */
  const promocaoAtivaDe = (a: Record<string, unknown>): PromocaoAtiva | null => {
    const camp = campanhaAtivaPorAnuncio.get(a.id as string);
    const preco = num(a.preco_atual);
    const cheio = a.preco_cheio === null || a.preco_cheio === undefined ? null : num(a.preco_cheio);
    // O ML devolve parte do desconto como redução de tarifa (% do preço cheio).
    const rebateEm = (base: number) =>
      camp && num(camp.desconto_canal_percentual) > 0
        ? Math.round(base * num(camp.desconto_canal_percentual)) / 100
        : 0;
    if (cheio !== null && cheio > preco) {
      return {
        nome: (camp?.nome as string) ?? "Desconto no preço",
        tipo: (camp?.tipo as string) ?? null,
        preco,
        precoCheio: cheio,
        fim: (camp?.fim as string | null) ?? null,
        rebate: rebateEm(num(camp?.preco_original) || cheio),
      };
    }
    if (camp && num(camp.preco_promocional) > 0 && num(camp.preco_promocional) < preco) {
      return {
        nome: (camp.nome as string) ?? "Promoção",
        tipo: (camp.tipo as string) ?? null,
        preco: num(camp.preco_promocional),
        precoCheio: preco,
        fim: (camp.fim as string | null) ?? null,
        rebate: rebateEm(num(camp.preco_original) || preco),
      };
    }
    return null;
  };

  const anuncios: Anuncio[] = (rAnuncios.data ?? [])
    .filter((a) => marketplaceDaConta.has(a.conta_id as string))
    .map((a) => ({
      id: a.id as string,
      marketplaceId: marketplaceDaConta.get(a.conta_id as string)!,
      contaId: a.conta_id as string,
      sku: (a.sku as string) ?? (a.id_externo as string),
      ean: (a.ean as string | null) ?? null,
      produto: (a.titulo as string) ?? (a.id_externo as string),
      tipoAnuncio: a.modalidade ? (TIPO_ANUNCIO[a.modalidade as string] ?? (a.modalidade as string)) : null,
      catalogo: a.catalogo === null || a.catalogo === undefined ? null : Boolean(a.catalogo),
      situacaoCanal: situacaoNoCanal(a.status_ml as string | null, a.sub_status_ml as string[] | null),
      grupoEstoque: (a.user_product_id as string | null) ?? null,
      idExterno: (a.id_externo as string | null) ?? null,
      fotoUrl: (a.foto_url as string | null) ?? null,
      statusCanal: (a.status_ml as string | null) ?? null,
      atualizadoEm: (a.atualizado_em as string | null) ?? null,
      promocaoAtiva: promocaoAtivaDe(a),
      avaliacao:
        a.avaliacoes_total === null || a.avaliacoes_total === undefined
          ? null
          : {
              nota: a.nota_media === null ? null : num(a.nota_media),
              total: num(a.avaliacoes_total),
              ruins: num(a.avaliacoes_ruins),
              comentarios: Array.isArray(a.avaliacoes_comentarios) ? (a.avaliacoes_comentarios as string[]) : [],
            },
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
      elegivelPromocao: emCampanha.has(a.id as string),
      unidadesVendidas: num(a.unidades_vendidas),
      dataUltimaVenda: (a.data_ultima_venda as string | null) ?? null,
      roasObjetivo: null,
    }));

  // CMV de cada venda: o custo cadastrado no catálogo (Produtos) para o SKU.
  const cmvPorSku = new Map(
    (rProdutos.data ?? []).map((p) => [p.sku as string, num(p.cmv)]),
  );

  // Tarifa de cada anúncio (para o Auditor conferir a comissão de cada venda).
  const tarifaPorAnuncio = new Map(
    (rAnuncios.data ?? []).map((a) => [
      a.id as string,
      {
        comissaoPercentual: num(a.comissao_percentual),
        taxaFixaUnidade: num(a.taxa_fixa),
        tipo: a.modalidade ? (TIPO_ANUNCIO[a.modalidade as string] ?? (a.modalidade as string)) : null,
      },
    ]),
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
        anuncioId: (p.anuncio_id as string | null) ?? null,
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
        tarifaAnuncio: p.anuncio_id ? tarifaPorAnuncio.get(p.anuncio_id as string) : undefined,
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
      adsStatus: (c.ads_status as string | null) ?? null,
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

  // Promoções do canal → mesmo formato da tela de Promoções.
  const anuncioPorId = new Map(anuncios.map((a) => [a.id, a]));
  const linkPorAnuncio = new Map(
    (rAnuncios.data ?? []).map((a) => [a.id as string, (a.link as string | null) ?? null]),
  );
  const promocoes: Promocao[] = [];
  for (const p of rPromocoes.data ?? []) {
    const a = p.anuncio_id ? anuncioPorId.get(p.anuncio_id as string) : undefined;
    if (!a) continue; // anúncio de conta desconectada ou ainda não sincronizado
    const original = num(p.preco_original) || a.precoAtual;
    const promocional = num(p.preco_promocional) || original;
    promocoes.push({
      id: p.id as string,
      marketplaceId: a.marketplaceId,
      sku: a.sku,
      produto: a.produto,
      precoAtual: original,
      tipo: (p.nome as string) ?? (p.tipo as string) ?? "Campanha",
      // Parte que o ML banca, devolvida como redução de tarifa por venda.
      rebate:
        num(p.desconto_canal_percentual) > 0 ? Math.round(original * num(p.desconto_canal_percentual)) / 100 : 0,
      precoFinal: promocional,
      cmv: cmvPorSku.get(a.sku) ?? 0,
      impostoPercentual: aliquota,
      comissaoPercentual: a.comissaoPercentual,
      taxaFixa: a.taxaFixa,
      campanha: (p.nome as string) ?? undefined,
      situacao: ["started", "pending"].includes(p.status_item as string) ? "participando" : "disponivel",
      fim: (p.fim as string | null) ?? null,
      prazoAdesao: (p.prazo_adesao as string | null) ?? null,
      precoMinimo: p.preco_minimo === null ? null : num(p.preco_minimo),
      precoMaximo: p.preco_maximo === null ? null : num(p.preco_maximo),
      descontoCanalPercentual: p.desconto_canal_percentual === null ? null : num(p.desconto_canal_percentual),
      link: linkPorAnuncio.get(a.id) ?? null,
      tipoAnuncio: a.tipoAnuncio ?? null,
      anuncioId: a.id,
      contaId: a.contaId,
      idPromocao: (p.id_promocao as string) ?? undefined,
      tipoPromocao: (p.tipo as string | null) ?? null,
      offerId: (p.offer_id as string | null) ?? null,
      inicio: (p.inicio as string | null) ?? null,
      descontoVendedorPercentual:
        p.desconto_vendedor_percentual === null || p.desconto_vendedor_percentual === undefined
          ? null
          : num(p.desconto_vendedor_percentual),
    });
  }

  // Recuperação: vendas canceladas e não pagas dos últimos 30 dias. O canal
  // não informa telefone nem e-mail do comprador, então o contato é pelo
  // próprio painel do canal (linkCanal).
  const limiteRecuperacao = Date.now() - 30 * 86400000;
  const statusMlPorId = new Map(
    (rPedidos.data ?? []).map((p) => [p.id as string, (p.status_ml as string | null) ?? null]),
  );
  const recuperacao: OportunidadeRecuperacao[] = [];
  const vistos = new Set<string>();
  for (const p of pedidos) {
    if (new Date(p.data).getTime() < limiteRecuperacao) continue;
    const statusMl = statusMlPorId.get(p.id);
    const naoPago = statusMl === "payment_required" || statusMl === "payment_in_process";
    if (p.status !== "cancelado" && !naoPago) continue;
    const numero = p.numero ?? p.id;
    const chave = `${p.contaId}|${numero}`;
    if (vistos.has(chave)) continue; // um pedido com vários itens vira uma linha só
    vistos.add(chave);
    const itensDoPedido = pedidos.filter((x) => x.contaId === p.contaId && (x.numero ?? x.id) === numero);
    recuperacao.push({
      id: p.id,
      cliente: p.cliente || "Comprador",
      telefone: "",
      pedidoId: numero,
      anuncioId: p.anuncioId ?? null,
      sku: p.sku,
      produto: itensDoPedido.length > 1 ? `${p.produto} (+${itensDoPedido.length - 1} item)` : p.produto,
      marketplaceId: p.marketplaceId,
      contaId: p.contaId,
      valor: itensDoPedido.reduce((s, x) => s + x.faturamento, 0),
      tipo: naoPago ? "pagamento-pendente" : "venda-cancelada",
      tempoRestante: naoPago ? "Até o canal cancelar" : "—",
      status: "aguardando-acao",
      dataCriacao: p.data,
      dataUltimoContato: null,
      linkCanal: linkDoPedido(p.marketplaceId, p.numero ?? null),
    });
  }

  // Mercado Ads: histórico por anúncio/dia, os totais dos últimos 30 dias em
  // cada anúncio (o Agente de Ads usa) e o investimento do dia rateado entre
  // as vendas daquele anúncio no mesmo dia (vendas via ADS).
  const historicoAds: HistoricoAdsDia[] = (rAds.data ?? [])
    .filter((h) => h.anuncio_id && anuncioPorId.has(h.anuncio_id as string))
    .map((h) => ({
      data: String(h.data).slice(0, 10),
      anuncioId: h.anuncio_id as string,
      contaId: h.conta_id as string,
      investimento: num(h.investimento),
      impressoes: num(h.impressoes),
      cliques: num(h.cliques),
      vendasAtribuidas: num(h.unidades),
      faturamentoAtribuido: num(h.receita),
    }));
  const limiteAds30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const adsPorAnuncio = new Map<string, NonNullable<Anuncio["ads"]>>();
  for (const h of historicoAds) {
    if (h.data < limiteAds30) continue;
    const t = adsPorAnuncio.get(h.anuncioId) ?? { investimento: 0, impressoes: 0, cliques: 0, vendasAtribuidas: 0 };
    t.investimento += h.investimento;
    t.impressoes += h.impressoes;
    t.cliques += h.cliques;
    t.vendasAtribuidas += h.vendasAtribuidas;
    adsPorAnuncio.set(h.anuncioId, t);
  }
  for (const a of anuncios) {
    const t = adsPorAnuncio.get(a.id);
    if (t) a.ads = t;
  }
  const diaBr = (iso: string) => new Date(iso).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const vendasPorAnuncioDia = new Map<string, Pedido[]>();
  const anuncioDoPedido = new Map(
    (rPedidos.data ?? []).map((p) => [p.id as string, (p.anuncio_id as string | null) ?? null]),
  );
  for (const p of pedidos) {
    const anuncioId = anuncioDoPedido.get(p.id);
    if (!anuncioId || p.status === "cancelado") continue;
    const k = `${anuncioId}|${diaBr(p.data)}`;
    const lista = vendasPorAnuncioDia.get(k) ?? [];
    lista.push(p);
    vendasPorAnuncioDia.set(k, lista);
  }
  for (const h of historicoAds) {
    if (h.investimento <= 0 || h.vendasAtribuidas <= 0) continue;
    const vendas = vendasPorAnuncioDia.get(`${h.anuncioId}|${h.data}`);
    if (!vendas?.length) continue;
    // O canal diz quantas unidades vieram de ADS naquele dia: marca até essa
    // quantidade de vendas e divide o investimento do dia entre elas.
    const marcadas: Pedido[] = [];
    let unidades = 0;
    for (const v of vendas) {
      if (unidades >= h.vendasAtribuidas) break;
      marcadas.push(v);
      unidades += v.quantidade;
    }
    const parte = h.investimento / marcadas.length;
    for (const v of marcadas) v.custoMidia += Math.round(parte * 100) / 100;
  }

  // Mudanças de tarifa (o Auditor mostra o antes/depois e as vendas afetadas).
  const historicoTaxas: HistoricoTaxaAnuncio[] = (rTaxas.data ?? [])
    .filter((t) => t.anuncio_id && anuncioPorId.has(t.anuncio_id as string))
    .map((t) => ({
      id: t.id as string,
      anuncioId: t.anuncio_id as string,
      sku: (t.sku as string) ?? "",
      produto: (t.produto as string) ?? "",
      marketplaceId: anuncioPorId.get(t.anuncio_id as string)!.marketplaceId,
      campo: t.campo as HistoricoTaxaAnuncio["campo"],
      valorAnterior: num(t.valor_anterior),
      valorNovo: num(t.valor_novo),
      detectadoEm: t.detectado_em as string,
    }));

  // O anúncio como está publicado no canal — o SAC responde com base nele e o
  // Criativo avalia o que melhorar. Um por SKU (o que tiver descrição).
  const conteudoPorSku = new Map<string, ConteudoPublicado>();
  for (const a of rAnuncios.data ?? []) {
    if (!marketplaceDaConta.has(a.conta_id as string)) continue;
    const sku = ((a.sku as string) ?? (a.id_externo as string)) || "";
    const atual = conteudoPorSku.get(sku);
    const descricao = (a.descricao as string | null) ?? "";
    if (atual && (atual.descricao || !descricao)) continue;
    conteudoPorSku.set(sku, {
      sku,
      titulo: (a.titulo as string) ?? sku,
      descricao,
      atributos: Array.isArray(a.atributos) ? (a.atributos as { nome: string; valor: string }[]) : [],
      origem: "api",
    });
  }
  const conteudos = [...conteudoPorSku.values()];

  return { contas, anuncios, pedidos, estoque, promocoes, recuperacao, historicoAds, historicoTaxas, conteudos };
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
