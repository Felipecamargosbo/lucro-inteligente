// Camada de serviços: hoje devolve dados fictícios locais.
// No futuro, cada função aqui será trocada por uma chamada às APIs
// dos marketplaces / banco de dados, sem alterar as páginas.

import {
  ANUNCIOS,
  CAMPANHAS,
  ESTOQUE,
  ESTOQUE_DETALHADO,
  RESUMO_ESTOQUE,
  FULFILLMENT_DETALHADO,
  RESUMO_FULFILLMENT,
  HISTORICO_PRECOS,
  HISTORICO_ADS,
  HISTORICO_TAXAS,
  COBRANCAS_FULL,
  LOGS,
  MARKETPLACES,
  NOTIFICACOES,
  OPORTUNIDADES_RECUPERACAO,
  PEDIDOS,
  PRODUTOS_CATALOGO,
  PROMOCOES,
  MUDANCAS_PRECO_EXEMPLO,
  FICHAS_ANUNCIO,
  CONTEUDOS_PUBLICADOS,
  USUARIOS,
  contasDoCanal,
  getCampanha,
  getConta,
  obterContasAtuais,
} from "@/data/mock";
import { CONFIGURACAO_SAC_PADRAO, MODELOS_SAC_PADRAO } from "@/lib/sac";
import { CONFIGURACAO_CRIATIVO_PADRAO, LIMITES_TITULO_PADRAO } from "@/lib/criativo";
import type { AjusteCusto, ModoAds } from "@/lib/precificacao";
import type {
  AcaoAds,
  AgenteId,
  CategoriaSac,
  ConfiguracaoCriativo,
  ConteudoPublicado,
  ConfiguracaoSac,
  OrigemCriativo,
  DirecaoPreco,
  RegraSac,
  SituacaoSac,
  TomSac,
  AlertaEstoque,
  Anuncio,
  ContaMarketplace,
  EventoAds,
  EventoAgente,
  InsightAnalista,
  MarketplaceId,
  MetasMargem,
  OcorrenciaAuditor,
  Produto,
  SemaforoDecisao,
  StatusSugestao,
  SugestaoCriativo,
  StatusOcorrenciaAuditor,
  TicketSac,
  TipoAcaoAds,
  TipoEventoAds,
  TipoInsightAnalista,
  DetalheAcaoAds,
} from "@/types";
import { supabase } from "@/lib/supabase";

export const vendasService = {
  listar: () => PEDIDOS,
  buscarPorId: (id: string) => PEDIDOS.find((p) => p.id === id) ?? null,
  cancelados: () => PEDIDOS.filter((p) => p.status === "cancelado"),
};

export const anunciosService = {
  listar: () => ANUNCIOS,
  buscarPorId: (id: string) => ANUNCIOS.find((a) => a.id === id) ?? null,
  historicoPrecos: () => HISTORICO_PRECOS,
  /** Registra novo preço e guarda a alteração no histórico. */
  alterarPreco: (anuncioId: string, novoPreco: number, usuario: string) => {
    const anuncio = ANUNCIOS.find((a) => a.id === anuncioId);
    if (!anuncio) return null;
    const anterior = anuncio.precoAtual;
    anuncio.precoAtual = novoPreco;
    HISTORICO_PRECOS.unshift({
      id: `hp-${Date.now()}`,
      data: new Date().toISOString(),
      sku: anuncio.sku,
      produto: anuncio.produto,
      marketplaceId: anuncio.marketplaceId,
      precoAnterior: anterior,
      precoNovo: novoPreco,
      usuario,
    });
    return anuncio;
  },
  /**
   * Simula o "Sincronizar agora": no mundo real, isso chama o feed de
   * LISTAGENS do marketplace (não o de vendas) e traz todo anúncio publicado,
   * vendido ou não. Aqui, cada clique fabrica 1 anúncio novo com 0 vendas —
   * às vezes com SKU que já existe no catálogo (auto-vínculo por SKU/EAN,
   * o CMV já vem pronto), às vezes com SKU inédito (cai em Pendências, sem
   * vínculo, até o seller resolver).
   */
  puxarNovoAnuncio: (conta: ContaMarketplace): Anuncio => {
    // Olha todo SKU que essa conta já tem — vinculado ou ainda pendente —
    // pra nunca puxar o mesmo duas vezes. Antes só olhava o vinculado, e
    // por isso "Receber anúncios" clicado de novo podia duplicar um
    // pendente que já estava esperando "Vincular".
    const skusExistentes = new Set(
      ANUNCIOS.filter((a) => a.contaId === conta.id).map((a) => a.sku),
    );
    const catalogoDisponivel = PRODUTOS_CATALOGO.filter((p) => !skusExistentes.has(p.sku));
    const autoVincula = catalogoDisponivel.length > 0 && Math.random() > 0.5;
    const produtoBase = autoVincula
      ? catalogoDisponivel[Math.floor(Math.random() * catalogoDisponivel.length)]!
      : null;

    const sufixo = Math.random().toString(36).slice(2, 7).toUpperCase();
    const sku = produtoBase ? produtoBase.sku : `NOVO-${sufixo}`;
    const nome = produtoBase ? produtoBase.nome : `Produto novo ${sufixo}`;
    const precoAtual = produtoBase
      ? Math.round(produtoBase.cmv * 2.2 * 100) / 100
      : Math.round((99 + Math.random() * 300) * 100) / 100;

    const novoAnuncio: Anuncio = {
      id: `${conta.id}-${sku}-${Date.now()}`,
      marketplaceId: conta.marketplaceId,
      contaId: conta.id,
      sku,
      produto: nome,
      precoAtual,
      precoCheio: null,
      emPromocao: false,
      ean: null,
      cmv: produtoBase ? produtoBase.cmv : null,
      impostoPercentual: 0.1,
      comissaoPercentual: conta.comissaoPercentual,
      taxaFixa: conta.taxaFixa,
      freteUnitario: 0,
      custoMidiaUnitario: 0,
      ads: null,
      custoAfiliadoUnitario: 0,
      origemTaxas: "estimado",
      produtoId: produtoBase ? produtoBase.id : null,
      status: "ativo",
      elegivelPromocao: false,
      // Recém-publicado: ainda não vendeu nada — é isso que prova que ele
      // vem da listagem, não do histórico de vendas. Sem venda nenhuma,
      // não há "parado há X dias": o agente de giro ignora este anúncio
      // até a primeira venda acontecer.
      unidadesVendidas: 0,
      dataUltimaVenda: null,
      // Recém-criado, sem Ads — sem objetivo de ROAS ainda.
      roasObjetivo: null,
    };

    ANUNCIOS.push(novoAnuncio);
    return novoAnuncio;
  },
  /**
   * "Receber anúncios" no modo específico: busca (aqui, fabrica) um único
   * anúncio com o SKU e/ou EAN que o seller informou, em vez de um
   * qualquer aleatório. Fica sem CMV — o vínculo com o produto real
   * acontece pelo SKU assim que a tela de Custos carregar de novo.
   */
  puxarAnuncioEspecifico: (
    conta: ContaMarketplace,
    busca: { sku?: string; ean?: string },
  ): Anuncio => {
    const sku = busca.sku?.trim() || `EAN-${busca.ean?.trim()}`;

    // Essa conta já tem um anúncio com esse SKU? Não duplica — devolve o
    // que já existe, pendente ou não.
    const existente = ANUNCIOS.find((a) => a.contaId === conta.id && a.sku === sku);
    if (existente) return existente;

    const precoAtual = Math.round((99 + Math.random() * 300) * 100) / 100;

    const novoAnuncio: Anuncio = {
      id: `${conta.id}-${sku}-${Date.now()}`,
      marketplaceId: conta.marketplaceId,
      contaId: conta.id,
      sku,
      ean: busca.ean?.trim() || null,
      produto: `Anúncio ${sku}`,
      precoAtual,
      precoCheio: null,
      emPromocao: false,
      cmv: null,
      impostoPercentual: 0.1,
      comissaoPercentual: conta.comissaoPercentual,
      taxaFixa: conta.taxaFixa,
      freteUnitario: 0,
      custoMidiaUnitario: 0,
      ads: null,
      custoAfiliadoUnitario: 0,
      origemTaxas: "estimado",
      produtoId: null,
      status: "ativo",
      elegivelPromocao: false,
      unidadesVendidas: 0,
      dataUltimaVenda: null,
      // Recém-criado, sem Ads — sem objetivo de ROAS ainda.
      roasObjetivo: null,
    };

    ANUNCIOS.push(novoAnuncio);
    return novoAnuncio;
  },
  /** Remove um anúncio sem vínculo da lista — pra descartar duplicata ou
   * anúncio de exemplo que o seller não quer nem vincular. Só existe
   * enquanto o anúncio for fictício: quando vier de verdade da API, o
   * "descartar" muda de sentido (arquivar no marketplace), não é isto. */
  dispensar: (anuncioId: string): boolean => {
    const indice = ANUNCIOS.findIndex((a) => a.id === anuncioId);
    if (indice === -1) return false;
    ANUNCIOS.splice(indice, 1);
    return true;
  },
};

/**
 * Catálogo de produtos — fonte única do CMV. Agora é a tabela real
 * `produtos` do Supabase (RLS: cada perfil só vê e só grava o próprio
 * dado — por isso toda função abaixo pede o `perfilId` explicitamente,
 * em vez de assumir uma sessão global).
 *
 * Os ANÚNCIOS continuam fictícios (dependem da API do marketplace, que
 * depende do CNPJ) — por isso o vínculo entre um produto real e os
 * anúncios de exemplo é feito por SKU, não pelo id antigo do mock: um
 * id de mock nunca vai bater com um id gerado pelo Supabase.
 */
