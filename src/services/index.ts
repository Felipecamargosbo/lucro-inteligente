// Camada de serviços: hoje devolve dados fictícios locais.
// No futuro, cada função aqui será trocada por uma chamada às APIs
// dos marketplaces / banco de dados, sem alterar as páginas.

import {
  ANUNCIOS,
  CANAIS_NOTIFICACAO,
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
  getConta,
  obterContasAtuais,
} from "@/data/mock";
import type { MarketplaceId, Produto } from "@/types";

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
};

/**
 * Catálogo de produtos — fonte única do CMV. Hoje é um array em memória
 * (src/data/mock.ts); amanhã será uma tabela real, e vincular/criar/atualizar
 * viram chamadas de API, sem mudar quem consome este serviço.
 */
export const produtosService = {
  listar: () => PRODUTOS_CATALOGO,
  buscarPorId: (id: string) => PRODUTOS_CATALOGO.find((p) => p.id === id) ?? null,
  /** Vincula um anúncio a um produto já existente no catálogo — o CMV do
   * anúncio passa a vir do produto a partir de agora. */
  vincular: (anuncioId: string, produtoId: string) => {
    const anuncio = ANUNCIOS.find((a) => a.id === anuncioId);
    const produto = PRODUTOS_CATALOGO.find((p) => p.id === produtoId);
    if (!anuncio || !produto) return null;
    anuncio.produtoId = produto.id;
    anuncio.cmv = produto.cmv;
    return anuncio;
  },
  /** Cria um produto novo a partir de um anúncio sem vínculo, e já vincula a
   * ele todo anúncio (em qualquer marketplace/conta) com o mesmo SKU. */
  criarAPartirDeAnuncio: (
    anuncioId: string,
    dados: { cmv: number; ean?: string | null },
  ): Produto | null => {
    const anuncio = ANUNCIOS.find((a) => a.id === anuncioId);
    if (!anuncio) return null;
    const novoProduto: Produto = {
      id: `prod-${anuncio.sku.toLowerCase()}-${Date.now()}`,
      sku: anuncio.sku,
      ean: dados.ean ?? null,
      nome: anuncio.produto,
      cmv: dados.cmv,
    };
    PRODUTOS_CATALOGO.push(novoProduto);
    for (const a of ANUNCIOS) {
      if (a.sku === anuncio.sku) {
        a.produtoId = novoProduto.id;
        a.cmv = novoProduto.cmv;
      }
    }
    return novoProduto;
  },
  /** Muda o CMV no catálogo e espalha o novo valor para todo anúncio
   * vinculado, em qualquer marketplace — é o ponto central do catálogo. */
  atualizarCmv: (produtoId: string, novoCmv: number) => {
    const produto = PRODUTOS_CATALOGO.find((p) => p.id === produtoId);
    if (!produto) return null;
    produto.cmv = novoCmv;
    for (const a of ANUNCIOS) {
      if (a.produtoId === produtoId) a.cmv = novoCmv;
    }
    return produto;
  },
  /** Quantos anúncios (e em quais marketplaces) usam este produto hoje. */
  cobertura: (produtoId: string) => {
    const vinculados = ANUNCIOS.filter((a) => a.produtoId === produtoId);
    const marketplaces = [...new Set(vinculados.map((a) => a.marketplaceId))];
    return { totalAnuncios: vinculados.length, marketplaces };
  },
};

export const promocoesService = {
  listar: () => PROMOCOES,
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
  ativas: () => obterContasAtuais().filter((c) => c.statusConexao !== "desconectado"),
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
  listarCanais: () => CANAIS_NOTIFICACAO,
};
