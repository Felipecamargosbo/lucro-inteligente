// Contas da tela Precificação — só matemática, sem IA, roda no navegador.
// Duas direções:
// - por PREÇO: o seller digita o preço novo e vê a margem e o lucro;
// - por MARGEM: o seller digita a margem que quer e vê o preço certo.
// Comissão e imposto acompanham o preço (são %); CMV, taxa fixa, frete,
// Ads e afiliado ficam iguais aos de hoje (são valor por unidade).

import type { Anuncio } from "@/types";

export interface OpcoesPrecificacao {
  /** Alíquota das configurações (0-1) */
  aliquotaImposto: number;
  /** Custos operacionais do seller pra um dado preço */
  custosOperacionais: (preco: number) => number;
}

function partes(a: Anuncio, op: OpcoesPrecificacao) {
  return {
    percentuais: op.aliquotaImposto + a.comissaoPercentual,
    fixos:
      (a.cmv ?? 0) + a.taxaFixa + a.freteUnitario + a.custoMidiaUnitario + a.custoAfiliadoUnitario,
  };
}

/** Lucro e margem se o anúncio for vendido a `preco`. */
export function resultadoNoPreco(
  a: Anuncio,
  preco: number,
  op: OpcoesPrecificacao,
): { lucro: number; margem: number } {
  if (preco <= 0) return { lucro: 0, margem: 0 };
  const { percentuais, fixos } = partes(a, op);
  const lucro = preco - preco * percentuais - fixos - op.custosOperacionais(preco);
  return { lucro, margem: lucro / preco };
}

/**
 * Preço que entrega a `margem` pedida (0-1). null quando é impossível —
 * as taxas percentuais + a margem já passam de 100% do preço.
 * Os custos operacionais podem depender do preço, por isso a conta é
 * refeita algumas vezes até estabilizar (converge no centavo).
 */
export function precoParaMargem(
  a: Anuncio,
  margem: number,
  op: OpcoesPrecificacao,
): number | null {
  const { percentuais, fixos } = partes(a, op);
  const divisor = 1 - percentuais - margem;
  if (divisor <= 0) return null;
  let preco = (fixos + op.custosOperacionais(a.precoAtual)) / divisor;
  for (let i = 0; i < 4; i++) preco = (fixos + op.custosOperacionais(preco)) / divisor;
  return Math.round(preco * 100) / 100;
}

/** Lê "129,90", "129.90", "R$ 129,90" ou "25%" como número. null se inválido. */
export function lerNumero(texto: string): number | null {
  const limpo = texto.replace(/[R$\s%]/g, "");
  if (!limpo) return null;
  // "1.299,90" → 1299.90 ; "129,90" → 129.90 ; "129.90" → 129.90
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}