export const produtosService = {
  listar: async (perfilId: string): Promise<Produto[]> => {
    // "*" em vez de listar as colunas: assim funciona antes e depois de a
    // coluna "categoria" existir no banco (SQL da tela Precificação).
    const { data, error } = await supabase
      .from("produtos")
      .select("*")
      .eq("perfil_id", perfilId)
      .eq("ativo", true)
      .order("nome");
    if (error) {
      console.error("produtosService.listar:", error.message);
      return [];
    }
    return (data ?? []).map((p) => ({
      id: p.id as string,
      sku: p.sku as string,
      ean: (p.ean as string | null) ?? null,
      nome: p.nome as string,
      cmv: Number(p.cmv) || 0,
      categoria: (p.categoria as string | null | undefined) ?? null,
    }));
  },
  /** Muda só a categoria do produto (vazio = sem categoria). */
  atualizarCategoria: async (produtoId: string, categoria: string | null): Promise<string | null> => {
    const valor = categoria && categoria.trim() ? categoria.trim() : null;
    const { error } = await supabase.from("produtos").update({ categoria: valor }).eq("id", produtoId);
    return error?.message ?? null;
  },
  /**
   * Casa os produtos reais com os anúncios de exemplo pelo SKU, e propaga
   * `produtoId` + `cmv` para cada um. É o que faz o resto do app (Vendas,
   * Dashboard, Raio-X) enxergar o CMV real sem cada tela precisar saber
   * que o catálogo agora vem do banco.
   */
  reconciliarComAnuncios: (produtos: Produto[]) => {
    const porSku = new Map(produtos.map((p) => [p.sku, p]));
    for (const a of ANUNCIOS) {
      const produto = porSku.get(a.sku);
      if (produto) {
        a.produtoId = produto.id;
        a.cmv = produto.cmv;
      } else if (a.produtoId && !produtos.some((p) => p.id === a.produtoId)) {
        // Produto antigo (do mock) que não existe mais no catálogo real:
        // volta para "sem vínculo" em vez de mentir um CMV que já não vale.
        a.produtoId = null;
      }
    }
  },
  /** Cria um produto novo, direto (sem partir de um anúncio). */
  criar: async (
    perfilId: string,
    dados: { sku: string; ean?: string | null; nome: string; cmv: number },
  ): Promise<{ produto: Produto | null; erro: string | null }> => {
    const { data, error } = await supabase
      .from("produtos")
      .insert({
        perfil_id: perfilId,
        sku: dados.sku,
        ean: dados.ean ?? null,
        nome: dados.nome,
        cmv: dados.cmv,
      })
      .select("id, sku, ean, nome, cmv")
      .single();
    if (error) {
      const duplicado = error.code === "23505";
      return {
        produto: null,
        erro: duplicado ? `Já existe um produto com o SKU "${dados.sku}".` : error.message,
      };
    }
    for (const a of ANUNCIOS) {
      if (a.sku === data.sku) {
        a.produtoId = data.id;
        a.cmv = data.cmv;
      }
    }
    return { produto: data, erro: null };
  },
  /** Cria um produto novo a partir de um anúncio sem vínculo — atalho de
   * `criar` que já preenche SKU e nome a partir do anúncio. */
  criarAPartirDeAnuncio: (
    perfilId: string,
    anuncioId: string,
    dados: { cmv: number; ean?: string | null },
  ) => {
    const anuncio = ANUNCIOS.find((a) => a.id === anuncioId);
    if (!anuncio) return Promise.resolve({ produto: null, erro: "Anúncio não encontrado." });
    return produtosService.criar(perfilId, {
      sku: anuncio.sku,
      ean: dados.ean,
      nome: anuncio.produto,
      cmv: dados.cmv,
    });
  },
  /** Vincula um anúncio a um produto já existente no catálogo — o CMV do
   * anúncio passa a vir do produto a partir de agora. Só mexe no anúncio
   * (fictício), não grava nada no Supabase. */
  vincular: (anuncioId: string, produto: Produto) => {
    const anuncio = ANUNCIOS.find((a) => a.id === anuncioId);
    if (!anuncio) return null;
    anuncio.produtoId = produto.id;
    anuncio.cmv = produto.cmv;
    return anuncio;
  },
  /** Muda o CMV no catálogo e espalha o novo valor para todo anúncio
   * vinculado (por SKU), em qualquer marketplace. */
  atualizarCmv: async (
    produtoId: string,
    novoCmv: number,
  ): Promise<{ produto: Produto | null; erro: string | null }> => {
    const { data, error } = await supabase
      .from("produtos")
      .update({ cmv: novoCmv })
      .eq("id", produtoId)
      .select("id, sku, ean, nome, cmv")
      .single();
    if (error) return { produto: null, erro: error.message };
    for (const a of ANUNCIOS) {
      if (a.sku === data.sku) a.cmv = data.cmv;
    }
    return { produto: data, erro: null };
  },
  /** Edita SKU, nome, EAN e CMV de um produto já cadastrado — corrige erro
   * de digitação sem precisar apagar e recriar. Como o vínculo com o
   * anúncio é sempre recalculado por SKU, mudar o SKU aqui já re-liga
   * (ou desliga) os anúncios corretos na próxima leitura. */
  atualizar: async (
    produtoId: string,
    dados: { sku: string; nome: string; ean: string | null; cmv: number },
  ): Promise<{ produto: Produto | null; erro: string | null }> => {
    const { data, error } = await supabase
      .from("produtos")
      .update({ sku: dados.sku, nome: dados.nome, ean: dados.ean, cmv: dados.cmv })
      .eq("id", produtoId)
      .select("id, sku, ean, nome, cmv")
      .single();
    if (error) {
      const duplicado = error.code === "23505";
      return {
        produto: null,
        erro: duplicado ? `Já existe um produto com o SKU "${dados.sku}".` : error.message,
      };
    }
    return { produto: data, erro: null };
  },
  /** Desativa um produto (soft delete — some das listas, mas nada é perdido). */
  remover: async (produtoId: string): Promise<string | null> => {
    const { error } = await supabase.from("produtos").update({ ativo: false }).eq("id", produtoId);
    return error?.message ?? null;
  },
  /** Quantos anúncios (e em quais marketplaces) usam este produto hoje.
   * Só é confiável depois de `reconciliarComAnuncios`. */
  cobertura: (produtoId: string) => {
    const vinculados = ANUNCIOS.filter((a) => a.produtoId === produtoId);
    const marketplaces = [...new Set(vinculados.map((a) => a.marketplaceId))];
    return { totalAnuncios: vinculados.length, marketplaces };
  },
};

/**
 * Mudanças de preço feitas na tela Precificação (tabela
 * `alteracoes_preco`). Sem API ainda, o marketplace não muda sozinho: o
 * NEXO guarda o preço novo, passa a usá-lo nas contas e o Agente de
 * Precificação mede o "antes x depois". Com a API, é aqui que entra o
 * envio pro marketplace.
 */
export interface AlteracaoPrecoRegistrada {
  id: string;
  anuncioId: string;
  contaId: string | null;
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  precoAntes: number;
  precoDepois: number;
  data: string;
}

export const alteracoesPrecoService = {
  listar: async (perfilId: string): Promise<AlteracaoPrecoRegistrada[]> => {
    const { data, error } = await supabase
      .from("alteracoes_preco")
      .select("*")
      .eq("perfil_id", perfilId)
      .order("criado_em", { ascending: false })
      .limit(1000);
    if (error) {
      console.error("alteracoesPrecoService.listar:", error.message);
      return [];
    }
    return (data ?? []).map((l) => ({
      id: l.id as string,
      anuncioId: l.anuncio_id as string,
      contaId: (l.conta_id as string | null) ?? null,
      sku: l.sku as string,
      produto: l.produto as string,
      marketplaceId: l.marketplace_id as MarketplaceId,
      precoAntes: Number(l.preco_antes),
      precoDepois: Number(l.preco_depois),
      data: l.criado_em as string,
    }));
  },

  /** Grava a mudança e já troca o preço do anúncio no NEXO. */
  registrar: async (
    perfilId: string,
    anuncio: Anuncio,
    precoNovo: number,
    usuario: string,
  ): Promise<string | null> => {
    const precoAntes = anuncio.precoAtual;
    const { error } = await supabase.from("alteracoes_preco").insert({
      perfil_id: perfilId,
      anuncio_id: anuncio.id,
      conta_id: anuncio.contaId,
      sku: anuncio.sku,
      produto: anuncio.produto,
      marketplace_id: anuncio.marketplaceId,
      preco_antes: Math.round(precoAntes * 100) / 100,
      preco_depois: Math.round(precoNovo * 100) / 100,
      origem: "manual",
    });
    if (error) return error.message;
    anunciosService.alterarPreco(anuncio.id, Math.round(precoNovo * 100) / 100, usuario);
    return null;
  },

  /** Depois de recarregar a página, o anúncio volta ao preço fictício —
   * isto reaplica o último preço que o seller salvou em cada anúncio. */
  aplicarNosAnuncios: (alteracoes: AlteracaoPrecoRegistrada[]) => {
    const vistos = new Set<string>();
    // A lista vem da mais nova pra mais antiga: a primeira de cada anúncio vale.
    for (const alt of alteracoes) {
      if (vistos.has(alt.anuncioId)) continue;
      vistos.add(alt.anuncioId);
      const anuncio = ANUNCIOS.find((a) => a.id === alt.anuncioId);
      if (anuncio) anuncio.precoAtual = alt.precoDepois;
    }
  },
};

/** O que o seller ajustou nas colunas Ads e Outros da tela Precificação,
 * anúncio por anúncio (tabela `ajustes_custo_anuncio`). */
