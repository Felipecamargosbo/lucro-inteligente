// Regras de cobrança de cada canal — o que o Agente Auditor usa pra saber
// quanto ERA pra ser cobrado em cada pedido e na fatura do Full.
//
// TUDO AQUI É FICTÍCIO por enquanto. Quando as APIs estiverem ligadas, o
// "cobrado" vem do extrato do canal (Mercado Livre: relatório de
// faturamento; Shopee: get_escrow_detail; Amazon: Finances API; TikTok
// Shop: transações por pedido) e parte do "esperado" pode vir das APIs de
// cálculo de tarifa (Mercado Livre: listing_prices; Amazon:
// getMyFeesEstimate). Os números abaixo só existem pra tela ter exemplo.

import type { MarketplaceId, TamanhoFulfillment } from "@/types";

export interface RegrasCobrancaCanal {
  /** Pedido a partir deste valor sai com frete grátis PAGO PELO VENDEDOR;
   * abaixo dele, quem paga o frete é o comprador. null = neste canal o
   * vendedor nunca paga frete por pedido. Não vale pro Full (lá o frete
   * do pedido é por conta do canal). */
  freteSellerAPartirDe: number | null;
  /** Parcelamento sem juros oferecido pelo vendedor: custo por parcela
   * além da primeira, sobre o valor da venda. null = não oferece. */
  parcelamentoPorParcela: number | null;
  /** Taxa de transação/pagamento sobre a venda. null = não existe. */
  taxaTransacao: number | null;
  /** Taxa de programa (frete grátis, cashback) sobre a venda. null = o
   * vendedor não participa de nenhum programa neste canal. */
  taxaServico: number | null;
  /** Comissão de afiliado sobre a venda, só em venda que veio de
   * afiliado. null = o canal não tem programa de afiliados. */
  comissaoAfiliado: number | null;
  /** Tarifa por unidade enviada pelo Full/FBA, por tamanho. null = o
   * canal não cobra tarifa por unidade. */
  tarifaFulfillment: Record<TamanhoFulfillment, number> | null;
  /** Vende garantia estendida junto com o produto */
  vendeGarantia: boolean;
}

export const REGRAS_COBRANCA: Record<MarketplaceId, RegrasCobrancaCanal> = {
  "mercado-livre": {
    freteSellerAPartirDe: 79,
    parcelamentoPorParcela: 0.012,
    taxaTransacao: null,
    taxaServico: null,
    comissaoAfiliado: null,
    tarifaFulfillment: { pequeno: 3.9, medio: 6.9, grande: 11.9 },
    vendeGarantia: false,
  },
  shopee: {
    freteSellerAPartirDe: null,
    parcelamentoPorParcela: null,
    taxaTransacao: 0.02,
    taxaServico: 0.06,
    comissaoAfiliado: 0.05,
    tarifaFulfillment: null,
    vendeGarantia: false,
  },
  amazon: {
    freteSellerAPartirDe: 79,
    parcelamentoPorParcela: null,
    taxaTransacao: null,
    taxaServico: null,
    comissaoAfiliado: null,
    tarifaFulfillment: { pequeno: 4.9, medio: 7.9, grande: 12.9 },
    vendeGarantia: false,
  },
  magalu: {
    freteSellerAPartirDe: 79,
    parcelamentoPorParcela: null,
    taxaTransacao: null,
    taxaServico: null,
    comissaoAfiliado: null,
    tarifaFulfillment: null,
    vendeGarantia: false,
  },
  "tiktok-shop": {
    freteSellerAPartirDe: null,
    parcelamentoPorParcela: null,
    taxaTransacao: 0.03,
    taxaServico: null,
    comissaoAfiliado: 0.1,
    tarifaFulfillment: null,
    vendeGarantia: false,
  },
  shein: {
    freteSellerAPartirDe: null,
    parcelamentoPorParcela: null,
    taxaTransacao: null,
    taxaServico: null,
    comissaoAfiliado: null,
    tarifaFulfillment: null,
    vendeGarantia: false,
  },
};

/** Armazenagem do Full: percentual ao mês sobre o valor do estoque. Sobe
 * quando a cobertura passa de `DIAS_ESTOQUE_PARADO`. */
export const ARMAZENAGEM_FULL = {
  normal: 0.008,
  parado: 0.02,
  diasParado: 60,
  /** A partir desta cobertura entra a armazenagem prolongada */
  diasProlongada: 120,
  /** Armazenagem prolongada: por unidade, ao mês */
  prolongadaPorUnidade: 1.5,
  /** Retirada de estoque do Full: por unidade retirada */
  retiradaPorUnidade: 2.5,
};

/** Motivos de devolução em que o frete de volta é do vendedor. Nos
 * outros (arrependimento, atraso) quem banca é o canal. */
export const MOTIVOS_DEVOLUCAO_CULPA_SELLER = [
  "Produto com defeito",
  "Produto diferente do anunciado",
  "Item incompleto",
];

/** Tamanho cadastrado do produto no Full/FBA. Fictício: sai de uma conta
 * fixa sobre o SKU, pra ser sempre o mesmo pra o mesmo produto. */
export function tamanhoFulfillmentDoSku(sku: string): TamanhoFulfillment {
  let h = 0;
  for (const c of sku) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const tamanhos: TamanhoFulfillment[] = ["pequeno", "medio", "grande"];
  return tamanhos[h % 3]!;
}
