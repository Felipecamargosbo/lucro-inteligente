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
  PROMOCOES,
  USUARIOS,
  contasDoCanal,
  getConta,
  obterContasAtuais,
} from "@/data/mock";
import type { MarketplaceId } from "@/types";

export const vendasService = {
  listar: () => PEDIDOS,
  buscarPorId: (id: string) => PEDIDOS.find((p) => p.id === id) ?? null,
  cancelados: () => PEDIDOS.filter((p) => p.status === "cancelado"),
};

export const anunciosService = {
  listar: () => ANUNCIOS,
  historicoPrecos: () => HISTORICO_PRECOS,
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