export const ajustesCustoService = {
  /** Mapa id do anúncio → ajuste. Anúncio fora do mapa = tudo automático. */
  listar: async (perfilId: string): Promise<Map<string, AjusteCusto>> => {
    const mapa = new Map<string, AjusteCusto>();
    const { data, error } = await supabase
      .from("ajustes_custo_anuncio")
      .select("*")
      .eq("perfil_id", perfilId);
    if (error) {
      console.error("ajustesCustoService.listar:", error.message);
      return mapa;
    }
    for (const l of data ?? []) {
      mapa.set(l.anuncio_id as string, {
        adsModo: (l.ads_modo as ModoAds) ?? "auto",
        adsValor: Number(l.ads_valor) || 0,
        ignorados: Array.isArray(l.ignorados) ? (l.ignorados as string[]) : [],
        custoExtra: Number(l.custo_extra) || 0,
      });
    }
    return mapa;
  },

  /** Grava o mesmo ajuste em um ou vários anúncios (ex.: "todos os
   * anúncios deste produto"). */
  salvar: async (
    perfilId: string,
    anuncioIds: string[],
    ajuste: AjusteCusto,
  ): Promise<string | null> => {
    const agora = new Date().toISOString();
    const { error } = await supabase.from("ajustes_custo_anuncio").upsert(
      anuncioIds.map((id) => ({
        perfil_id: perfilId,
        anuncio_id: id,
        ads_modo: ajuste.adsModo,
        ads_valor: ajuste.adsValor,
        ignorados: ajuste.ignorados,
        custo_extra: ajuste.custoExtra,
        atualizado_em: agora,
      })),
      { onConflict: "perfil_id,anuncio_id" },
    );
    return error?.message ?? null;
  },
};

export const promocoesService = {
  listar: () => PROMOCOES,
};

/** Histórico de mudanças de preço. Por enquanto só os exemplos fictícios;
 * as aprovações do seller entram pela própria tela de Agentes (vêm das
 * sugestões aprovadas em `eventos_agente`). */
export const mudancasPrecoService = {
  exemplos: () => MUDANCAS_PRECO_EXEMPLO,
};

export const campanhasService = {
  listar: () => CAMPANHAS,
  buscarPorId: (id: string | null) => getCampanha(id) ?? null,
  /** Pedidos que saíram por esta campanha. */
  pedidosDaCampanha: (campanhaId: string) =>
    PEDIDOS.filter((p) => p.campanhaId === campanhaId),
};

/* ------------------------------------------------------------------ */
/* Alertas de Estoque e Fulfillment — leitura e gravação comuns         */
/* ------------------------------------------------------------------ */

/** Campos opcionais do Bloco 4 que vão e voltam do `dados` do banco. */
const CAMPOS_EXTRAS_ALERTA_ESTOQUE = [
  "tipoAlerta",
  "prazoFornecedorDias",
  "diasParaPedir",
  "diasSemEstoque",
  "custoUnitario",
  "custoReposicao",
  "veredito",
  "motivoVeredito",
  "classeAbc",
  "margem30d",
  "prazoEnvioFullDias",
  "estoqueProprio",
  "quantidadeEnviar",
  "quantidadeComprar",
  "custoArmazenagemMensal",
  "quantidadeRetirar",
  "custoRetirada",
  "economiaMensal",
] as const;

/** Como uma linha de `eventos_agente` vira um AlertaEstoque (serve pros
 * dois agentes). Alertas gravados antes do Bloco 4 não têm os campos
 * extras — eles ficam `undefined` e a tela mostra só o básico. */
function linhaParaAlertaEstoque(l: {
  id: string;
  conta_id: string | null;
  criado_em: string;
  status: string;
  decidido_em: string | null;
  dados: Record<string, unknown>;
}): AlertaEstoque {
  const d = l.dados ?? {};
  const extras: Record<string, unknown> = {};
  for (const campo of CAMPOS_EXTRAS_ALERTA_ESTOQUE) {
    if (d[campo] !== undefined) extras[campo] = d[campo];
  }
  return {
    id: l.id,
    data: l.criado_em,
    contaId: l.conta_id,
    sku: (d.sku as string) ?? "",
    produto: (d.produto as string) ?? "",
    marketplaceId: d.marketplaceId as MarketplaceId,
    estoqueAtual: (d.estoqueAtual as number) ?? 0,
    vendidoUltimos7Dias: (d.vendidoUltimos7Dias as number) ?? 0,
    mediaDiaria: (d.mediaDiaria as number) ?? 0,
    diasRestantes: (d.diasRestantes as number) ?? 0,
    quantidadeSugerida: (d.quantidadeSugerida as number) ?? 0,
    diasAlvoCobertura: (d.diasAlvoCobertura as number) ?? 30,
    status: l.status as StatusSugestao,
    decididoEm: l.decidido_em,
    ...(extras as Partial<AlertaEstoque>),
  };
}

/** O que vai no `dados` do banco: o básico + os campos do Bloco 4. */
function dadosAlertaEstoque(
  alerta: Omit<AlertaEstoque, "id" | "status" | "decididoEm" | "data">,
): Record<string, unknown> {
  const dados: Record<string, unknown> = {
    sku: alerta.sku,
    produto: alerta.produto,
    marketplaceId: alerta.marketplaceId,
    estoqueAtual: alerta.estoqueAtual,
    vendidoUltimos7Dias: alerta.vendidoUltimos7Dias,
    mediaDiaria: alerta.mediaDiaria,
    diasRestantes: alerta.diasRestantes,
    quantidadeSugerida: alerta.quantidadeSugerida,
    diasAlvoCobertura: alerta.diasAlvoCobertura,
  };
  for (const campo of CAMPOS_EXTRAS_ALERTA_ESTOQUE) {
    if (alerta[campo] !== undefined) dados[campo] = alerta[campo];
  }
  return dados;
}

/** Chaves `tipo:sku` dos alertas pendentes de um agente — pra não
 * recriar o mesmo aviso toda vez que a tela abre. Alerta antigo, sem
 * tipo gravado, conta como "ruptura". */
async function chavesPendentesEstoque(
  perfilId: string,
  agenteId: "estoque" | "fulfillment",
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("eventos_agente")
    .select("sku, dados")
    .eq("perfil_id", perfilId)
    .eq("agente_id", agenteId)
    .eq("status", "pendente");
  if (error) {
    console.error(`chavesPendentesEstoque(${agenteId}):`, error.message);
    return new Set();
  }
  return new Set(
    (data ?? [])
      .filter((r) => Boolean(r.sku))
      .map((r) => {
        const tipo = ((r.dados as Record<string, unknown> | null)?.tipoAlerta as string) ?? "ruptura";
        return `${tipo}:${r.sku}`;
      }),
  );
}

export const estoqueService = {
  listar: () => ESTOQUE,
  listarDetalhado: () => ESTOQUE_DETALHADO,
  resumo: () => RESUMO_ESTOQUE,

  /** Como uma linha de `eventos_agente` vira um AlertaEstoque. */
  linhaParaAlerta: linhaParaAlertaEstoque,

  listarAlertas: async (perfilId: string): Promise<AlertaEstoque[]> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("*")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "estoque")
      .order("criado_em", { ascending: false });
    if (error) {
      console.error("estoqueService.listarAlertas:", error.message);
      return [];
    }
    return (data ?? []).map(estoqueService.linhaParaAlerta);
  },

  /** SKUs que já têm alerta pendente — pra não recriar o mesmo aviso
   * toda vez que a tela abre. */
  skusPendentes: async (perfilId: string): Promise<Set<string>> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("sku")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "estoque")
      .eq("status", "pendente");
    if (error) {
      console.error("estoqueService.skusPendentes:", error.message);
      return new Set();
    }
    return new Set((data ?? []).map((r) => r.sku).filter((s): s is string => Boolean(s)));
  },

  /** Chaves `tipo:sku` pendentes (ruptura e parado são avisos diferentes). */
  chavesPendentes: (perfilId: string) => chavesPendentesEstoque(perfilId, "estoque"),

  criarAlerta: async (
    perfilId: string,
    alerta: Omit<AlertaEstoque, "id" | "status" | "decididoEm" | "data">,
  ): Promise<string | null> => {
    const { error } = await supabase.from("eventos_agente").insert({
      perfil_id: perfilId,
      agente_id: "estoque",
      conta_id: alerta.contaId,
      sku: alerta.sku,
      tipo: "risco_ruptura",
      motivo: `Vendeu ${alerta.vendidoUltimos7Dias} unidade(s) nos últimos 7 dias (média de ${alerta.mediaDiaria.toFixed(1)}/dia). No ritmo atual, o estoque acaba em ${alerta.diasRestantes} dia(s)${alerta.prazoFornecedorDias !== undefined ? `, e o fornecedor leva ${alerta.prazoFornecedorDias} dia(s) pra entregar` : ""}.`,
      semaforo: (alerta.diasSemEstoque ?? 0) > 0 || alerta.diasRestantes <= 3 ? "vermelho" : "amarelo",
      status: "pendente",
      dados: dadosAlertaEstoque(alerta),
    });
    return error?.message ?? null;
  },
};

