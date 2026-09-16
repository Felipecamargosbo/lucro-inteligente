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
  LOGS,
  MARKETPLACES,
  NOTIFICACOES,
  OPORTUNIDADES_RECUPERACAO,
  PEDIDOS,
  PRODUTOS_CATALOGO,
  PROMOCOES,
  USUARIOS,
  contasDoCanal,
  getCampanha,
  getConta,
  obterContasAtuais,
} from "@/data/mock";
import type {
  AgenteId,
  Anuncio,
  ContaMarketplace,
  EventoAgente,
  MarketplaceId,
  MetasMargem,
  Produto,
  SemaforoDecisao,
  StatusSugestao,
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
    const jaVinculados = new Set(
      ANUNCIOS.filter((a) => a.contaId === conta.id && a.produtoId).map((a) => a.produtoId),
    );
    const catalogoDisponivel = PRODUTOS_CATALOGO.filter((p) => !jaVinculados.has(p.id));
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
      custoAfiliadoUnitario: 0,
      origemTaxas: "estimado",
      produtoId: null,
      status: "ativo",
      elegivelPromocao: false,
      unidadesVendidas: 0,
      dataUltimaVenda: null,
    };

    ANUNCIOS.push(novoAnuncio);
    return novoAnuncio;
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
    const { data, error } = await supabase
      .from("produtos")
      .select("id, sku, ean, nome, cmv")
      .eq("perfil_id", perfilId)
      .eq("ativo", true)
      .order("nome");
    if (error) {
      console.error("produtosService.listar:", error.message);
      return [];
    }
    return data ?? [];
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

export const promocoesService = {
  listar: () => PROMOCOES,
};

export const campanhasService = {
  listar: () => CAMPANHAS,
  buscarPorId: (id: string | null) => getCampanha(id) ?? null,
  /** Pedidos que saíram por esta campanha. */
  pedidosDaCampanha: (campanhaId: string) =>
    PEDIDOS.filter((p) => p.campanhaId === campanhaId),
};

export const estoqueService = {
  listar: () => ESTOQUE,
  listarDetalhado: () => ESTOQUE_DETALHADO,
  resumo: () => RESUMO_ESTOQUE,
};

export const fulfillmentService = {
  listarDetalhado: () => FULFILLMENT_DETALHADO,
  resumo: () => RESUMO_FULFILLMENT,
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
    marketplaceId: d.marketplaceId as MarketplaceId,
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
  };
}

/**
 * O registro central dos agentes — o que o feed, o histórico e (mais pra
 * frente) a sala 3D leem. Uma sugestão gravada aqui sobrevive a atualizar
 * a página, fechar o navegador, voltar amanhã.
 */
export const eventosAgenteService = {
  listar: async (perfilId: string): Promise<EventoAgente[]> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("*")
      .eq("perfil_id", perfilId)
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
      },
    });
    return error?.message ?? null;
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
};
