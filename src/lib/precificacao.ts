// Contas da tela Precificação — só matemática, sem IA, roda no navegador.
//
// Duas direções:
// - por PREÇO: o seller digita o preço novo e vê a margem e o lucro;
// - por MARGEM: o seller digita a margem que quer e vê o preço certo.
//
// E dois ajustes que o seller decide anúncio por anúncio (o "clicar e
// editar" das colunas Ads e Outros):
// - Ads: automático (média real do Ads), valor fixo por unidade, % do
//   preço, ou não considerar;
// - Outros: marcar/desmarcar cada custo operacional (e o afiliado) e
//   somar um custo extra só deste anúncio (ex.: embalagem especial).
//
// Comissão, imposto e Ads em % acompanham o preço; CMV, taxa fixa, frete,
// afiliado, custo extra e Ads em R$ ficam iguais aos de hoje.

import type { Anuncio } from "@/types";

export type ModoAds = "auto" | "reais" | "percentual" | "nenhum";

/** O que o seller ajustou num anúncio. Sem ajuste = tudo automático. */
export interface AjusteCusto {
  adsModo: ModoAds;
  /** R$ por unidade (modo "reais") ou fração do preço 0-1 (modo "percentual") */
  adsValor: number;
  /** Nomes dos custos que NÃO entram na conta ("Afiliados" ou o nome do
   * custo operacional, igual está em Configurações) */
  ignorados: string[];
  /** Custo a mais por unidade, só deste anúncio */
  custoExtra: number;
}

export const AJUSTE_PADRAO: AjusteCusto = {
  adsModo: "auto",
  adsValor: 0,
  ignorados: [],
  custoExtra: 0,
};

/** Nome usado pro custo de afiliado na lista de "Outros". */
export const NOME_AFILIADOS = "Afiliados";

export interface ConfigPrecificacao {
  /** Alíquota das configurações (0-1) */
  aliquotaImposto: number;
  /** Custos operacionais do seller pra um dado preço, item a item */
  custosOperacionais: (preco: number) => { nome: string; valor: number }[];
}

export interface ItemOutros {
  nome: string;
  valor: number;
  /** false = o seller desmarcou, não entra na conta */
  considerado: boolean;
}

export interface Detalhamento {
  preco: number;
  cmv: number;
  comissao: number;
  taxaFixa: number;
  frete: number;
  ads: number;
  imposto: number;
  /** Afiliados + custos operacionais + custo extra — cada um marcado se entra ou não */
  itensOutros: ItemOutros[];
  outros: number;
  lucro: number;
  margem: number;
}

function adsNoPreco(a: Anuncio, ajuste: AjusteCusto, preco: number): number {
  switch (ajuste.adsModo) {
    case "reais":
      return ajuste.adsValor;
    case "percentual":
      return preco * ajuste.adsValor;
    case "nenhum":
      return 0;
    default:
      return a.custoMidiaUnitario;
  }
}

/** Todos os custos do anúncio vendido a `preco`, já com os ajustes. */
export function detalharPreco(
  a: Anuncio,
  preco: number,
  ajuste: AjusteCusto,
  cfg: ConfigPrecificacao,
): Detalhamento {
  const cmv = a.cmv ?? 0;
  const comissao = preco * a.comissaoPercentual;
  const imposto = preco * cfg.aliquotaImposto;
  const ads = adsNoPreco(a, ajuste, preco);

  const itensOutros: ItemOutros[] = [];
  if (a.custoAfiliadoUnitario > 0) {
    itensOutros.push({
      nome: NOME_AFILIADOS,
      valor: a.custoAfiliadoUnitario,
      considerado: !ajuste.ignorados.includes(NOME_AFILIADOS),
    });
  }
  for (const c of cfg.custosOperacionais(preco)) {
    itensOutros.push({ nome: c.nome, valor: c.valor, considerado: !ajuste.ignorados.includes(c.nome) });
  }
  if (ajuste.custoExtra > 0) {
    itensOutros.push({ nome: "Custo extra deste anúncio", valor: ajuste.custoExtra, considerado: true });
  }
  const outros = itensOutros.filter((i) => i.considerado).reduce((s, i) => s + i.valor, 0);

  const lucro = preco - cmv - comissao - a.taxaFixa - a.freteUnitario - ads - imposto - outros;
  return {
    preco,
    cmv,
    comissao,
    taxaFixa: a.taxaFixa,
    frete: a.freteUnitario,
    ads,
    imposto,
    itensOutros,
    outros,
    lucro,
    margem: preco > 0 ? lucro / preco : 0,
  };
}

/** Lucro e margem se o anúncio for vendido a `preco`. */
export function resultadoNoPreco(
  a: Anuncio,
  preco: number,
  ajuste: AjusteCusto,
  cfg: ConfigPrecificacao,
): { lucro: number; margem: number } {
  if (preco <= 0) return { lucro: 0, margem: 0 };
  const d = detalharPreco(a, preco, ajuste, cfg);
  return { lucro: d.lucro, margem: d.margem };
}

/**
 * Preço que entrega a `margem` pedida (0-1). null quando é impossível —
 * as partes em % (comissão, imposto, Ads em %) + a margem já passam de
 * 100% do preço. Custos operacionais podem depender do preço, por isso a
 * conta é refeita algumas vezes até estabilizar (converge no centavo).
 */
export function precoParaMargem(
  a: Anuncio,
  margem: number,
  ajuste: AjusteCusto,
  cfg: ConfigPrecificacao,
): number | null {
  const adsPercentual = ajuste.adsModo === "percentual" ? ajuste.adsValor : 0;
  const divisor = 1 - a.comissaoPercentual - cfg.aliquotaImposto - adsPercentual - margem;
  if (divisor <= 0) return null;
  // Tudo que não é % do preço, calculado num preço de referência.
  const fixosNo = (preco: number) => {
    const d = detalharPreco(a, preco, ajuste, cfg);
    const adsFixo = ajuste.adsModo === "percentual" ? 0 : d.ads;
    return d.cmv + d.taxaFixa + d.frete + adsFixo + d.outros;
  };
  let preco = fixosNo(a.precoAtual) / divisor;
  for (let i = 0; i < 5; i++) preco = fixosNo(preco) / divisor;
  return Math.round(preco * 100) / 100;
}

export interface Limites {
  precoMinimo: number | null;
  precoEmpate: number | null;
  emPrejuizo: boolean;
  abaixoDoMinimo: boolean;
}

/** Preço mínimo (margem mínima) e de empate (lucro zero), já com os ajustes. */
export function limitesComAjuste(
  a: Anuncio,
  margemMinima: number,
  ajuste: AjusteCusto,
  cfg: ConfigPrecificacao,
): Limites {
  const precoMinimo = precoParaMargem(a, margemMinima, ajuste, cfg);
  const precoEmpate = precoParaMargem(a, 0, ajuste, cfg);
  const atual = detalharPreco(a, a.precoAtual, ajuste, cfg);
  return {
    precoMinimo,
    precoEmpate,
    emPrejuizo: atual.lucro < 0,
    abaixoDoMinimo: atual.margem < margemMinima,
  };
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