export const fulfillmentService = {
  listarDetalhado: () => FULFILLMENT_DETALHADO,
  resumo: () => RESUMO_FULFILLMENT,

  /** Mesma estrutura do alerta de Estoque — reaproveita o tipo
   * `AlertaEstoque`, só troca o `agente_id` gravado no banco. */
  linhaParaAlerta: linhaParaAlertaEstoque,

  listarAlertas: async (perfilId: string): Promise<AlertaEstoque[]> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("*")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "fulfillment")
      .order("criado_em", { ascending: false });
    if (error) {
      console.error("fulfillmentService.listarAlertas:", error.message);
      return [];
    }
    return (data ?? []).map(fulfillmentService.linhaParaAlerta);
  },

  skusPendentes: async (perfilId: string): Promise<Set<string>> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("sku")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "fulfillment")
      .eq("status", "pendente");
    if (error) {
      console.error("fulfillmentService.skusPendentes:", error.message);
      return new Set();
    }
    return new Set((data ?? []).map((r) => r.sku).filter((s): s is string => Boolean(s)));
  },

  /** Chaves `tipo:sku` pendentes (ruptura e parado são avisos diferentes). */
  chavesPendentes: (perfilId: string) => chavesPendentesEstoque(perfilId, "fulfillment"),

  criarAlerta: async (
    perfilId: string,
    alerta: Omit<AlertaEstoque, "id" | "status" | "decididoEm" | "data">,
  ): Promise<string | null> => {
    const { error } = await supabase.from("eventos_agente").insert({
      perfil_id: perfilId,
      agente_id: "fulfillment",
      conta_id: alerta.contaId,
      sku: alerta.sku,
      tipo: alerta.tipoAlerta === "parado" ? "estoque_parado" : "risco_ruptura",
      motivo:
        alerta.tipoAlerta === "parado"
          ? `Estoque parado no Full: ${alerta.estoqueAtual} unidade(s), cobertura de ${alerta.diasRestantes} dias, custando R$ ${(alerta.custoArmazenagemMensal ?? 0).toFixed(2).replace(".", ",")} por mês de armazenagem.`
          : `No centro de distribuição do marketplace, vendeu ${alerta.vendidoUltimos7Dias} unidade(s) nos últimos 7 dias (média de ${alerta.mediaDiaria.toFixed(1)}/dia). No ritmo atual, o estoque alocado lá acaba em ${alerta.diasRestantes} dia(s).`,
      semaforo:
        alerta.tipoAlerta === "parado"
          ? "amarelo"
          : (alerta.diasSemEstoque ?? 0) > 0 || alerta.diasRestantes <= 3
            ? "vermelho"
            : "amarelo",
      status: "pendente",
      dados: dadosAlertaEstoque(alerta),
    });
    return error?.message ?? null;
  },
};

/** Canais de venda (Mercado Livre, Shopee...) — só a identidade do canal. */
export const marketplacesService = {
  listar: () => MARKETPLACES,
};

/**
 * Contas do seller dentro de cada canal. Um canal pode ter uma ou várias
 * contas (loja oficial, outlet, outro CNPJ) — é aqui que moram credencial,
 * taxas, reputação e resultado de cada uma.
 */
export const contasService = {
  listar: () => obterContasAtuais(),
  /** Contas conectadas — opcionalmente só as de um marketplace, para o
   * "Receber anúncios" filtrar antes de puxar. */
  ativas: (marketplaceId?: MarketplaceId) =>
    obterContasAtuais().filter(
      (c) => c.statusConexao !== "desconectado" && (!marketplaceId || c.marketplaceId === marketplaceId),
    ),
  doCanal: (id: MarketplaceId) => contasDoCanal(id),
  buscar: (id: string) => getConta(id),
};

export const notificacoesService = {
  listar: () => NOTIFICACOES,
};

export const usuariosService = {
  listar: () => USUARIOS,
};

export const logsService = {
  listar: () => LOGS,
};

export const recuperacaoService = {
  listar: () => OPORTUNIDADES_RECUPERACAO,
};

/**
 * Metas de margem por conta — a régua que o agente usa pra decidir até
 * onde pode cortar preço. `contaId` é o id da conta (fictícia hoje, real
 * quando a conexão existir), guardado como texto puro.
 */
export const metasService = {
  listar: async (perfilId: string): Promise<Record<string, MetasMargem>> => {
    const { data, error } = await supabase
      .from("metas_margem")
      .select("conta_id, margem_minima, margem_ideal")
      .eq("perfil_id", perfilId);
    if (error) {
      console.error("metasService.listar:", error.message);
      return {};
    }
    const mapa: Record<string, MetasMargem> = {};
    for (const linha of data ?? []) {
      mapa[linha.conta_id] = {
        margemMinima: linha.margem_minima,
        margemIdeal: linha.margem_ideal,
      };
    }
    return mapa;
  },
  salvar: async (
    perfilId: string,
    contaId: string,
    metas: MetasMargem,
  ): Promise<string | null> => {
    const { error } = await supabase.from("metas_margem").upsert(
      {
        perfil_id: perfilId,
        conta_id: contaId,
        margem_minima: metas.margemMinima,
        margem_ideal: metas.margemIdeal,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "perfil_id,conta_id" },
    );
    return error?.message ?? null;
  },
  remover: async (perfilId: string, contaId: string): Promise<string | null> => {
    const { error } = await supabase
      .from("metas_margem")
      .delete()
      .eq("perfil_id", perfilId)
      .eq("conta_id", contaId);
    return error?.message ?? null;
  },
};

/** Como uma linha de `eventos_agente` chega do Supabase — campos soltos
 * (SKU, preço sugerido, margens...) ficam dentro de `dados`, um JSON
 * livre, pra não precisar prever coluna nova a cada agente diferente. */
interface LinhaEventoAgente {
  id: string;
  agente_id: string;
  conta_id: string | null;
  sku: string | null;
  criado_em: string;
  motivo: string;
  dados: Record<string, unknown>;
  semaforo: string;
  status: string;
  decidido_em: string | null;
}

function linhaParaEvento(l: LinhaEventoAgente): EventoAgente {
  const d = l.dados ?? {};
  return {
    id: l.id,
    agenteId: l.agente_id as AgenteId,
    data: l.criado_em,
    anuncioId: (d.anuncioId as string) ?? "",
    sku: l.sku ?? (d.sku as string) ?? "",
    produto: (d.produto as string) ?? "",
    marketplaceId: (d.marketplaceId as MarketplaceId) ?? "mercado-livre",
    contaId: l.conta_id ?? "",
    motivo: l.motivo,
    diasParado: (d.diasParado as number) ?? 0,
    precoAtual: (d.precoAtual as number) ?? 0,
    precoSugerido: (d.precoSugerido as number) ?? 0,
    margemAtual: (d.margemAtual as number) ?? 0,
    margemSugerida: (d.margemSugerida as number) ?? 0,
    precoMinimo: (d.precoMinimo as number) ?? 0,
    semaforo: l.semaforo as SemaforoDecisao,
    travadoNoPiso: (d.travadoNoPiso as boolean) ?? false,
    status: l.status as StatusSugestao,
    decididoEm: l.decidido_em,
    direcao: (d.direcao as DirecaoPreco | undefined) ?? undefined,
    degrau: (d.degrau as number | undefined) ?? undefined,
  };
}

/**
 * O registro central dos agentes — o que o feed, o histórico e (mais pra
 * frente) a sala 3D leem. Uma sugestão gravada aqui sobrevive a atualizar
 * a página, fechar o navegador, voltar amanhã.
 */
