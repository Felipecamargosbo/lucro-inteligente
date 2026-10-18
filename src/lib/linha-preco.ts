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
  comRebate,
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
  // Na promoção que está valendo, a redução de tarifa do canal (rebate) entra no lucro.
  const rebateAtivo = ativa?.rebate ?? 0;
  const calc = (preco: number) => {
    const d = detalharPreco(comCmv, preco, ajuste, cfg, undefined, canal(preco));
    return ativa && Math.abs(preco - ativa.preco) < 0.005 ? comRebate(d, rebateAtivo) : d;
  };

  // Os custos, o lucro e a margem da linha são os do preço que o seller
  // digitou (promocional, ou o cheio sem promoção). Quando esse preço é
  // diferente do que o cliente paga agora, a linha é uma simulação (azul) e
  // o "agora" aparece pequeno embaixo.
  const precoPlano = planoPromo ?? planoCheio;
  const simulacao =
    envio === "alterado" || envio === "erro" || (precoPlano !== null && Math.abs(precoPlano - precoCliente) >= 0.01);
  const precoCalculo = simulacao ? (precoPlano ?? precoCliente) : precoCliente;
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

/** Situações do canal que não vendem (somem da Precificação e das Promoções). */
const INATIVOS_CANAL = new Set(["under_review", "inactive", "closed"]);

/** Sem os inativos e sem o anúncio tradicional que tem o mesmo produto em
 * catálogo: no ML os dois andam juntos (mesmo preço e estoque), então só o
 * de catálogo aparece. */
export function anunciosVisiveis(lista: Anuncio[]): Anuncio[] {
  const ativos = lista.filter((a) => !a.statusCanal || !INATIVOS_CANAL.has(a.statusCanal));
  const comCatalogo = new Set(
    ativos.filter((a) => a.catalogo === true && a.grupoEstoque).map((a) => a.grupoEstoque as string),
  );
  return ativos.filter((a) => !(a.catalogo === false && a.grupoEstoque && comCatalogo.has(a.grupoEstoque)));
}

/** Nome que o seller conhece para cada tipo de promoção do Mercado Livre. */
export const ROTULO_TIPO_PROMOCAO: Record<string, string> = {
  DEAL: "Campanha do Mercado Livre",
  SMART: "Campanha automática",
  MARKETPLACE_CAMPAIGN: "Co-participada (ML ajuda)",
  LIGHTNING: "Oferta relâmpago",
  DOD: "Oferta do dia",
  PRICE_DISCOUNT: "Desconto individual",
  SELLER_CAMPAIGN: "Sua campanha (desconto por %)",
  VOLUME: "Desconto por quantidade",
  PRICE_MATCHING: "Preço competitivo",
  PRICE_MATCHING_MELI_ALL: "Preço competitivo",
  UNHEALTHY_STOCK: "Estoque parado (Full)",
  PRE_NEGOTIATED: "Pré-negociada",
  SELLER_COUPON_CAMPAIGN: "Cupom",
};

/** Promoções em que o seller escolhe o preço (as outras têm preço fixo do ML). */
export const PROMOCAO_COM_PRECO = new Set(["DEAL", "LIGHTNING", "DOD", "SELLER_CAMPAIGN", "PRICE_DISCOUNT"]);

/* ------------------------------------------------------------------ */
/* Avisos de preço e promoção (Agente de Precificação e Gestor)        */
/* ------------------------------------------------------------------ */

export interface AvisoPreco {
  id: string;
  gravidade: "vermelho" | "amarelo" | "verde";
  titulo: string;
  texto: string;
  /** Tela onde resolver */
  destino: "/produtos" | "/promocoes";
  /** Alguns anúncios de exemplo */
  exemplos: string[];
  quantidade: number;
}

export interface LinhaParaAviso {
  anuncio: Anuncio;
  conta: ContaDaLinha;
  margemMinima: number;
}

const exemplosDe = (l: LinhaParaAviso[]) => l.slice(0, 3).map((x) => x.anuncio.produto);

