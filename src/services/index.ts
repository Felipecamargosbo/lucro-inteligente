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
  AlertaEstoque,
  Anuncio,
  ContaMarketplace,
  EventoAds,
  EventoAgente,
  InsightAnalista,
  MarketplaceId,
  MetasMargem,
  Produto,
  SemaforoDecisao,
  StatusSugestao,
  SugestaoCriativo,
  TicketSac,
  TipoEventoAds,
  TipoInsightAnalista,
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

  /** Como uma linha de `eventos_agente` vira um AlertaEstoque. */
  linhaParaAlerta: (l: {
    id: string;
    conta_id: string | null;
    criado_em: string;
    status: string;
    decidido_em: string | null;
    dados: Record<string, unknown>;
  }): AlertaEstoque => {
    const d = l.dados ?? {};
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
    };
  },

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
      motivo: `Vendeu ${alerta.vendidoUltimos7Dias} unidade(s) nos últimos 7 dias (média de ${alerta.mediaDiaria.toFixed(1)}/dia). No ritmo atual, o estoque acaba em ${alerta.diasRestantes} dia(s).`,
      semaforo: alerta.diasRestantes <= 3 ? "vermelho" : "amarelo",
      status: "pendente",
      dados: {
        sku: alerta.sku,
        produto: alerta.produto,
        marketplaceId: alerta.marketplaceId,
        estoqueAtual: alerta.estoqueAtual,
        vendidoUltimos7Dias: alerta.vendidoUltimos7Dias,
        mediaDiaria: alerta.mediaDiaria,
        diasRestantes: alerta.diasRestantes,
        quantidadeSugerida: alerta.quantidadeSugerida,
        diasAlvoCobertura: alerta.diasAlvoCobertura,
      },
    });
    return error?.message ?? null;
  },
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
  };
}

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
      },
    });
    return error?.message ?? null;
  },

  /** Chama a Edge Function — é aqui, e só aqui, que sai custo de token real. */
  gerarResposta: async (
    pergunta: string,
    produto: string,
  ): Promise<{ resposta: string | null; erro: string | null }> => {
    const { data, error } = await supabase.functions.invoke("responder-sac", {
      body: { pergunta, produto },
    });
    if (error) {
      // Quando a function responde com erro (4xx/5xx), o supabase-js não
      // entrega o corpo da resposta automaticamente — só um aviso
      // genérico. O motivo de verdade, que a nossa function escreve em
      // `{ erro: "..." }`, está escondido em error.context.
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
      return { resposta: null, erro: motivo };
    }
    if (data?.erro) {
      return { resposta: null, erro: data.erro as string };
    }
    return { resposta: (data?.resposta as string) ?? null, erro: null };
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
export const adsService = {
  listar: async (perfilId: string): Promise<EventoAds[]> => {
    const { data, error } = await supabase
      .from("eventos_agente")
      .select("*")
      .eq("perfil_id", perfilId)
      .eq("agente_id", "ads")
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
};
/** Como uma linha de `eventos_agente` vira uma SugestaoCriativo. */
function linhaParaSugestaoCriativo(l: {
  id: string;
  conta_id: string | null;
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
    tituloSugerido: (d.tituloSugerido as string) ?? null,
    descricaoSugerida: (d.descricaoSugerida as string) ?? null,
    palavrasChave: (d.palavrasChave as string) ?? null,
    bulletPoints: (d.bulletPoints as string) ?? null,
    status: l.status as StatusSugestao,
    decididoEm: l.decidido_em,
  };
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
    },
  ): Promise<string | null> => {
    const { error } = await supabase.from("eventos_agente").insert({
      perfil_id: perfilId,
      agente_id: "criativo",
      conta_id: s.contaId,
      sku: s.sku,
      tipo: "conteudo_anuncio",
      motivo: `Título, descrição, palavras-chave e bullet points para "${s.produto}".`,
      semaforo: "amarelo",
      status: "pendente",
      dados: {
        anuncioId: s.anuncioId,
        produto: s.produto,
        sku: s.sku,
        marketplaceId: s.marketplaceId,
      },
    });
    return error?.message ?? null;
  },

  /** Chama a Edge Function — os quatro campos vêm juntos, na mesma
   * chamada, porque gerar um ou quatro custa praticamente o mesmo. */
  gerarConteudo: async (
    produto: string,
  ): Promise<{
    conteudo: {
      titulo: string;
      descricao: string;
      palavrasChave: string;
      bulletPoints: string;
    } | null;
    erro: string | null;
  }> => {
    const { data, error } = await supabase.functions.invoke("gerar-criativo", {
      body: { produto },
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
    return { conteudo: data?.conteudo ?? null, erro: null };
  },

  /** Grava o conteúdo gerado (ou editado pelo seller), sem mudar o
   * status — aprovar é um passo separado, deliberado. */
  salvarConteudo: async (
    sugestaoId: string,
    conteudo: { titulo: string; descricao: string; palavrasChave: string; bulletPoints: string },
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