export const eventosAgenteService = {
  /** O que TODOS os agentes têm pendente agora, agrupado — a base do
   * contexto do Gestor. Não traz linha por linha (66 sugestões de preço
   * virariam 66 linhas de texto); traz a contagem e só os 3 exemplos
   * mais urgentes de cada agente. */
  listarResumoPendentes: async (perfilId: string): Promise<ResumoPendentesAgente[]> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("agente_id, motivo, semaforo")
      .eq("perfil_id", perfilId)
      .eq("status", "pendente");
    if (error) {
      console.error("eventosAgenteService.listarResumoPendentes:", error.message);
      return [];
    }
    const porAgente = new Map<string, { motivo: string; semaforo: string }[]>();
    for (const linha of data ?? []) {
      const agenteId = linha.agente_id as string;
      const lista = porAgente.get(agenteId) ?? [];
      lista.push({ motivo: linha.motivo as string, semaforo: linha.semaforo as string });
      porAgente.set(agenteId, lista);
    }
    const resultado: ResumoPendentesAgente[] = [];
    for (const [agenteId, itens] of porAgente) {
      const ordenados = [...itens].sort((a, b) => {
        const peso = (s: string) => (s === "vermelho" ? 0 : s === "amarelo" ? 1 : 2);
        return peso(a.semaforo) - peso(b.semaforo);
      });
      resultado.push({
        agenteId,
        total: itens.length,
        exemplos: ordenados.slice(0, 3).map((i) => i.motivo),
      });
    }
    return resultado;
  },

  /** As sugestões de UM agente. O `agenteId` é obrigatório de propósito:
   * sem ele, a tela de Precificação acabava listando o que os outros
   * agentes gravaram na mesma tabela — e como aquelas linhas não têm
   * preço, apareciam como cards de R$ 0,00. */
  listar: async (perfilId: string, agenteId: AgenteId): Promise<EventoAgente[]> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("*")
      .eq("perfil_id", perfilId)
      .eq("agente_id", agenteId)
      .order("criado_em", { ascending: false });
    if (error) {
      console.error("eventosAgenteService.listar:", error.message);
      return [];
    }
    return (data ?? []).map(linhaParaEvento);
  },
  /** SKUs que já têm sugestão pendente deste agente — pra a varredura não
   * criar a mesma sugestão de novo toda vez que a tela abrir. */
  skusPendentes: async (perfilId: string, agenteId: AgenteId): Promise<Set<string>> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("sku")
      .eq("perfil_id", perfilId)
      .eq("agente_id", agenteId)
      .eq("status", "pendente");
    if (error) {
      console.error("eventosAgenteService.skusPendentes:", error.message);
      return new Set();
    }
    return new Set((data ?? []).map((r) => r.sku).filter((s): s is string => Boolean(s)));
  },
  criar: async (
    perfilId: string,
    evento: Omit<EventoAgente, "id" | "status" | "decididoEm" | "data">,
  ): Promise<string | null> => {
    const { error } = await supabase.from("eventos_agente").insert({
      perfil_id: perfilId,
      agente_id: evento.agenteId,
      conta_id: evento.contaId,
      sku: evento.sku,
      tipo: "sugestao_preco",
      motivo: evento.motivo,
      semaforo: evento.semaforo,
      status: "pendente",
      dados: {
        anuncioId: evento.anuncioId,
        sku: evento.sku,
        produto: evento.produto,
        marketplaceId: evento.marketplaceId,
        diasParado: evento.diasParado,
        precoAtual: evento.precoAtual,
        precoSugerido: evento.precoSugerido,
        margemAtual: evento.margemAtual,
        margemSugerida: evento.margemSugerida,
        precoMinimo: evento.precoMinimo,
        travadoNoPiso: evento.travadoNoPiso,
        ...(evento.direcao !== undefined ? { direcao: evento.direcao } : {}),
        ...(evento.degrau !== undefined ? { degrau: evento.degrau } : {}),
      },
    });
    return error?.message ?? null;
  },
  /** Chaves `direcao:anuncioId` das sugestões de preço pendentes — o
   * mesmo anúncio pode ter uma sugestão de baixar e, depois, uma de
   * subir. Sugestão antiga, sem direção gravada, conta como "baixar". */
  chavesPendentesPreco: async (perfilId: string): Promise<Set<string>> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("dados")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "precificacao")
      .eq("status", "pendente");
    if (error) {
      console.error("eventosAgenteService.chavesPendentesPreco:", error.message);
      return new Set();
    }
    return new Set(
      (data ?? []).map((r) => {
        const d = (r.dados ?? {}) as Record<string, unknown>;
        return `${(d.direcao as string) ?? "baixar"}:${(d.anuncioId as string) ?? ""}`;
      }),
    );
  },
  decidir: async (
    eventoId: string,
    status: Extract<StatusSugestao, "aprovada" | "recusada">,
  ): Promise<string | null> => {
    const { error } = await supabase
      .from("eventos_agente")
      .update({ status, decidido_em: new Date().toISOString() })
      .eq("id", eventoId);
    return error?.message ?? null;
  },

  /** Linha crua de `eventos_agente` para um aviso do Analista. */
  linhaParaInsight: (l: {
    id: string;
    tipo: string;
    conta_id: string | null;
    criado_em: string;
    motivo: string;
    dados: Record<string, unknown>;
    semaforo: string;
    status: string;
    decidido_em: string | null;
  }): InsightAnalista => ({
    id: l.id,
    tipo: l.tipo as TipoInsightAnalista,
    data: l.criado_em,
    contaId: l.conta_id,
    motivo: l.motivo,
    semaforo: l.semaforo as SemaforoDecisao,
    status: l.status as StatusSugestao,
    decididoEm: l.decidido_em,
    dados: l.dados ?? {},
  }),

  /** Só os avisos do Analista — mesma tabela, filtro diferente. */
  listarInsights: async (perfilId: string): Promise<InsightAnalista[]> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("*")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "analista")
      .order("criado_em", { ascending: false });
    if (error) {
      console.error("eventosAgenteService.listarInsights:", error.message);
      return [];
    }
    return (data ?? []).map(eventosAgenteService.linhaParaInsight);
  },

  /** Tipos de aviso que já estão pendentes (e pra qual conta) — pra não
   * recriar o mesmo aviso toda vez que a tela abre. Uma "queda_margem"
   * é do negócio inteiro (contaId null); "saude_conta" é por conta. */
  tiposPendentes: async (perfilId: string): Promise<Set<string>> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("tipo, conta_id")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "analista")
      .eq("status", "pendente");
    if (error) {
      console.error("eventosAgenteService.tiposPendentes:", error.message);
      return new Set();
    }
    return new Set((data ?? []).map((r) => `${r.tipo}:${r.conta_id ?? ""}`));
  },

  criarInsight: async (
    perfilId: string,
    insight: Omit<InsightAnalista, "id" | "status" | "decididoEm" | "data">,
  ): Promise<string | null> => {
    const { error } = await supabase.from("eventos_agente").insert({
      perfil_id: perfilId,
      agente_id: "analista",
      conta_id: insight.contaId,
      tipo: insight.tipo,
      motivo: insight.motivo,
      semaforo: insight.semaforo,
      status: "pendente",
      dados: insight.dados,
    });
    return error?.message ?? null;
  },
};

/** Como uma linha de `eventos_agente` vira um TicketSac. */
function linhaParaTicketSac(l: {
  id: string;
  conta_id: string | null;
  criado_em: string;
  status: string;
  decidido_em: string | null;
  dados: Record<string, unknown>;
}): TicketSac {
  const d = l.dados ?? {};
  return {
    id: l.id,
    data: l.criado_em,
    contaId: l.conta_id,
    anuncioId: (d.anuncioId as string) ?? null,
    produto: (d.produto as string) ?? "",
    sku: (d.sku as string) ?? "",
    marketplaceId: d.marketplaceId as MarketplaceId,
    pergunta: (d.pergunta as string) ?? "",
    resposta: (d.resposta as string) ?? null,
    status: l.status as StatusSugestao,
    decididoEm: l.decidido_em,
    pedidoId: (d.pedidoId as string) ?? null,
    cliente: (d.cliente as string) ?? null,
  };
}

/** Quando a Edge Function responde com erro (4xx/5xx), o supabase-js não
 * entrega o corpo da resposta automaticamente — só um aviso genérico. O
 * motivo de verdade, que a function escreve em `{ erro: "..." }`, está
 * escondido em error.context. */
async function motivoErroFunction(error: { message?: string }): Promise<string> {
  let motivo = error.message ?? "Não consegui falar com a IA.";
  const contexto = (error as { context?: Response }).context;
  if (contexto && typeof contexto.json === "function") {
    try {
      const corpo = await contexto.json();
      if (corpo?.erro) motivo = corpo.erro;
    } catch {
      // Corpo não era JSON — fica com a mensagem genérica mesmo.
    }
  }
  return motivo;
}

/** Personalização do SAC (tom de voz, política da loja, frases
 * proibidas). Uma linha por seller na tabela `sac_configuracoes`. */
export const sacConfigService = {
  carregar: async (perfilId: string): Promise<ConfiguracaoSac> => {
    const { data, error } = await supabase
      .from("sac_configuracoes")
      .select("*")
      .eq("perfil_id", perfilId)
      .maybeSingle();
    if (error) {
      console.error("sacConfigService.carregar:", error.message);
      return { ...CONFIGURACAO_SAC_PADRAO };
    }
    if (!data) return { ...CONFIGURACAO_SAC_PADRAO };
    return {
      tom: (data.tom as TomSac) ?? "neutro",
      assinatura: (data.assinatura as string) ?? "",
      politicaTroca: (data.politica_troca as string) ?? "",
      garantia: (data.garantia as string) ?? "",
      prazoEnvio: (data.prazo_envio as string) ?? "",
      frasesProibidas: (data.frases_proibidas as string) ?? "",
    };
  },

  salvar: async (perfilId: string, c: ConfiguracaoSac): Promise<string | null> => {
    const { error } = await supabase.from("sac_configuracoes").upsert(
      {
        perfil_id: perfilId,
        tom: c.tom,
        assinatura: c.assinatura,
        politica_troca: c.politicaTroca,
        garantia: c.garantia,
        prazo_envio: c.prazoEnvio,
        frases_proibidas: c.frasesProibidas,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "perfil_id" },
    );
    return error?.message ?? null;
  },
};

/** O anúncio como está publicado (título, descrição e ficha técnica).
 * Hoje vem dos dados fictícios; com a API, esta é a função que passa a
 * buscar no marketplace — as telas não mudam. */
export const conteudoPublicadoService = {
  buscar: (sku: string): ConteudoPublicado | null =>
    CONTEUDOS_PUBLICADOS.find((c) => c.sku === sku) ?? null,
};

/** Informações extras (opcionais) por SKU — o que o SAC e o
 * Criativo usam pra não inventar característica. Vem da tabela
 * `fichas_anuncio`; enquanto o seller não preencheu, usa as fichas de
 * exemplo. */
export const fichasService = {
  /** Mapa SKU → descrição completa */
  listar: async (perfilId: string): Promise<Map<string, string>> => {
    const mapa = new Map(FICHAS_ANUNCIO.map((f) => [f.sku, f.descricaoCompleta]));
    const { data, error } = await supabase
      .from("fichas_anuncio")
      .select("sku, descricao_completa")
      .eq("perfil_id", perfilId);
    if (error) {
      console.error("fichasService.listar:", error.message);
      return mapa;
    }
    for (const f of data ?? []) {
      const texto = (f.descricao_completa as string) ?? "";
      // Ficha salva em branco = o seller apagou: some até da ficha de exemplo.
      if (texto.trim()) mapa.set(f.sku as string, texto);
      else mapa.delete(f.sku as string);
    }
    return mapa;
  },

  /** Cria ou atualiza a ficha de um SKU (uma por SKU). Salvar em branco
   * apaga a ficha. Usado pelo Criativo e pelo botão do SAC — os dois
   * salvam no mesmo lugar. */
  salvar: async (perfilId: string, sku: string, descricaoCompleta: string): Promise<string | null> => {
    const { error } = await supabase.from("fichas_anuncio").upsert(
      {
        perfil_id: perfilId,
        sku,
        descricao_completa: descricaoCompleta.trim(),
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "perfil_id,sku" },
    );
    return error?.message ?? null;
  },
};

/** Palavras proibidas e limite de título por canal do Agente Criativo.
 * Tabela `criativo_configuracoes` (Bloco 7); sem linha salva, vale o padrão. */