/** O que o seller precisa olhar em preço e promoção hoje. */
export function avisosPrecoPromocao(
  linhas: LinhaParaAviso[],
  propostasQueCabem: { campanha: string; quantidade: number }[],
  /** Propostas do ML com redução de tarifa (rebate) */
  rebates?: { valem: string[]; naoValem: number; total: number },
): AvisoPreco[] {
  const avisos: AvisoPreco[] = [];
  const dias = (iso: string | null | undefined) =>
    iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null;

  const vencendo = linhas.filter((l) => {
    const d = dias(l.anuncio.promocaoAtiva?.fim);
    return d !== null && d >= 0 && d <= 2;
  });
  if (vencendo.length)
    avisos.push({
      id: "vencendo",
      gravidade: "amarelo",
      titulo: `${vencendo.length} promoção(ões) vencem em até 2 dias`,
      texto: "Quando vencer, o preço volta para o cheio e as vendas costumam cair. Renove na tela Promoções.",
      destino: "/promocoes",
      exemplos: exemplosDe(vencendo),
      quantidade: vencendo.length,
    });

  const semPromo = linhas.filter((l) => l.conta.estadoPromocao === "sem-promocao");
  if (semPromo.length)
    avisos.push({
      id: "sem-promocao",
      gravidade: "vermelho",
      titulo: `${semPromo.length} anúncio(s) sem promoção ativa`,
      texto:
        "Têm desconto planejado na Precificação, mas nenhuma promoção valendo: o cliente está pagando o preço cheio. Crie a promoção na tela Promoções.",
      destino: "/promocoes",
      exemplos: exemplosDe(semPromo),
      quantidade: semPromo.length,
    });

  const outroValor = linhas.filter((l) => l.conta.estadoPromocao === "outro-valor");
  if (outroValor.length)
    avisos.push({
      id: "outro-valor",
      gravidade: "amarelo",
      titulo: `${outroValor.length} anúncio(s) em promoção num valor diferente do planejado`,
      texto: "A margem que vale é a do preço real da promoção. Confira se ainda cabe na sua margem mínima.",
      destino: "/promocoes",
      exemplos: exemplosDe(outroValor),
      quantidade: outroValor.length,
    });

  const abaixo = linhas.filter(
    (l) => l.anuncio.promocaoAtiva && (l.conta.simulacao ? l.conta.detAgora : l.conta.det).margem < l.margemMinima,
  );
  if (abaixo.length)
    avisos.push({
      id: "promo-abaixo",
      gravidade: "vermelho",
      titulo: `${abaixo.length} promoção(ões) abaixo da margem mínima`,
      texto: "O desconto dessas promoções come mais do que a sua margem mínima permite.",
      destino: "/promocoes",
      exemplos: exemplosDe(abaixo),
      quantidade: abaixo.length,
    });

  const recusados = linhas.filter((l) => l.conta.envio === "erro");
  if (recusados.length)
    avisos.push({
      id: "recusados",
      gravidade: "vermelho",
      titulo: `O Mercado Livre recusou ${recusados.length} preço(s) lançado(s)`,
      texto: "Abra a Precificação e passe o mouse na bolinha vermelha pra ver o motivo de cada um.",
      destino: "/produtos",
      exemplos: exemplosDe(recusados),
      quantidade: recusados.length,
    });

  const faltaLancar = linhas.filter((l) => l.conta.envio === "alterado");
  if (faltaLancar.length)
    avisos.push({
      id: "falta-lancar",
      gravidade: "amarelo",
      titulo: `${faltaLancar.length} preço(s) mudado(s) aqui e ainda não lançado(s)`,
      texto: "O Mercado Livre continua com o preço antigo até você clicar em Lançar.",
      destino: "/produtos",
      exemplos: exemplosDe(faltaLancar),
      quantidade: faltaLancar.length,
    });

  const frete = linhas.filter((l) => l.conta.simulacao && l.conta.cruzou79);
  if (frete.length)
    avisos.push({
      id: "frete-79",
      gravidade: "amarelo",
      titulo: `${frete.length} preço(s) planejado(s) cruzam a linha dos R$ ${LIMITE_FRETE_GRATIS_ML}`,
      texto: "A partir de R$ 79 o frete grátis é obrigatório e o frete que você paga sobe. A conta da linha já usa o frete novo.",
      destino: "/produtos",
      exemplos: exemplosDe(frete),
      quantidade: frete.length,
    });

  if (rebates && rebates.total > 0)
    avisos.push({
      id: "rebate",
      gravidade: rebates.valem.length > 0 ? "verde" : "amarelo",
      titulo: `${rebates.total} proposta(s) do Mercado Livre com redução de tarifa`,
      texto:
        rebates.valem.length > 0
          ? `${rebates.valem.length} valem a pena: o ML devolve parte da tarifa e o lucro fica na sua margem mínima.${rebates.naoValem ? ` ${rebates.naoValem} não compensam.` : ""}`
          : "Mesmo com a redução de tarifa, nenhuma cabe na sua margem mínima agora.",
      destino: "/promocoes",
      exemplos: rebates.valem.slice(0, 3),
      quantidade: rebates.total,
    });

  const cabem = propostasQueCabem.filter((p) => p.quantidade > 0);
  if (cabem.length)
    avisos.push({
      id: "campanhas-que-cabem",
      gravidade: "verde",
      titulo: `Campanhas do Mercado Livre que cabem na sua margem`,
      texto: cabem.map((c) => `${c.campanha}: ${c.quantidade} anúncio(s)`).join(" · "),
      destino: "/promocoes",
      exemplos: [],
      quantidade: cabem.reduce((s, c) => s + c.quantidade, 0),
    });

  return avisos;
}
