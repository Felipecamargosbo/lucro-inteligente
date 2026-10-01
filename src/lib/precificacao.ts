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
// Comissão, imposto, afiliado e Ads em % acompanham o preço; CMV, taxa
// fixa, frete, custo extra e Ads em R$ ficam iguais aos de hoje.

import type { Anuncio, MarketplaceId } from "@/types";

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

/**
 * Uma faixa de preço de um canal: até quanto vale e quanto cobra de taxa
 * fixa e de frete nela. null = "usa o valor do próprio anúncio".
 * A última faixa tem `ate: null` (de lá pra cima).
 */
export interface FaixaPreco {
  ate: number | null;
  taxaFixa: number | null;
  frete: number | null;
}

export type FaixasPorCanal = Partial<Record<MarketplaceId, FaixaPreco[]>>;

export interface ConfigPrecificacao {
  /** Alíquota das configurações (0-1) */
  aliquotaImposto: number;
  /** Custos operacionais do seller pra um dado preço, item a item */
  custosOperacionais: (preco: number) => { nome: string; valor: number }[];
  /** Regras de taxa fixa e frete por faixa de preço, por canal (opcional) */
  faixas?: FaixasPorCanal;
}

/** Em qual faixa o preço cai (índice). -1 = canal sem faixas. */
export function indiceFaixa(faixas: FaixaPreco[] | undefined, preco: number): number {
  if (!faixas || faixas.length === 0) return -1;
  const i = faixas.findIndex((f) => f.ate === null || preco <= f.ate);
  return i === -1 ? faixas.length - 1 : i;
}

/**
 * Taxa fixa e frete pra vender a `preco`. Enquanto o preço fica na MESMA
 * faixa do preço de hoje, valem os valores do próprio anúncio (são os reais,
 * vindos do marketplace). Quando o preço cruza pra outra faixa, valem os
 * valores que o seller cadastrou pra ela (ex.: abaixo de R$ 79 no Mercado
 * Livre entra a taxa fixa e sai o frete grátis).
 */
function taxaEFrete(
  a: Anuncio,
  preco: number,
  cfg: ConfigPrecificacao,
  forcarFaixa?: number,
): { taxaFixa: number; frete: number } {
  const faixas = cfg.faixas?.[a.marketplaceId];
  const i = forcarFaixa ?? indiceFaixa(faixas, preco);
  if (!faixas || i < 0 || i === indiceFaixa(faixas, a.precoAtual)) {
    return { taxaFixa: a.taxaFixa, frete: a.freteUnitario };
  }
  const f = faixas[i]!;
  return { taxaFixa: f.taxaFixa ?? a.taxaFixa, frete: f.frete ?? a.freteUnitario };
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

/** A comissão de afiliado como fração do preço de hoje (ex.: 0,08 = 8%). */
function taxaAfiliado(a: Anuncio): number {
  return a.precoAtual > 0 ? a.custoAfiliadoUnitario / a.precoAtual : 0;
}

/** Todos os custos do anúncio vendido a `preco`, já com os ajustes. */
export function detalharPreco(
  a: Anuncio,
  preco: number,
  ajuste: AjusteCusto,
  cfg: ConfigPrecificacao,
  /** Só pro cálculo de preço pela margem: força uma faixa específica */
  forcarFaixa?: number,
): Detalhamento {
  const cmv = a.cmv ?? 0;
  const { taxaFixa, frete } = taxaEFrete(a, preco, cfg, forcarFaixa);
  const comissao = preco * a.comissaoPercentual;
  const imposto = preco * cfg.aliquotaImposto;
  const ads = adsNoPreco(a, ajuste, preco);

  const itensOutros: ItemOutros[] = [];
  if (a.custoAfiliadoUnitario > 0) {
    itensOutros.push({
      nome: NOME_AFILIADOS,
      // Comissão de afiliado é % do preço: acompanha quando o preço muda.
      valor: preco * taxaAfiliado(a),
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

  const lucro = preco - cmv - comissao - taxaFixa - frete - ads - imposto - outros;
  return {
    preco,
    cmv,
    comissao,
    taxaFixa,
    frete,
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
  const afiliadoConta = a.custoAfiliadoUnitario > 0 && !ajuste.ignorados.includes(NOME_AFILIADOS);
  const afiliadoPercentual = afiliadoConta ? taxaAfiliado(a) : 0;
  const divisor =
    1 - a.comissaoPercentual - cfg.aliquotaImposto - adsPercentual - afiliadoPercentual - margem;
  if (divisor <= 0) return null;
  // Tudo que não é % do preço, calculado num preço de referência — com a
  // taxa fixa e o frete de uma faixa específica (ou os do anúncio).
  const resolver = (faixa?: number) => {
    const fixosNo = (preco: number) => {
      const d = detalharPreco(a, preco, ajuste, cfg, faixa);
      const adsFixo = ajuste.adsModo === "percentual" ? 0 : d.ads;
      const afiliado = afiliadoConta ? preco * afiliadoPercentual : 0;
      return d.cmv + d.taxaFixa + d.frete + adsFixo + d.outros - afiliado;
    };
    let preco = fixosNo(a.precoAtual) / divisor;
    for (let i = 0; i < 5; i++) preco = fixosNo(preco) / divisor;
    return Math.round(preco * 100) / 100;
  };

  const faixas = cfg.faixas?.[a.marketplaceId];
  if (!faixas || faixas.length === 0) return resolver();
  // Com faixas: calcula o preço supondo cada faixa e fica com os que caem
  // de verdade dentro da faixa suposta. Se mais de um serve, o menor preço
  // (o mais barato que ainda entrega a margem).
  const validos: number[] = [];
  for (let i = 0; i < faixas.length; i++) {
    const p = resolver(i);
    if (indiceFaixa(faixas, p) === i) validos.push(p);
  }
  return validos.length > 0 ? Math.min(...validos) : resolver();
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

/**
 * Uma cópia do anúncio com os ajustes de Ads e "Outros" da tela
 * Precificação já embutidos — é o que os agentes recebem, pra que lucro e
 * margem batam com a Precificação em todo lugar.
 *
 * Como os agentes só conhecem os campos do anúncio:
 * - Ads → vai pro custo de Ads por unidade (em % é calculado no preço de hoje);
 * - Outros → afiliado desmarcado sai, custo extra entra, e os custos
 *   operacionais desmarcados (no preço de hoje) são descontados — tudo
 *   somado no campo de afiliado, que os agentes já tratam como custo fixo
 *   por unidade.
 */
export function anuncioComAjuste(a: Anuncio, ajuste: AjusteCusto, cfg: ConfigPrecificacao): Anuncio {
  const ads = adsNoPreco(a, ajuste, a.precoAtual);
  const afiliado = ajuste.ignorados.includes(NOME_AFILIADOS) ? 0 : a.custoAfiliadoUnitario;
  const operacionaisFora = cfg
    .custosOperacionais(a.precoAtual)
    .filter((c) => ajuste.ignorados.includes(c.nome))
    .reduce((soma, c) => soma + c.valor, 0);
  return {
    ...a,
    custoMidiaUnitario: ads,
    custoAfiliadoUnitario: afiliado + ajuste.custoExtra - operacionaisFora,
  };
}