export const criativoConfigService = {
  carregar: async (perfilId: string): Promise<ConfiguracaoCriativo> => {
    const padrao = {
      ...CONFIGURACAO_CRIATIVO_PADRAO,
      limitesTitulo: { ...LIMITES_TITULO_PADRAO },
    };
    const { data, error } = await supabase
      .from("criativo_configuracoes")
      .select("*")
      .eq("perfil_id", perfilId)
      .maybeSingle();
    if (error) {
      console.error("criativoConfigService.carregar:", error.message);
      return padrao;
    }
    if (!data) return padrao;
    const salvos = (data.limites_titulo ?? {}) as Record<string, unknown>;
    const limites = { ...LIMITES_TITULO_PADRAO };
    for (const id of Object.keys(limites) as MarketplaceId[]) {
      const n = Number(salvos[id]);
      if (Number.isFinite(n) && n > 0) limites[id] = Math.round(n);
    }
    return {
      palavrasProibidas: (data.palavras_proibidas as string) ?? "",
      limitesTitulo: limites,
    };
  },

  salvar: async (perfilId: string, c: ConfiguracaoCriativo): Promise<string | null> => {
    const { error } = await supabase.from("criativo_configuracoes").upsert(
      {
        perfil_id: perfilId,
        palavras_proibidas: c.palavrasProibidas,
        limites_titulo: c.limitesTitulo,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "perfil_id" },
    );
    return error?.message ?? null;
  },
};

/** Mensagens prontas do SAC por situação do pedido. Começam com um texto
 * padrão; quando o seller salva uma versão editada, ela passa a valer. */
export const modelosSacService = {
  listar: async (perfilId: string): Promise<Record<SituacaoSac, string>> => {
    const modelos = { ...MODELOS_SAC_PADRAO };
    const { data, error } = await supabase
      .from("sac_modelos_mensagem")
      .select("situacao, texto")
      .eq("perfil_id", perfilId);
    if (error) {
      console.error("modelosSacService.listar:", error.message);
      return modelos;
    }
    for (const m of data ?? []) {
      const situacao = m.situacao as SituacaoSac;
      if (situacao in modelos && (m.texto as string)?.trim()) modelos[situacao] = m.texto as string;
    }
    return modelos;
  },

  salvar: async (perfilId: string, situacao: SituacaoSac, texto: string): Promise<string | null> => {
    const { error } = await supabase.from("sac_modelos_mensagem").upsert(
      { perfil_id: perfilId, situacao, texto, atualizado_em: new Date().toISOString() },
      { onConflict: "perfil_id,situacao" },
    );
    return error?.message ?? null;
  },
};

/** Regras que moldam as respostas do SAC — aprendidas com as edições do
 * seller (via o Gestor) ou escritas direto nas Configurações. */
export const regrasSacService = {
  listar: async (perfilId: string): Promise<RegraSac[]> => {
    const { data, error } = await supabase
      .from("sac_regras")
      .select("*")
      .eq("perfil_id", perfilId)
      .order("criada_em", { ascending: false });
    if (error) {
      console.error("regrasSacService.listar:", error.message);
      return [];
    }
    return (data ?? []).map((r) => ({
      id: r.id as string,
      regra: r.regra as string,
      origem: r.origem as RegraSac["origem"],
      ativa: Boolean(r.ativa),
      criadaEm: r.criada_em as string,
    }));
  },

  criar: async (
    perfilId: string,
    regra: string,
    origem: RegraSac["origem"],
  ): Promise<string | null> => {
    const { error } = await supabase
      .from("sac_regras")
      .insert({ perfil_id: perfilId, regra, origem, ativa: true });
    return error?.message ?? null;
  },

  alternar: async (id: string, ativa: boolean): Promise<string | null> => {
    const { error } = await supabase.from("sac_regras").update({ ativa }).eq("id", id);
    return error?.message ?? null;
  },

  apagar: async (id: string): Promise<string | null> => {
    const { error } = await supabase.from("sac_regras").delete().eq("id", id);
    return error?.message ?? null;
  },
};

/**
 * O Agente de SAC. A pergunta do cliente é sempre fictícia por enquanto
 * (não há API de mensagens ainda). A resposta é real — gerada pela OpenAI
 * — mas só quando o seller pede, nunca sozinha: é o único passo desse
 * agente que custa token de verdade, então fica sob controle do clique.
 */
export const sacService = {
  listar: async (perfilId: string): Promise<TicketSac[]> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("*")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "sac")
      .order("criado_em", { ascending: false });
    if (error) {
      console.error("sacService.listar:", error.message);
      return [];
    }
    return (data ?? []).map(linhaParaTicketSac);
  },

  criarTicket: async (
    perfilId: string,
    ticket: {
      contaId: string | null;
      anuncioId: string | null;
      produto: string;
      sku: string;
      marketplaceId: MarketplaceId;
      pergunta: string;
      pedidoId?: string | null;
      cliente?: string | null;
      /** Marca de qual leva de exemplos o ticket veio */
      lote?: string;
    },
  ): Promise<string | null> => {
    const { error } = await supabase.from("eventos_agente").insert({
      perfil_id: perfilId,
      agente_id: "sac",
      conta_id: ticket.contaId,
      sku: ticket.sku,
      tipo: "pergunta_cliente",
      motivo: ticket.pergunta,
      semaforo: "amarelo",
      status: "pendente",
      dados: {
        anuncioId: ticket.anuncioId,
        produto: ticket.produto,
        sku: ticket.sku,
        marketplaceId: ticket.marketplaceId,
        pergunta: ticket.pergunta,
        ...(ticket.pedidoId ? { pedidoId: ticket.pedidoId } : {}),
        ...(ticket.cliente ? { cliente: ticket.cliente } : {}),
        ...(ticket.lote ? { lote: ticket.lote } : {}),
      },
    });
    return error?.message ?? null;
  },

  /** Quais levas de exemplos já foram criadas pra este seller. */
  lotesCriados: async (perfilId: string): Promise<Set<string>> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("dados")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "sac");
    if (error) {
      console.error("sacService.lotesCriados:", error.message);
      return new Set();
    }
    return new Set(
      (data ?? [])
        .map((r) => ((r.dados ?? {}) as Record<string, unknown>).lote)
        .filter((l): l is string => typeof l === "string"),
    );
  },

  /** Chama a Edge Function — é aqui, e só aqui, que sai custo de token real.
   * Manda junto tudo que deixa a resposta com a cara da loja: categoria,
   * ficha do produto, tom de voz, política e as regras aprendidas. */
  gerarResposta: async (contexto: {
    pergunta: string;
    produto: string;
    categoria: CategoriaSac;
    ficha: string | null;
    config: ConfiguracaoSac;
    regras: string[];
  }): Promise<{ resposta: string | null; erro: string | null }> => {
    const { data, error } = await supabase.functions.invoke("responder-sac", {
      body: {
        modo: "responder",
        pergunta: contexto.pergunta,
        produto: contexto.produto,
        categoria: contexto.categoria,
        ficha: contexto.ficha,
        config: {
          ...contexto.config,
          frasesProibidas: contexto.config.frasesProibidas
            .split("\n")
            .map((f) => f.trim())
            .filter(Boolean),
        },
        regras: contexto.regras,
      },
    });
    if (error) return { resposta: null, erro: await motivoErroFunction(error) };
    if (data?.erro) return { resposta: null, erro: data.erro as string };
    return { resposta: (data?.resposta as string) ?? null, erro: null };
  },

  /** O seller editou a resposta da IA: o Gestor compara as duas versões e
   * propõe UMA regra curta pro SAC seguir daqui pra frente. null quando a
   * edição foi só de digitação e não dá pra tirar regra. */
  aprenderComEdicao: async (dados: {
    pergunta: string;
    produto: string;
    respostaOriginal: string;
    respostaEditada: string;
  }): Promise<{ regra: string | null; erro: string | null }> => {
    const { data, error } = await supabase.functions.invoke("responder-sac", {
      body: { modo: "aprender", ...dados },
    });
    if (error) return { regra: null, erro: await motivoErroFunction(error) };
    if (data?.erro) return { regra: null, erro: data.erro as string };
    return { regra: (data?.regra as string) ?? null, erro: null };
  },

  /** Grava a resposta gerada (ou editada pelo seller) no ticket, sem
   * mudar o status ainda — aprovar é um passo separado, deliberado. */
  salvarResposta: async (ticketId: string, resposta: string): Promise<string | null> => {
    const { data: atual, error: erroLeitura } = await supabase
      .from("eventos_agente")
      .select("dados")
      .eq("id", ticketId)
      .single();
    if (erroLeitura) return erroLeitura.message;

    const { error } = await supabase
      .from("eventos_agente")
      .update({ dados: { ...(atual?.dados ?? {}), resposta } })
      .eq("id", ticketId);
    return error?.message ?? null;
  },
};

/** Como uma linha de `eventos_agente` vira um EventoAds. */
function linhaParaEventoAds(l: {
  id: string;
  tipo: string;
  conta_id: string | null;
  criado_em: string;
  status: string;
  decidido_em: string | null;
  dados: Record<string, unknown>;
}): EventoAds {
  const d = l.dados ?? {};
  return {
    id: l.id,
    tipo: l.tipo as TipoEventoAds,
    data: l.criado_em,
    contaId: l.conta_id,
    sku: (d.sku as string) ?? "",
    produto: (d.produto as string) ?? "",
    quantidade: (d.quantidade as number) ?? 0,
    unidadesPorDia: (d.unidadesPorDia as number) ?? 0,
    faturamento: (d.faturamento as number) ?? 0,
    investimento: (d.investimento as number) ?? 0,
    lucroLiquido: (d.lucroLiquido as number) ?? 0,
    margemSemAds: (d.margemSemAds as number) ?? 0,
    margemComAds: (d.margemComAds as number) ?? 0,
    valeAPena: d.valeAPena === null || d.valeAPena === undefined ? null : Boolean(d.valeAPena),
    status: l.status as StatusSugestao,
    decididoEm: l.decidido_em,
  };
}

