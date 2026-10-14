/**
 * As contas de uma linha da Precificação (e da aba Promoções):
 *
 *  - PREÇO CHEIO: o que vai pro canal (o botão "Lançar" manda este).
 *  - DESCONTO e PREÇO PROMOCIONAL: o plano da promoção. A promoção em si
 *    nasce na aba Promoções (ou numa campanha do canal).
 *  - O que está valendo AGORA no canal: o cliente paga o promocional se a
 *    promoção está ativa, senão o cheio.
 *
 * Regra única de exibição: lucro e margem mostram o que acontece de verdade
 * no canal agora. Só quando o seller muda algo e ainda não lançou (azul) a
 * linha mostra a simulação — marcada como tal.
 */
import type { Anuncio } from "@/types";
import type { PrecoPlanejado } from "@/services";
import {
  detalharPreco,
  precoParaMargem,
  type AjusteCusto,
  type ConfigPrecificacao,
  type CustosCanal,
  type Detalhamento,
} from "@/lib/precificacao";

/** O ML aceita desconto de 5% a 80% nas promoções. */
export const DESCONTO_MIN_ML = 5;
export const DESCONTO_MAX_ML = 80;
/** A partir daqui o frete grátis é obrigatório no Mercado Livre. */
export const LIMITE_FRETE_GRATIS_ML = 79;

export const centavos = (v: number) => Math.round(v * 100) / 100;

/** Cheio a partir do promocional (78,99 com 30% → 112,84). */
export const cheioDoPromo = (promo: number, desconto: number) =>
  desconto > 0 && desconto < 100 ? centavos(promo / (1 - desconto / 100)) : centavos(promo);

/** Promocional a partir do cheio (112,84 com 30% → 78,99). */
export const promoDoCheio = (cheio: number, desconto: number) =>
  desconto > 0 && desconto < 100 ? centavos(cheio * (1 - desconto / 100)) : centavos(cheio);

export type EstadoPromocao =
  /** promoção valendo no preço planejado (ou sem plano) */
  | "ativa"
  /** promoção valendo, mas em outro valor */
  | "outro-valor"
  /** tem promoção planejada e nenhuma valendo: o cliente paga o cheio */
  | "sem-promocao"
  /** sem plano de promoção e sem promoção */
  | "nenhuma";

export type SituacaoEnvio = "igual" | "alterado" | "enviando" | "erro" | "sem-plano";

export interface ContaDaLinha {
  /** Preço cheio no canal agora */
  cheioCanal: number;
  /** O que o cliente paga agora */
  precoCliente: number;
  planoCheio: number | null;
  planoPromo: number | null;
  /** Desconto do plano (ou o padrão da conta), em % */
  desconto: number;
  estadoPromocao: EstadoPromocao;
  envio: SituacaoEnvio;
  /** true = a linha mostra a simulação (mudou aqui, falta lançar) */
  simulacao: boolean;
  /** Preço em que lucro e margem foram calculados */
  precoCalculo: number;
  det: Detalhamento;
  /** Lucro/margem no promocional planejado (pra comparar, pequeno) */
  detPlanoPromo: Detalhamento | null;
  /** Lucro/margem no que o cliente paga agora (quando a linha simula) */
  detAgora: Detalhamento;
  /** Maior desconto que ainda respeita a margem mínima, em % */
  descontoMaximo: number | null;
  /** Desconto fora do que o ML aceita (5% a 80%) */
  descontoForaDoMl: boolean;
  /** O preço calculado cruzou os R$ 79 em relação ao de hoje */
  cruzou79: boolean;
}