/**
 * O Agente de Ads, em duas janelas: "sugestão" (produto vendendo bem sem
 * nenhum investimento em Ads — candidato a entrar) e "análise" (produto
 * que já está em Ads — vale a pena continuar ou não). As duas reusam o
 * `custoMidia` real de cada pedido — a mesma conta que a tela de Ads do
 * Dashboard já mostra, nunca um número calculado à parte.
 */
/** Os tipos de linha do Agente de Ads que são "ação" (aprovar/recusar),
 * separados das janelas antigas de sugestão/análise. */
const TIPOS_ACAO_ADS: TipoAcaoAds[] = ["ajuste_roas", "realocacao", "anuncio_cansado"];

/** Como uma linha de `eventos_agente` vira uma AcaoAds. */
function linhaParaAcaoAds(l: {
  id: string;
  conta_id: string | null;
  criado_em: string;
  status: string;
  decidido_em: string | null;
  motivo: string | null;
  semaforo: string | null;
  dados: Record<string, unknown>;
}): AcaoAds {
  const d = l.dados ?? {};
  return {
    id: l.id,
    data: l.criado_em,
    contaId: l.conta_id,
    anuncioId: (d.anuncioId as string) ?? "",
    sku: (d.sku as string) ?? "",
    produto: (d.produto as string) ?? "",
    marketplaceId: d.marketplaceId as MarketplaceId,
    motivo: l.motivo ?? "",
    semaforo: (l.semaforo as SemaforoDecisao) ?? "amarelo",
    status: l.status as StatusSugestao,
    decididoEm: l.decidido_em,
    detalhe: d.detalhe as DetalheAcaoAds,
  };
}

export const adsService = {
  /** Histórico diário de Ads de todos os anúncios (fictício até a API). */
  historico: () => HISTORICO_ADS,

  listar: async (perfilId: string): Promise<EventoAds[]> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("*")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "ads")
      .in("tipo", ["sugestao", "analise"])
      .order("criado_em", { ascending: false });
    if (error) {
      console.error("adsService.listar:", error.message);
      return [];
    }
    return (data ?? []).map(linhaParaEventoAds);
  },

  /** SKUs que já têm um evento pendente, por janela — pra não recriar o
   * mesmo item toda vez que a tela abre. */
  skusPendentes: async (perfilId: string, tipo: TipoEventoAds): Promise<Set<string>> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("sku")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "ads")
      .eq("tipo", tipo)
      .eq("status", "pendente");
    if (error) {
      console.error("adsService.skusPendentes:", error.message);
      return new Set();
    }
    return new Set((data ?? []).map((r) => r.sku).filter((s): s is string => Boolean(s)));
  },

  criarEvento: async (
    perfilId: string,
    evento: Omit<EventoAds, "id" | "status" | "decididoEm" | "data">,
  ): Promise<string | null> => {
    const unidadesDia = Math.round(evento.unidadesPorDia);
    const motivo =
      evento.tipo === "sugestao"
        ? `Vendeu ${evento.quantidade} un. (${unidadesDia}/dia) sem nenhum investimento em Ads, faturando ${evento.faturamento.toFixed(2)}. Pode valer a pena testar.`
        : evento.valeAPena
          ? `Investiu ${evento.investimento.toFixed(2)}, faturou ${evento.faturamento.toFixed(2)} (${evento.quantidade} un., ${unidadesDia}/dia). Sobrou ${evento.lucroLiquido.toFixed(2)} de lucro líquido — vale a pena continuar.`
          : `Investiu ${evento.investimento.toFixed(2)}, faturou ${evento.faturamento.toFixed(2)} (${evento.quantidade} un., ${unidadesDia}/dia). O Ads gastou mais do que o produto trouxe de lucro.`;

    const { error } = await supabase.from("eventos_agente").insert({
      perfil_id: perfilId,
      agente_id: "ads",
      conta_id: evento.contaId,
      sku: evento.sku,
      tipo: evento.tipo,
      motivo,
      semaforo: evento.tipo === "sugestao" ? "amarelo" : evento.valeAPena ? "verde" : "vermelho",
      status: "pendente",
      dados: {
        sku: evento.sku,
        produto: evento.produto,
        quantidade: evento.quantidade,
        unidadesPorDia: evento.unidadesPorDia,
        faturamento: evento.faturamento,
        investimento: evento.investimento,
        lucroLiquido: evento.lucroLiquido,
        margemSemAds: evento.margemSemAds,
        margemComAds: evento.margemComAds,
        valeAPena: evento.valeAPena,
      },
    });
    return error?.message ?? null;
  },

  /** Todas as ações (ajuste de objetivo, realocação, anúncio cansado),
   * pendentes e já decididas. */
  listarAcoes: async (perfilId: string): Promise<AcaoAds[]> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("*")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "ads")
      .in("tipo", TIPOS_ACAO_ADS)
      .order("criado_em", { ascending: false });
    if (error) {
      console.error("adsService.listarAcoes:", error.message);
      return [];
    }
    return (data ?? []).map(linhaParaAcaoAds);
  },

  /** Chaves das ações que já estão pendentes — pra não recriar a mesma
   * sugestão toda vez que a tela abre. */
  chavesAcoesPendentes: async (perfilId: string): Promise<Set<string>> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("dados")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "ads")
      .in("tipo", TIPOS_ACAO_ADS)
      .eq("status", "pendente");
    if (error) {
      console.error("adsService.chavesAcoesPendentes:", error.message);
      return new Set();
    }
    return new Set(
      (data ?? [])
        .map((r) => (r.dados as Record<string, unknown> | null)?.chave)
        .filter((c): c is string => typeof c === "string"),
    );
  },

  criarAcao: async (
    perfilId: string,
    acao: Omit<AcaoAds, "id" | "status" | "decididoEm" | "data">,
    chave: string,
  ): Promise<string | null> => {
    const { error } = await supabase.from("eventos_agente").insert({
      perfil_id: perfilId,
      agente_id: "ads",
      conta_id: acao.contaId,
      sku: acao.sku,
      tipo: acao.detalhe.tipo,
      motivo: acao.motivo,
      semaforo: acao.semaforo,
      status: "pendente",
      dados: {
        chave,
        anuncioId: acao.anuncioId,
        sku: acao.sku,
        produto: acao.produto,
        marketplaceId: acao.marketplaceId,
        detalhe: acao.detalhe,
      },
    });
    return error?.message ?? null;
  },
};
/** Como uma linha de `eventos_agente` vira uma SugestaoCriativo. */
function linhaParaSugestaoCriativo(l: {
  id: string;
  conta_id: string | null;
  motivo?: string | null;
  criado_em: string;
  status: string;
  decidido_em: string | null;
  dados: Record<string, unknown>;
}): SugestaoCriativo {
  const d = l.dados ?? {};
  return {
    id: l.id,
    data: l.criado_em,
    contaId: l.conta_id,
    anuncioId: (d.anuncioId as string) ?? null,
    sku: (d.sku as string) ?? "",
    produto: (d.produto as string) ?? "",
    marketplaceId: d.marketplaceId as MarketplaceId,
    motivo: l.motivo ?? "",
    origem: ((d.origem as OrigemCriativo) ?? "exemplo") as OrigemCriativo,
    tituloSugerido: (d.tituloSugerido as string) ?? null,
    titulosAlternativos: Array.isArray(d.titulosAlternativos)
      ? (d.titulosAlternativos as unknown[]).filter((t): t is string => typeof t === "string")
      : null,
    descricaoSugerida: (d.descricaoSugerida as string) ?? null,
    palavrasChave: (d.palavrasChave as string) ?? null,
    bulletPoints: (d.bulletPoints as string) ?? null,
    status: l.status as StatusSugestao,
    decididoEm: l.decidido_em,
  };
}

/** Os quatro campos que o seller edita antes de aprovar. */
export interface RascunhoCriativo {
  titulo: string;
  descricao: string;
  palavrasChave: string;
  bulletPoints: string;
}

/** O que a IA devolve: o rascunho + as 3 opções de título. */
export interface ConteudoCriativo extends RascunhoCriativo {
  titulos: string[];
}

/**
 * O Agente Criativo. Título, descrição, palavras-chave e bullet points
 * nascem juntos, numa única chamada à IA — só quando o seller pede.
 */
export const criativoService = {
  listar: async (perfilId: string): Promise<SugestaoCriativo[]> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("*")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "criativo")
      .order("criado_em", { ascending: false });
    if (error) {
      console.error("criativoService.listar:", error.message);
      return [];
    }
    return (data ?? []).map(linhaParaSugestaoCriativo);
  },

  criarSugestao: async (
    perfilId: string,
    s: {
      contaId: string | null;
      anuncioId: string | null;
      produto: string;
      sku: string;
      marketplaceId: MarketplaceId;
      /** Por que o anúncio veio pro Criativo (ex.: perguntas repetidas no
       * SAC). Sem ele, fica o motivo padrão. */
      motivo?: string;
      origem?: OrigemCriativo;
    },
  ): Promise<string | null> => {
    const { error } = await supabase.from("eventos_agente").insert({
      perfil_id: perfilId,
      agente_id: "criativo",
      conta_id: s.contaId,
      sku: s.sku,
      tipo: "conteudo_anuncio",
      motivo: s.motivo ?? `Título, descrição, palavras-chave e bullet points para "${s.produto}".`,
      semaforo: "amarelo",
      status: "pendente",
      dados: {
        anuncioId: s.anuncioId,
        produto: s.produto,
        sku: s.sku,
        marketplaceId: s.marketplaceId,
        origem: s.origem ?? "exemplo",
      },
    });
    return error?.message ?? null;
  },

  /** Chama a Edge Function — os quatro campos vêm juntos, na mesma
   * chamada, porque gerar um ou quatro custa praticamente o mesmo. */
  gerarConteudo: async (p: {
    produto: string;
    /** Nome do canal, ex.: "Mercado Livre" */
    marketplace: string;
    limiteTitulo: number;
    ficha: string | null;
    motivo: string;
    palavrasProibidas: string[];
  }): Promise<{
    conteudo: ConteudoCriativo | null;
    erro: string | null;
  }> => {
    const { data, error } = await supabase.functions.invoke("gerar-criativo", {
      body: p,
    });
    if (error) {
      let motivo = error.message ?? "Não consegui falar com a IA.";
      const contexto = (error as { context?: Response }).context;
      if (contexto && typeof contexto.json === "function") {
        try {
          const corpo = await contexto.json();
          if (corpo?.erro) motivo = corpo.erro;
        } catch {
          // Corpo não era JSON — fica com a mensagem genérica mesmo.
        }
      }
      return { conteudo: null, erro: motivo };
    }
    if (data?.erro) {
      return { conteudo: null, erro: data.erro as string };
    }
    const c = data?.conteudo;
    if (!c) return { conteudo: null, erro: null };
    const titulos: string[] = Array.isArray(c.titulos)
      ? (c.titulos as unknown[]).filter((t): t is string => typeof t === "string" && t.trim() !== "")
      : [];
    return {
      conteudo: {
        titulo: c.titulo ?? titulos[0] ?? "",
        titulos: titulos.length > 0 ? titulos : [c.titulo ?? ""],
        descricao: c.descricao ?? "",
        palavrasChave: c.palavrasChave ?? "",
        bulletPoints: c.bulletPoints ?? "",
      },
      erro: null,
    };
  },

  /** Grava o conteúdo gerado (ou editado pelo seller), sem mudar o
   * status — aprovar é um passo separado, deliberado. */
  salvarConteudo: async (
    sugestaoId: string,
    conteudo: RascunhoCriativo & { titulos?: string[] },
  ): Promise<string | null> => {
    const { data: atual, error: erroLeitura } = await supabase
      .from("eventos_agente")
      .select("dados")
      .eq("id", sugestaoId)
      .single();
    if (erroLeitura) return erroLeitura.message;

    const { error } = await supabase
      .from("eventos_agente")
      .update({
        dados: {
          ...(atual?.dados ?? {}),
          tituloSugerido: conteudo.titulo,
          descricaoSugerida: conteudo.descricao,
          palavrasChave: conteudo.palavrasChave,
          bulletPoints: conteudo.bulletPoints,
          // Só troca as opções de título quando veio geração nova da IA;
          // uma edição do seller mantém as opções que já estavam lá.
          ...(conteudo.titulos ? { titulosAlternativos: conteudo.titulos } : {}),
        },
      })
      .eq("id", sugestaoId);
    return error?.message ?? null;
  },
};

/** Uma mensagem na conversa com o Gestor. */
export interface MensagemChat {
  papel: "user" | "assistente";
  conteudo: string;
}

/** Quantos pendentes cada agente tem agora, com alguns exemplos reais —
 * usado pra montar o contexto do Gestor sem estourar o tamanho da
 * mensagem (66 sugestões de preço viram "66 pendentes" + 3 exemplos,
 * não 66 linhas soltas). */
export interface ResumoPendentesAgente {
  agenteId: string;
  total: number;
  exemplos: string[];
}

/**
 * Conversa de verdade com o Gestor — o Analista fundido com a visão de
 * tudo: o negócio inteiro e o que os outros 5 agentes já descobriram.
 * Guarda histórico só do dia atual; quando o dia vira, a busca por
 * "hoje" já vem vazia sozinha, sem precisar apagar nada.
 */
export const chatGestorService = {
  /** Só as mensagens de hoje — é isso que dá o efeito de "resetar" a
   * cada dia, sem nenhuma rotina de limpeza rodando por trás. */
  carregarHistoricoDoDia: async (perfilId: string): Promise<MensagemChat[]> => {
    const inicioHoje = new Date();
    inicioHoje.setHours(0, 0, 0, 0);
    const { data, error } = await supabase
      .from("mensagens_chat")
      .select("papel, conteudo")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "gestor")
      .gte("criado_em", inicioHoje.toISOString())
      .order("criado_em", { ascending: true });
    if (error) {
      console.error("chatGestorService.carregarHistoricoDoDia:", error.message);
      return [];
    }
    return (data ?? []).map((r) => ({
      papel: r.papel as "user" | "assistente",
      conteudo: r.conteudo as string,
    }));
  },

  salvarMensagem: async (perfilId: string, mensagem: MensagemChat): Promise<string | null> => {
    const { error } = await supabase.from("mensagens_chat").insert({
      perfil_id: perfilId,
      agente_id: "gestor",
      papel: mensagem.papel,
      conteudo: mensagem.conteudo,
    });
    return error?.message ?? null;
  },

  conversar: async (
    mensagens: MensagemChat[],
    contexto: string,
  ): Promise<{ resposta: string | null; erro: string | null }> => {
    const { data, error } = await supabase.functions.invoke("conversar-analista", {
      body: { mensagens, contexto },
    });
    if (error) {
      let motivo = error.message ?? "Não consegui falar com a IA.";
      const contextoErro = (error as { context?: Response }).context;
      if (contextoErro && typeof contextoErro.json === "function") {
        try {
          const corpo = await contextoErro.json();
          if (corpo?.erro) motivo = corpo.erro;
        } catch {
          // Corpo não era JSON — fica com a mensagem genérica mesmo.
        }
      }
      return { resposta: null, erro: motivo };
    }
    if (data?.erro) {
      return { resposta: null, erro: data.erro as string };
    }
    return { resposta: (data?.resposta as string) ?? null, erro: null };
  },
};

/* ------------------------------------------------------------------ */
/* Agente Auditor                                                      */
/* ------------------------------------------------------------------ */

/** O Auditor acompanha um PROCESSO (reclamar, esperar, conferir se
 * voltou), então tem quatro estados — mais que o aprovar/recusar dos
 * outros agentes. A coluna `status` da tabela continua com os três
 * valores de sempre, e o estado detalhado vive dentro de `dados`. */
const STATUS_TABELA: Record<StatusOcorrenciaAuditor, StatusSugestao> = {
  aberto: "pendente",
  "reclamacao-aberta": "pendente",
  reembolsado: "aprovada",
  ignorado: "recusada",
};

function linhaParaOcorrenciaAuditor(l: {
  id: string;
  conta_id: string | null;
  criado_em: string;
  status: string;
  decidido_em: string | null;
  motivo: string | null;
  dados: Record<string, unknown>;
}): OcorrenciaAuditor {
  const d = (l.dados ?? {}) as Record<string, unknown>;
  const guardada = (d.ocorrencia ?? {}) as Partial<OcorrenciaAuditor>;
  return {
    ...(guardada as OcorrenciaAuditor),
    id: l.id,
    contaId: guardada.contaId ?? l.conta_id ?? "",
    motivo: guardada.motivo ?? l.motivo ?? "",
    status: (d.statusAuditor as StatusOcorrenciaAuditor) ?? "aberto",
    atualizadoEm: l.decidido_em,
  };
}

export const auditorService = {
  /** Mudanças de taxa que o Auditor já teria detectado. Fictício até a
   * API do canal expor o histórico real de taxas. */
  historicoTaxas: () => HISTORICO_TAXAS,

  /** Fatura mensal do Full por SKU (armazenagem, retirada, multa).
   * Fictícia até a API do canal expor a fatura real. */
  cobrancasFull: () => COBRANCAS_FULL,

  listar: async (perfilId: string): Promise<OcorrenciaAuditor[]> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("*")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "auditor")
      .order("criado_em", { ascending: false });
    if (error) {
      console.error("auditorService.listar:", error.message);
      return [];
    }
    return (data ?? []).map(linhaParaOcorrenciaAuditor);
  },

  /** Todas as chaves já registradas, em QUALQUER estado — inclusive as
   * ignoradas, pra a varredura não trazer de volta o que o seller já
   * mandou embora. */
  chavesRegistradas: async (perfilId: string): Promise<Set<string>> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("dados")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "auditor");
    if (error) {
      console.error("auditorService.chavesRegistradas:", error.message);
      return new Set();
    }
    return new Set(
      (data ?? [])
        .map((r) => (r.dados as Record<string, unknown> | null)?.chave)
        .filter((c): c is string => typeof c === "string"),
    );
  },

  criar: async (perfilId: string, o: OcorrenciaAuditor): Promise<string | null> => {
    const { error } = await supabase.from("eventos_agente").insert({
      perfil_id: perfilId,
      agente_id: "auditor",
      conta_id: o.contaId,
      sku: o.sku,
      tipo: o.tipo,
      motivo: o.motivo,
      semaforo: o.tipo === "mudanca-taxa" ? "amarelo" : "vermelho",
      status: "pendente",
      dados: { chave: o.chave, statusAuditor: "aberto", ocorrencia: { ...o, id: "" } },
    });
    return error?.message ?? null;
  },

  atualizarStatus: async (
    ocorrencia: OcorrenciaAuditor,
    status: StatusOcorrenciaAuditor,
  ): Promise<string | null> => {
    const { data, error: erroLeitura } = await supabase
      .from("eventos_agente")
      .select("dados")
      .eq("id", ocorrencia.id)
      .single();
    if (erroLeitura) {
      console.error("auditorService.atualizarStatus:", erroLeitura.message);
      return erroLeitura.message;
    }
    const dados = (data?.dados ?? {}) as Record<string, unknown>;
    const { error } = await supabase
      .from("eventos_agente")
      .update({
        status: STATUS_TABELA[status],
        decidido_em: new Date().toISOString(),
        dados: { ...dados, statusAuditor: status },
      })
      .eq("id", ocorrencia.id);
    return error?.message ?? null;
  },
};