export function contaDaLinha(p: {
  anuncio: Anuncio;
  /** anúncio com o CMV do produto */
  comCmv: Anuncio;
  ajuste: AjusteCusto;
  cfg: ConfigPrecificacao;
  plano: PrecoPlanejado | null;
  descontoPadrao: number | null;
  margemMinima: number;
  /** custos do canal num preço (frete, taxa fixa, comissão) */
  custos: (preco: number) => CustosCanal | null | undefined;
  /** O seller está enviando este anúncio agora */
  enviando?: boolean;
}): ContaDaLinha {
  const { anuncio: a, comCmv, ajuste, cfg, plano } = p;
  const ativa = a.promocaoAtiva ?? null;
  const cheioCanal = ativa?.precoCheio ?? a.precoAtual;
  const precoCliente = ativa?.preco ?? a.precoAtual;

  const desconto = plano?.descontoPercentual ?? p.descontoPadrao ?? 0;
  const planoCheio = plano?.precoCheio ?? null;
  const planoPromo =
    plano && desconto > 0 ? (plano.precoPromocional ?? (planoCheio ? promoDoCheio(planoCheio, desconto) : null)) : null;

  let estadoPromocao: EstadoPromocao = "nenhuma";
  if (ativa) estadoPromocao = planoPromo !== null && Math.abs(ativa.preco - planoPromo) >= 0.01 ? "outro-valor" : "ativa";
  else if (planoPromo !== null) estadoPromocao = "sem-promocao";

  const alterado = planoCheio !== null && Math.abs(planoCheio - cheioCanal) >= 0.01;
  let envio: SituacaoEnvio = "sem-plano";
  if (p.enviando || plano?.statusEnvio === "enviando") envio = "enviando";
  else if (plano?.statusEnvio === "erro" && alterado) envio = "erro";
  else if (alterado) envio = "alterado";
  else if (plano) envio = "igual";

  // Custos do canal no preço (o de hoje já vem no próprio anúncio).
  const canal = (preco: number): CustosCanal | null => {
    if (Math.abs(preco - a.precoAtual) < 0.005) return null;
    return p.custos(preco) ?? null;
  };
  const calc = (preco: number) => detalharPreco(comCmv, preco, ajuste, cfg, undefined, canal(preco));

  const simulacao = envio === "alterado" || envio === "erro";
  const precoCalculo = simulacao ? (planoPromo ?? planoCheio ?? precoCliente) : precoCliente;
  const det = calc(precoCalculo);
  const detAgora = simulacao ? calc(precoCliente) : det;
  const detPlanoPromo =
    planoPromo !== null && Math.abs(planoPromo - precoCalculo) >= 0.01 ? calc(planoPromo) : null;

  const precoMinimo = precoParaMargem(comCmv, p.margemMinima, ajuste, cfg);
  const cheioRef = planoCheio ?? cheioCanal;
  const descontoMaximo =
    precoMinimo !== null && cheioRef > 0 ? Math.max(0, Math.floor((1 - precoMinimo / cheioRef) * 1000) / 10) : null;

  return {
    cheioCanal,
    precoCliente,
    planoCheio,
    planoPromo,
    desconto,
    estadoPromocao,
    envio,
    simulacao,
    precoCalculo,
    det,
    detPlanoPromo,
    detAgora,
    descontoMaximo,
    descontoForaDoMl: desconto > 0 && (desconto < DESCONTO_MIN_ML || desconto > DESCONTO_MAX_ML),
    cruzou79:
      a.marketplaceId === "mercado-livre" &&
      precoCalculo >= LIMITE_FRETE_GRATIS_ML !== precoCliente >= LIMITE_FRETE_GRATIS_ML,
  };
}

/** Preço pela margem, refeito com os custos do canal no preço achado. */
export function precoPelaMargem(
  comCmv: Anuncio,
  margem: number,
  ajuste: AjusteCusto,
  cfg: ConfigPrecificacao,
  custos: (preco: number) => CustosCanal | null | undefined,
): { preco: number | null; refinado: boolean } {
  const p0 = precoParaMargem(comCmv, margem, ajuste, cfg);
  if (p0 === null) return { preco: null, refinado: true };
  if (Math.abs(p0 - comCmv.precoAtual) < 0.005) return { preco: p0, refinado: true };
  const c = custos(p0);
  if (c === undefined) return { preco: p0, refinado: false };
  if (c === null) return { preco: p0, refinado: true };
  const ajustado: Anuncio = {
    ...comCmv,
    freteUnitario: c.frete ?? comCmv.freteUnitario,
    taxaFixa: c.taxaFixa ?? comCmv.taxaFixa,
    comissaoPercentual: c.comissaoPercentual ?? comCmv.comissaoPercentual,
    // As faixas do seller não valem mais: os custos já são os do canal.
    precoAtual: p0,
  };
  return { preco: precoParaMargem(ajustado, margem, ajuste, { ...cfg, faixas: {} }), refinado: true };
}
