// Lógica de negócio financeira: como uma venda vira lucro líquido.
// Tudo aqui é puro (entra número, sai número) para no futuro funcionar
// igual com dados reais vindos das APIs.

import type {
  AlertaEstoque,
  Anuncio,
  ContaMarketplace,
  FaixaSaudeMargem,
  HistoricoAdsDia,
  CobrancaFullMes,
  HistoricoTaxaAnuncio,
  ItemCobrancaAuditor,
  ItemDivergenteAuditor,
  ItemEstoqueDetalhado,
  OcorrenciaAuditor,
  PedidoAfetadoAuditor,
  Lancamento,
  MarketplaceId,
  MetasMargem,
  OrigemValor,
  Pedido,
  Periodo,
  Promocao,
  SemaforoDecisao,
  VereditoReposicao,
} from "@/types";
import { dentroDoPeriodo, fimDoDia, inicioDoDia, listarDias, somarDias } from "./period";
import {
  ARMAZENAGEM_FULL,
  MOTIVOS_DEVOLUCAO_CULPA_SELLER,
  REGRAS_COBRANCA,
  tamanhoFulfillmentDoSku,
} from "./regrasCobranca";

export interface ResultadoVenda {
  precoVenda: number;
  cmv: number;
  impostos: number;
  comissao: number;
  taxaFixa: number;
  outrosCustos: number;
  custoTotal: number;
  lucroLiquido: number;
  margem: number;
}

export function calcularResultado(entrada: {
  precoVenda: number;
  cmv: number;
  impostoPercentual: number;
  comissaoPercentual: number;
  taxaFixa: number;
  outrosCustos: number;
}): ResultadoVenda {
  const impostos = entrada.precoVenda * entrada.impostoPercentual;
  const comissao = entrada.precoVenda * entrada.comissaoPercentual;
  const custoTotal =
    entrada.cmv + impostos + comissao + entrada.taxaFixa + entrada.outrosCustos;
  const lucroLiquido = entrada.precoVenda - custoTotal;
  return {
    precoVenda: entrada.precoVenda,
    cmv: entrada.cmv,
    impostos,
    comissao,
    taxaFixa: entrada.taxaFixa,
    outrosCustos: entrada.outrosCustos,
    custoTotal,
    lucroLiquido,
    margem: entrada.precoVenda > 0 ? lucroLiquido / entrada.precoVenda : 0,
  };
}

/** Preço de venda necessário para atingir uma margem líquida desejada (%). */
export function precoParaMargem(entrada: {
  cmv: number;
  impostoPercentual: number;
  comissaoPercentual: number;
  taxaFixa: number;
  outrosCustos: number;
  margemDesejada: number; // fração 0-1
}) {
  const divisor =
    1 - entrada.impostoPercentual - entrada.comissaoPercentual - entrada.margemDesejada;
  if (divisor <= 0) return 0;
  return (entrada.cmv + entrada.taxaFixa + entrada.outrosCustos) / divisor;
}

/** Preço de venda necessário para atingir um lucro em reais. */
export function precoParaLucro(entrada: {
  cmv: number;
  impostoPercentual: number;
  comissaoPercentual: number;
  taxaFixa: number;
  outrosCustos: number;
  lucroDesejado: number;
}) {
  const divisor = 1 - entrada.impostoPercentual - entrada.comissaoPercentual;
  if (divisor <= 0) return 0;
  return (
    (entrada.cmv + entrada.taxaFixa + entrada.outrosCustos + entrada.lucroDesejado) /
    divisor
  );
}

export function resultadoAnuncio(a: Anuncio, preco = a.precoAtual) {
  return calcularResultado({
    precoVenda: preco,
    // Anúncio sem custo cadastrado não tem margem real; aqui tratamos como 0
    // apenas para não quebrar o cálculo. Use raioXAnuncio() para saber disso.
    cmv: a.cmv ?? 0,
    impostoPercentual: a.impostoPercentual,
    comissaoPercentual: a.comissaoPercentual,
    taxaFixa: a.taxaFixa,
    outrosCustos: a.freteUnitario + a.custoMidiaUnitario + a.custoAfiliadoUnitario,
  });
}

/**
 * Breakdown completo de um anúncio, com cada taxa isolada e a faixa de saúde
 * relativa às metas do canal. É o que a Tabela Raio-X consome.
 */
export interface RaioXAnuncio {
  precoVenda: number;
  precoCheio: number | null;
  cmv: number;
  /** true = custo não cadastrado; lucro e margem abaixo NÃO são confiáveis */
  semCusto: boolean;
  impostos: number;
  comissao: number;
  taxaFixa: number;
  frete: number;
  midia: number;
  afiliados: number;
  /** Custos do próprio seller (embalagem, fita...), somados */
  custosOperacionais: number;
  /** Cada custo operacional com o nome que o seller deu */
  custosOperacionaisDetalhe: { nome: string; valor: number }[];
  /** Tudo que sai do preço menos o CMV (taxas do canal + imposto + mídia) */
  totalDescontos: number;
  /** CMV + totalDescontos */
  custoTotal: number;
  lucroLiquido: number;
  margem: number;
  faixa: FaixaSaudeMargem;
  origemTaxas: OrigemValor;
}

export function classificarFaixa(
  margem: number,
  metas: MetasMargem | null,
  semCusto: boolean,
): FaixaSaudeMargem {
  if (semCusto) return "sem-custo";
  if (margem < 0) return "prejuizo";
  if (!metas) return "sem-meta";
  if (margem < metas.margemMinima) return "abaixo-da-minima";
  if (margem < metas.margemIdeal) return "entre-minima-e-ideal";
  return "saudavel";
}

/** Opções que vêm das configurações do seller. */
export interface OpcoesRaioX {
  /** Alíquota de imposto configurada; sem ela usa a do próprio anúncio */
  aliquotaImposto?: number;
  /** Custos operacionais já resolvidos para este preço */
  custosOperacionais?: { nome: string; valor: number }[];
}

export function raioXAnuncio(
  a: Anuncio,
  metas: MetasMargem | null,
  preco = a.precoAtual,
  opcoes: OpcoesRaioX = {},
): RaioXAnuncio {
  const semCusto = a.cmv === null;
  const cmv = a.cmv ?? 0;

  const aliquota = opcoes.aliquotaImposto ?? a.impostoPercentual;
  const custosOperacionaisDetalhe = opcoes.custosOperacionais ?? [];
  const custosOperacionais = custosOperacionaisDetalhe.reduce(
    (s, c) => s + c.valor,
    0,
  );

  const impostos = preco * aliquota;
  const comissao = preco * a.comissaoPercentual;
  const totalDescontos =
    impostos +
    comissao +
    a.taxaFixa +
    a.freteUnitario +
    a.custoMidiaUnitario +
    a.custoAfiliadoUnitario +
    custosOperacionais;

  const custoTotal = cmv + totalDescontos;
  const lucroLiquido = preco - custoTotal;
  const margem = preco > 0 ? lucroLiquido / preco : 0;

  return {
    precoVenda: preco,
    precoCheio: a.precoCheio,
    cmv,
    semCusto,
    impostos,
    comissao,
    taxaFixa: a.taxaFixa,
    frete: a.freteUnitario,
    midia: a.custoMidiaUnitario,
    afiliados: a.custoAfiliadoUnitario,
    custosOperacionais,
    custosOperacionaisDetalhe,
    totalDescontos,
    custoTotal,
    lucroLiquido,
    margem,
    faixa: classificarFaixa(margem, metas, semCusto),
    origemTaxas: a.origemTaxas,
  };
}

/* ------------------------------------------------------------------ */
/* Limites de preço                                                    */
/* ------------------------------------------------------------------ */

/**
 * Até onde o preço de um anúncio pode cair. A margem mínima é uma REGRA em
 * percentual (vem das metas da conta, definidas em Configurações); aqui ela
 * vira VALOR em reais, anúncio por anúncio — porque comissão, frete e taxa
 * mudam de canal para canal, e 20% nunca é o mesmo preço em dois lugares.
 *
 * É este número que o agente de precificação usa como freio: acima do
 * `precoMinimo` ele pode agir sozinho; abaixo, precisa de aprovação.
 */
export interface LimitesPreco {
  /** Menor preço que ainda respeita a margem mínima */
  precoMinimo: number;
  /** Preço em que o lucro é exatamente zero — abaixo dele, prejuízo */
  precoEmpate: number;
  /** Margem no preço praticado hoje (0-1) */
  margemAtual: number;
  /** Preço de hoje já está abaixo da margem mínima */
  abaixoDoMinimo: boolean;
  /** Preço de hoje está abaixo do empate (venda com prejuízo) */
  emPrejuizo: boolean;
  /** Quanto falta subir para voltar ao mínimo; 0 quando já está acima */
  faltaParaMinimo: number;
  /** false quando não há CMV cadastrado — os números acima NÃO valem */
  calculavel: boolean;
}

export interface OpcoesLimites {
  /** Alíquota das configurações; sem ela usa a do próprio anúncio */
  aliquotaImposto?: number;
  /** Soma dos custos operacionais para um dado preço (percentuais dependem dele) */
  custosOperacionais?: (preco: number) => number;
}

/** Percentuais e valores fixos de um anúncio, separados — é a separação que
 * explica por que a margem despenca tão rápido em ticket baixo: o frete e o
 * CMV continuam inteiros enquanto o preço encolhe. */
function componentes(a: Anuncio, opcoes: OpcoesLimites) {
  const aliquota = opcoes.aliquotaImposto ?? a.impostoPercentual;
  return {
    percentuais: aliquota + a.comissaoPercentual,
    fixos:
      (a.cmv ?? 0) +
      a.taxaFixa +
      a.freteUnitario +
      a.custoMidiaUnitario +
      a.custoAfiliadoUnitario,
    resolverOp: opcoes.custosOperacionais ?? (() => 0),
  };
}

/** Margem que sobraria se este anúncio fosse vendido a `preco`. */
export function margemNoPreco(
  a: Anuncio,
  preco: number,
  opcoes: OpcoesLimites = {},
): number {
  if (preco <= 0) return 0;
  const { percentuais, fixos, resolverOp } = componentes(a, opcoes);
  return (preco - preco * percentuais - fixos - resolverOp(preco)) / preco;
}

export function limitesDePreco(
  a: Anuncio,
  margemMinima: number,
  opcoes: OpcoesLimites = {},
): LimitesPreco {
  const calculavel = a.cmv !== null;
  const { percentuais, fixos, resolverOp } = componentes(a, opcoes);

  // Custo operacional percentual depende do preço, e o preço depende dele.
  // Duas passadas já convergem na casa do centavo para os valores reais.
  const precoPara = (margem: number) => {
    const divisor = 1 - percentuais - margem;
    if (divisor <= 0) return 0;
    let preco = (fixos + resolverOp(a.precoAtual)) / divisor;
    preco = (fixos + resolverOp(preco)) / divisor;
    return (fixos + resolverOp(preco)) / divisor;
  };

  const precoMinimo = precoPara(margemMinima);
  const precoEmpate = precoPara(0);
  const margemAtual = margemNoPreco(a, a.precoAtual, opcoes);

  return {
    precoMinimo,
    precoEmpate,
    margemAtual,
    abaixoDoMinimo: calculavel && precoMinimo > 0 && a.precoAtual < precoMinimo,
    emPrejuizo: calculavel && a.precoAtual < precoEmpate,
    faltaParaMinimo:
      calculavel && precoMinimo > a.precoAtual ? precoMinimo - a.precoAtual : 0,
    calculavel,
  };
}

/* ------------------------------------------------------------------ */
/* Agente de giro                                                      */
/* ------------------------------------------------------------------ */

/** Dias sem vender a partir dos quais o produto conta como parado. */
export const DIAS_PARADO_PADRAO = 30;

/**
 * Quanto o agente corta por vez. Desconto pequeno de propósito: a ideia é
 * parar no PRIMEIRO preço que volta a vender, não ir direto ao piso e
 * queimar margem que talvez nem fosse necessário queimar.
 */
export const DEGRAU_DESCONTO_PADRAO = 0.05;

/** Há quantos dias este anúncio não vende. null = nunca vendeu. */
export function diasSemVender(a: Anuncio, referencia = new Date()): number | null {
  if (!a.dataUltimaVenda) return null;
  const dias = Math.floor(
    (referencia.getTime() - new Date(a.dataUltimaVenda).getTime()) / 86400000,
  );
  return Math.max(0, dias);
}

export interface SugestaoGiro {
  precoSugerido: number;
  margemSugerida: number;
  margemAtual: number;
  precoMinimo: number;
  precoEmpate: number;
  diasParado: number;
  /** O degrau bateria abaixo do piso e foi travado nele */
  travadoNoPiso: boolean;
  semaforo: SemaforoDecisao;
}

/**
 * A decisão do agente de precificação, em uma função pura.
 *
 * Regra: produto parado há mais de `diasParado` dias leva um corte de um
 * degrau, NUNCA abaixo do preço mínimo daquele canal. Se o corte cheio
 * passaria do piso, o agente para no piso e marca `travadoNoPiso` — cabe ao
 * seller decidir se quer ir além.
 *
 * Devolve null quando não há o que propor: sem CMV (não dá para calcular),
 * sem venda nenhuma (não existe "parado"), ainda girando, ou já no piso.
 */
export function sugerirPrecoPorGiro(
  a: Anuncio,
  margemMinima: number,
  opcoes: OpcoesLimites = {},
  config: { diasParado?: number; degrau?: number; referencia?: Date } = {},
): SugestaoGiro | null {
  const limiteDias = config.diasParado ?? DIAS_PARADO_PADRAO;
  const degrau = config.degrau ?? DEGRAU_DESCONTO_PADRAO;

  const dias = diasSemVender(a, config.referencia);
  if (dias === null || dias < limiteDias) return null;

  const lim = limitesDePreco(a, margemMinima, opcoes);
  if (!lim.calculavel) return null;

  // Já está no piso ou abaixo dele: cortar mais fura a margem mínima, e
  // isso o agente não propõe sozinho — quem decide queimar é o seller.
  if (a.precoAtual <= lim.precoMinimo) return null;

  const alvo = Math.round(a.precoAtual * (1 - degrau) * 100) / 100;
  const travadoNoPiso = alvo < lim.precoMinimo;
  const precoSugerido = travadoNoPiso
    ? Math.round(lim.precoMinimo * 100) / 100
    : alvo;

  const margemSugerida = margemNoPreco(a, precoSugerido, opcoes);
  const semaforo: SemaforoDecisao =
    precoSugerido < lim.precoEmpate
      ? "vermelho"
      : margemSugerida < margemMinima - 0.0001
        ? "amarelo"
        : "verde";

  return {
    precoSugerido,
    margemSugerida,
    margemAtual: lim.margemAtual,
    precoMinimo: lim.precoMinimo,
    precoEmpate: lim.precoEmpate,
    diasParado: dias,
    travadoNoPiso,
    semaforo,
  };
}

/** Cobertura de dados: sem isso, a margem exibida é uma promessa vazia. */
export interface CoberturaDados {
  total: number;
  comCusto: number;
  semCusto: number;
  semVinculo: number;
  /** 0-1 — fração do catálogo com margem realmente calculável */
  percentualCalculavel: number;
  /** Anúncios cujas taxas ainda são projeção, não liquidação do canal */
  comTaxaEstimada: number;
}

export function calcularCobertura(anuncios: Anuncio[]): CoberturaDados {
  const total = anuncios.length;
  const comCusto = anuncios.filter((a) => a.cmv !== null).length;
  const semVinculo = anuncios.filter((a) => !a.produtoId).length;
  const comTaxaEstimada = anuncios.filter((a) => a.origemTaxas === "estimado").length;
  return {
    total,
    comCusto,
    semCusto: total - comCusto,
    semVinculo,
    percentualCalculavel: total > 0 ? comCusto / total : 0,
    comTaxaEstimada,
  };
}

/**
 * Curva ABC por faturamento: A = até 80% acumulado, B = até 95%, C = o resto.
 * Mostra onde vale gastar atenção num catálogo de centenas de anúncios.
 */
export interface ItemCurvaABC {
  anuncio: Anuncio;
  faturamento: number;
  participacao: number; // 0-1
  acumulado: number; // 0-1
  classe: "A" | "B" | "C";
}

export function curvaABC(anuncios: Anuncio[]): ItemCurvaABC[] {
  const comFaturamento = anuncios.map((a) => ({
    anuncio: a,
    faturamento: a.precoAtual * a.unidadesVendidas,
  }));
  const total = comFaturamento.reduce((s, i) => s + i.faturamento, 0);
  if (total <= 0) return [];

  let acumulado = 0;
  return comFaturamento
    .sort((a, b) => b.faturamento - a.faturamento)
    .map((item) => {
      const participacao = item.faturamento / total;
      acumulado += participacao;
      const classe: "A" | "B" | "C" =
        acumulado <= 0.8 ? "A" : acumulado <= 0.95 ? "B" : "C";
      return { ...item, participacao, acumulado, classe };
    });
}

export function resultadoPromocao(p: Promocao) {
  return calcularResultado({
    precoVenda: p.precoFinal,
    cmv: p.cmv,
    impostoPercentual: p.impostoPercentual,
    comissaoPercentual: p.comissaoPercentual,
    taxaFixa: p.taxaFixa,
    outrosCustos: 0,
  });
}

export interface ResumoPeriodo {
  faturamento: number;
  pedidos: number;
  ticketMedio: number;
  /** Soma de unidades vendidas (não confundir com skusDistintos) */
  unidades: number;
  /** Quantos produtos diferentes venderam — se caiu 1 venda daquele SKU, conta 1 */
  skusDistintos: number;
  cmv: number;
  impostos: number;
  comissoes: number;
  /** Taxa fixa por pedido cobrada pelo canal, isolada das comissões */
  taxasFixas: number;
  outrosCustos: number;
  /**
   * O que o marketplace de fato repassa ao seller: faturamento menos a
   * comissão e a taxa fixa do canal. CMV, impostos e custos do próprio
   * seller ainda saem daqui — por isso este número não é lucro.
   */
  liquidoMarketplace: number;
  /**
   * ADS/mídia paga. De propósito NÃO entra em custosTotais nem em
   * lucroLiquido — este é o lucro "antes de ADS", igual já era mostrado em
   * todo o sistema. Para o lucro pós-ADS, subtraia custoMidia à parte.
   */
  custoMidia: number;
  custosTotais: number;
  lucroLiquido: number;
  margem: number;
  pedidosCancelados: number;
  valorCancelado: number;
}

export function filtrarPorPeriodo(pedidos: Pedido[], periodo: Periodo) {
  return pedidos.filter((p) => dentroDoPeriodo(p.data, periodo));
}

export function resumir(pedidos: Pedido[]): ResumoPeriodo {
  const validos = pedidos.filter((p) => p.status !== "cancelado");
  const cancelados = pedidos.filter((p) => p.status === "cancelado");

  const soma = (fn: (p: Pedido) => number) =>
    validos.reduce((acc, p) => acc + fn(p), 0);

  const faturamento = soma((p) => p.faturamento);
  const lucroLiquido = soma((p) => p.lucroLiquido);
  const outrosCustos = soma((p) => p.outrosCustos + p.taxaFixa + p.descontos);
  const unidades = validos.reduce((acc, p) => acc + p.quantidade, 0);
  const skusDistintos = new Set(validos.map((p) => p.sku)).size;
  const comissoes = soma((p) => p.comissao);
  const taxasFixas = soma((p) => p.taxaFixa);

  return {
    faturamento,
    pedidos: validos.length,
    ticketMedio: validos.length ? faturamento / validos.length : 0,
    unidades,
    skusDistintos,
    cmv: soma((p) => p.cmv),
    impostos: soma((p) => p.impostos),
    comissoes,
    taxasFixas,
    liquidoMarketplace: faturamento - comissoes - taxasFixas,
    outrosCustos,
    custoMidia: soma((p) => p.custoMidia),
    custosTotais: faturamento - lucroLiquido,
    lucroLiquido,
    margem: faturamento ? lucroLiquido / faturamento : 0,
    pedidosCancelados: cancelados.length,
    valorCancelado: cancelados.reduce((acc, p) => acc + p.faturamento, 0),
  };
}

export function variacao(atual: number, anterior: number) {
  if (!anterior) return atual > 0 ? 1 : 0;
  return (atual - anterior) / Math.abs(anterior);
}

export interface PontoDia {
  dia: string; // dd/mm
  data: string; // ISO
  faturamento: number;
  lucro: number;
  /** Contagem de pedidos válidos no dia — não confundir com unidades */
  pedidos: number;
  /** Soma de unidades vendidas no dia (um pedido pode ter mais de 1 unidade) */
  unidades: number;
  /** Faturamento do dia menos comissão e taxa fixa — o repasse do canal */
  liquidoMarketplace: number;
  /** Faturamento do dia ÷ pedidos do dia */
  ticketMedio: number;
  /** ADS/mídia paga no dia */
  custoMidia: number;
}

export function seriePorDia(pedidos: Pedido[], periodo: Periodo): PontoDia[] {
  const mapa = new Map<string, PontoDia>();
  for (const dia of listarDias(periodo)) {
    const chave = inicioDoDia(dia).toDateString();
    mapa.set(chave, {
      dia: dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      data: dia.toISOString(),
      faturamento: 0,
      lucro: 0,
      pedidos: 0,
      unidades: 0,
      liquidoMarketplace: 0,
      ticketMedio: 0,
      custoMidia: 0,
    });
  }
  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    const chave = inicioDoDia(new Date(p.data)).toDateString();
    const ponto = mapa.get(chave);
    if (!ponto) continue;
    ponto.faturamento += p.faturamento;
    ponto.lucro += p.lucroLiquido;
    ponto.pedidos += 1;
    ponto.unidades += p.quantidade;
    ponto.liquidoMarketplace += p.faturamento - p.comissao - p.taxaFixa;
    ponto.custoMidia += p.custoMidia;
  }
  for (const ponto of mapa.values()) {
    ponto.ticketMedio = ponto.pedidos ? ponto.faturamento / ponto.pedidos : 0;
  }
  return [...mapa.values()];
}

/* ------------------------------------------------------------------ */
/* Saúde de margem dia a dia                                          */
/* ------------------------------------------------------------------ */

/** Usada quando a conta não tem meta de margem cadastrada. Mesmas faixas do
 * selo de margem que já aparece nas tabelas do sistema. */
export const FAIXAS_MARGEM_PADRAO: MetasMargem = {
  margemMinima: 0.1,
  margemIdeal: 0.2,
};

export interface PontoSaudeMargem {
  dia: string;
  /** Percentuais 0-100 — é o que o gráfico empilhado desenha */
  excelente: number;
  saudavel: number;
  critica: number;
  qtdExcelente: number;
  qtdSaudavel: number;
  qtdCritica: number;
  valorExcelente: number;
  valorSaudavel: number;
  valorCritica: number;
  pedidos: number;
}

/**
 * Distribuição diária dos pedidos por faixa de margem. A faixa é sempre
 * relativa à meta da conta que vendeu — 8% pode ser ótimo num canal e
 * péssimo em outro. Sem meta cadastrada, usa FAIXAS_MARGEM_PADRAO.
 */
export function serieSaudeMargem(
  pedidos: Pedido[],
  periodo: Periodo,
  metasPorConta: Record<string, MetasMargem | null> = {},
): PontoSaudeMargem[] {
  const mapa = new Map<string, PontoSaudeMargem>();
  for (const dia of listarDias(periodo)) {
    mapa.set(inicioDoDia(dia).toDateString(), {
      dia: dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      excelente: 0,
      saudavel: 0,
      critica: 0,
      qtdExcelente: 0,
      qtdSaudavel: 0,
      qtdCritica: 0,
      valorExcelente: 0,
      valorSaudavel: 0,
      valorCritica: 0,
      pedidos: 0,
    });
  }

  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    const ponto = mapa.get(inicioDoDia(new Date(p.data)).toDateString());
    if (!ponto) continue;

    const metas = metasPorConta[p.contaId] ?? FAIXAS_MARGEM_PADRAO;
    ponto.pedidos += 1;

    if (p.margem >= metas.margemIdeal) {
      ponto.qtdExcelente += 1;
      ponto.valorExcelente += p.faturamento;
    } else if (p.margem >= metas.margemMinima) {
      ponto.qtdSaudavel += 1;
      ponto.valorSaudavel += p.faturamento;
    } else {
      ponto.qtdCritica += 1;
      ponto.valorCritica += p.faturamento;
    }
  }

  for (const ponto of mapa.values()) {
    if (!ponto.pedidos) continue;
    ponto.excelente = (ponto.qtdExcelente / ponto.pedidos) * 100;
    ponto.saudavel = (ponto.qtdSaudavel / ponto.pedidos) * 100;
    ponto.critica = (ponto.qtdCritica / ponto.pedidos) * 100;
  }

  return [...mapa.values()];
}

export interface Projecao {
  serie: { dia: string; realizado: number | null; projetado: number | null }[];
  realizado: number;
  projetadoFinalMes: number;
  mediaDiaria: number;
  diasDecorridos: number;
  diasNoMes: number;
}

/** Projeta o resultado do mês corrente pela média diária já realizada. */
export function projetarMes(pedidos: Pedido[], hoje = new Date()): Projecao {
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();
  const diasDecorridos = hoje.getDate();

  const doMes = pedidos.filter((p) => {
    const d = new Date(p.data);
    return d.getFullYear() === ano && d.getMonth() === mes && p.status !== "cancelado";
  });

  const porDia = new Array(diasNoMes).fill(0) as number[];
  for (const p of doMes) {
    const idx = new Date(p.data).getDate() - 1;
    porDia[idx] = (porDia[idx] ?? 0) + p.faturamento;
  }

  let acumulado = 0;
  const realizadoAcumulado = porDia.map((v, i) => {
    if (i < diasDecorridos) acumulado += v;
    return i < diasDecorridos ? acumulado : null;
  });

  const realizado = acumulado;
  const mediaDiaria = diasDecorridos ? realizado / diasDecorridos : 0;
  const projetadoFinalMes = mediaDiaria * diasNoMes;

  const serie = porDia.map((_, i) => {
    const dia = `${`${i + 1}`.padStart(2, "0")}/${`${mes + 1}`.padStart(2, "0")}`;
    const projetado =
      i + 1 >= diasDecorridos ? Math.round(mediaDiaria * (i + 1) * 100) / 100 : null;
    return { dia, realizado: realizadoAcumulado[i] ?? null, projetado };
  });

  return {
    serie,
    realizado,
    projetadoFinalMes,
    mediaDiaria,
    diasDecorridos,
    diasNoMes,
  };
}

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Converte "AAAA-MM" (formato do <input type="month">) num Período do mês cheio. */
export function periodoDoMes(anoMes: string): Periodo {
  const [ano, mes] = anoMes.split("-").map(Number);
  const inicio = new Date(ano!, mes! - 1, 1, 0, 0, 0, 0);
  const fim = new Date(ano!, mes!, 0, 23, 59, 59, 999);
  return { inicio, fim, rotulo: `${NOMES_MES[mes! - 1]} de ${ano}` };
}

export function anoMesDeHoje(deslocamentoMeses = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + deslocamentoMeses);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export interface ItemAgregadoSku {
  sku: string;
  produto: string;
  unidades: number;
  faturamento: number;
  lucro: number;
  margem: number;
}

/** Agrupa pedidos válidos por SKU, somando unidades, faturamento e lucro. */
export function agruparPorSku(pedidos: Pedido[]): ItemAgregadoSku[] {
  const mapa = new Map<string, ItemAgregadoSku>();
  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    const atual = mapa.get(p.sku) ?? {
      sku: p.sku,
      produto: p.produto,
      unidades: 0,
      faturamento: 0,
      lucro: 0,
      margem: 0,
    };
    atual.unidades += p.quantidade;
    atual.faturamento += p.faturamento;
    atual.lucro += p.lucroLiquido;
    mapa.set(p.sku, atual);
  }
  for (const item of mapa.values()) {
    item.margem = item.faturamento ? item.lucro / item.faturamento : 0;
  }
  return [...mapa.values()];
}

export interface ItemAdsPorSku {
  sku: string;
  produto: string;
  /** Unidades vendidas no período (soma de todos os pedidos desse SKU) */
  quantidade: number;
  faturamento: number;
  custoMidia: number;
  /** Lucro antes de descontar o ADS deste produto (o "lucro líquido" de sempre) */
  lucroAntesAds: number;
  /** Lucro depois de descontar o ADS — o que realmente sobrou */
  lucroPosAds: number;
  /** true quando o ADS gasto é maior que o lucro que o produto gerava antes dele */
  semRetorno: boolean;
}

/** Agrupa pedidos por SKU somando o gasto de ADS, para achar quem consome
 * mídia sem retorno — quando o gasto supera o lucro que o produto já tinha. */
export function agruparPorSkuComAds(pedidos: Pedido[]): ItemAdsPorSku[] {
  const mapa = new Map<string, ItemAdsPorSku>();
  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    const atual = mapa.get(p.sku) ?? {
      sku: p.sku,
      produto: p.produto,
      quantidade: 0,
      faturamento: 0,
      custoMidia: 0,
      lucroAntesAds: 0,
      lucroPosAds: 0,
      semRetorno: false,
    };
    atual.quantidade += p.quantidade;
    atual.faturamento += p.faturamento;
    atual.custoMidia += p.custoMidia;
    atual.lucroAntesAds += p.lucroLiquido;
    mapa.set(p.sku, atual);
  }
  for (const item of mapa.values()) {
    item.lucroPosAds = item.lucroAntesAds - item.custoMidia;
    item.semRetorno = item.custoMidia > 0 && item.custoMidia > item.lucroAntesAds;
  }
  return [...mapa.values()].filter((i) => i.custoMidia > 0);
}

/* ------------------------------------------------------------------ */
/* DRE — Demonstração do Resultado do Exercício                        */
/* ------------------------------------------------------------------ */

/**
 * O DRE é fechado por EMPRESA (CNPJ) e por MÊS. Nunca soma empresas
 * diferentes: cada CNPJ tem regime tributário, despesas e resultado
 * próprios, e um consolidado misturando os dois não valeria como
 * demonstrativo.
 *
 * A cascata segue exatamente a mesma conta que o resto do sistema usa
 * (lucro = faturamento − CMV − comissão − taxa fixa − imposto − outros
 * custos), então o número que aparece aqui bate com o das outras telas.
 */

/** Mês de competência de uma data, no formato "2026-09". */
export function chaveCompetencia(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

/** Rótulo legível de uma competência: "2026-09" → "Setembro/2026". */
export function rotuloCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  const data = new Date(Number(ano), Number(mes) - 1, 1);
  const nome = data.toLocaleDateString("pt-BR", { month: "long" });
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}/${ano}`;
}

/** O período (do dia 1 ao último dia) de uma competência. */
export function periodoDaCompetencia(competencia: string): Periodo {
  const [ano, mes] = competencia.split("-").map(Number);
  const a = ano ?? new Date().getFullYear();
  const m = mes ?? 1;
  const inicio = new Date(a, m - 1, 1, 0, 0, 0, 0);
  const fim = new Date(a, m, 0, 23, 59, 59, 999);
  return { inicio, fim, rotulo: rotuloCompetencia(competencia) };
}

/** Quantos meses separam duas competências ("2026-01" → "2026-04" = 3). */
export function distanciaEmMeses(de: string, ate: string): number {
  const [a1, m1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  if (a1 === undefined || m1 === undefined || a2 === undefined || m2 === undefined) {
    return 0;
  }
  return (a2 - a1) * 12 + (m2 - m1);
}

/** A competência N meses antes/depois de outra. */
export function deslocarCompetencia(competencia: string, meses: number): string {
  const [ano, mes] = competencia.split("-").map(Number);
  const data = new Date(ano ?? 2026, (mes ?? 1) - 1 + meses, 1);
  return chaveCompetencia(data);
}

/**
 * Os lançamentos que valem num determinado mês. Um lançamento recorrente é
 * guardado uma vez só (mês em que começa) e repete pra sempre por cálculo —
 * a menos que `competenciaFim` diga onde parar, ou que este mês específico
 * esteja em `mesesExcluidos` (uma exceção pontual, sem afetar os outros).
 */
export function lancamentosDoMes(
  lancamentos: Lancamento[],
  empresaId: string,
  competencia: string,
): Lancamento[] {
  return lancamentos.filter((l) => {
    if (l.empresaId !== empresaId) return false;
    if (l.mesesExcluidos.includes(competencia)) return false;
    const distancia = distanciaEmMeses(l.competencia, competencia);
    if (distancia < 0) return false;
    if (distancia === 0) return true;
    if (!l.recorrente) return false;
    if (l.competenciaFim && distanciaEmMeses(l.competenciaFim, competencia) < 0) return false;
    return true;
  });
}

export interface DreConta {
  contaId: string;
  nome: string;
  marketplaceId: MarketplaceId;
  pedidos: number;
  faturamento: number;
  comissao: number;
  taxaFixa: number;
  /** Faturamento menos comissão e taxa fixa: o que o canal repassa */
  liquidoMarketplace: number;
  cmv: number;
  impostos: number;
  /** Embalagem, frete e outros custos do próprio seller, por venda */
  custosPorVenda: number;
  /** O que sobra da venda antes das despesas fixas da empresa */
  margemContribuicao: number;
  ads: number;
  resultado: number;
}

export interface DreEmpresa {
  empresaId: string;
  competencia: string;
  contas: DreConta[];
  faturamento: number;
  comissao: number;
  taxaFixa: number;
  liquidoMarketplace: number;
  cmv: number;
  impostos: number;
  custosPorVenda: number;
  margemContribuicao: number;
  ads: number;
  /** Soma do "resultado" de todas as contas, antes das despesas fixas */
  resultadoDasContas: number;
  despesas: number;
  receitasExtras: number;
  lucroLiquido: number;
  margem: number;
  /** Quanto precisa faturar no mês para não ter prejuízo */
  pontoEquilibrio: number;
  /** O quanto o faturamento está acima do ponto de equilíbrio (fração) */
  margemSeguranca: number;
  lancamentosDespesa: Lancamento[];
  lancamentosReceita: Lancamento[];
}

function contaVazia(conta: ContaMarketplace): DreConta {
  return {
    contaId: conta.id,
    nome: conta.nome,
    marketplaceId: conta.marketplaceId,
    pedidos: 0,
    faturamento: 0,
    comissao: 0,
    taxaFixa: 0,
    liquidoMarketplace: 0,
    cmv: 0,
    impostos: 0,
    custosPorVenda: 0,
    margemContribuicao: 0,
    ads: 0,
    resultado: 0,
  };
}

/**
 * Monta o DRE de uma empresa num mês. Só entram as contas daquela empresa e
 * os pedidos daquelas contas — o resto do sistema fica de fora.
 */
export function montarDre(entrada: {
  pedidos: Pedido[];
  contas: ContaMarketplace[];
  lancamentos: Lancamento[];
  empresaId: string;
  competencia: string;
}): DreEmpresa {
  const { pedidos, contas, lancamentos, empresaId, competencia } = entrada;

  const contasDaEmpresa = contas.filter((c) => c.empresaId === empresaId);
  const idsDaEmpresa = new Set(contasDaEmpresa.map((c) => c.id));
  const periodo = periodoDaCompetencia(competencia);

  const doMes = pedidos.filter(
    (p) =>
      p.status !== "cancelado" &&
      idsDaEmpresa.has(p.contaId) &&
      dentroDoPeriodo(p.data, periodo),
  );

  const porConta = new Map<string, DreConta>();
  for (const conta of contasDaEmpresa) porConta.set(conta.id, contaVazia(conta));

  for (const p of doMes) {
    const linha = porConta.get(p.contaId);
    if (!linha) continue;
    linha.pedidos += 1;
    linha.faturamento += p.faturamento;
    linha.comissao += p.comissao;
    linha.taxaFixa += p.taxaFixa;
    linha.cmv += p.cmv;
    linha.impostos += p.impostos;
    linha.custosPorVenda += p.outrosCustos;
    linha.ads += p.custoMidia;
  }

  for (const linha of porConta.values()) {
    linha.liquidoMarketplace = linha.faturamento - linha.comissao - linha.taxaFixa;
    linha.margemContribuicao =
      linha.liquidoMarketplace - linha.cmv - linha.impostos - linha.custosPorVenda;
    linha.resultado = linha.margemContribuicao - linha.ads;
  }

  // Conta sem venda no mês não vira bloco na tela — só polui.
  const listaContas = [...porConta.values()]
    .filter((c) => c.pedidos > 0)
    .sort((a, b) => b.faturamento - a.faturamento);

  const soma = (fn: (c: DreConta) => number) =>
    listaContas.reduce((acc, c) => acc + fn(c), 0);

  const faturamento = soma((c) => c.faturamento);
  const margemContribuicao = soma((c) => c.margemContribuicao);
  const resultadoDasContas = soma((c) => c.resultado);

  const doMesEmpresa = lancamentosDoMes(lancamentos, empresaId, competencia);
  const lancamentosDespesa = doMesEmpresa.filter((l) => l.tipo === "despesa");
  const lancamentosReceita = doMesEmpresa.filter((l) => l.tipo === "receita");
  const despesas = lancamentosDespesa.reduce((s, l) => s + l.valor, 0);
  const receitasExtras = lancamentosReceita.reduce((s, l) => s + l.valor, 0);

  const lucroLiquido = resultadoDasContas - despesas + receitasExtras;

  // Ponto de equilíbrio: quanto precisa faturar para o resultado das vendas
  // cobrir exatamente as despesas fixas. Sem despesa lançada não existe
  // ponto de equilíbrio para calcular.
  const proporcaoContribuicao = faturamento > 0 ? resultadoDasContas / faturamento : 0;
  const pontoEquilibrio =
    despesas > 0 && proporcaoContribuicao > 0 ? despesas / proporcaoContribuicao : 0;
  const margemSeguranca =
    pontoEquilibrio > 0 && faturamento > 0
      ? (faturamento - pontoEquilibrio) / faturamento
      : 0;

  return {
    empresaId,
    competencia,
    contas: listaContas,
    faturamento,
    comissao: soma((c) => c.comissao),
    taxaFixa: soma((c) => c.taxaFixa),
    liquidoMarketplace: soma((c) => c.liquidoMarketplace),
    cmv: soma((c) => c.cmv),
    impostos: soma((c) => c.impostos),
    custosPorVenda: soma((c) => c.custosPorVenda),
    margemContribuicao,
    ads: soma((c) => c.ads),
    resultadoDasContas,
    despesas,
    receitasExtras,
    lucroLiquido,
    margem: faturamento > 0 ? lucroLiquido / faturamento : 0,
    pontoEquilibrio,
    margemSeguranca,
    lancamentosDespesa,
    lancamentosReceita,
  };
}

/* ------------------------------------------------------------------ */
/* Agente Analista                                                     */
/* ------------------------------------------------------------------ */
// As cinco frentes do Analista: cada função aqui olha um pedaço do que o
// sistema já calcula e decide se há algo que merece virar aviso. Nenhuma
// delas decide preço ou executa nada — só aponta o que merece atenção,
// igual um analista de verdade faria numa reunião de resultado.

export interface DiagnosticoMargem {
  margemAtual: number;
  margemAnterior: number;
  faturamentoAtual: number;
  faturamentoAnterior: number;
  /** Pontos percentuais de diferença — negativo é piora */
  diferencaPP: number;
  periodoRotulo: string;
}

/** Quantos pontos percentuais de queda já valem um aviso. Queda menor que
 * isso é ruído normal do dia a dia, não vale interromper o seller. */
export const LIMIAR_QUEDA_MARGEM_PP = 3;

/**
 * Compara a margem dos últimos `dias` com o período igual, imediatamente
 * anterior — hoje vs. os `dias` dias antes de hoje. Só retorna algo
 * quando a queda passa do limiar; alta ou estabilidade não geram aviso.
 */
export function diagnosticarQuedaMargem(
  pedidos: Pedido[],
  dias = 7,
  referencia = new Date(),
): DiagnosticoMargem | null {
  const fimAtual = fimDoDia(referencia);
  const inicioAtual = inicioDoDia(somarDias(referencia, -(dias - 1)));
  const fimAnterior = fimDoDia(somarDias(inicioAtual, -1));
  const inicioAnterior = inicioDoDia(somarDias(inicioAtual, -dias));

  const periodoAtual: Periodo = { inicio: inicioAtual, fim: fimAtual, rotulo: `Últimos ${dias} dias` };
  const periodoAnterior: Periodo = {
    inicio: inicioAnterior,
    fim: fimAnterior,
    rotulo: `${dias} dias anteriores`,
  };

  const resumoAtual = resumir(filtrarPorPeriodo(pedidos, periodoAtual));
  const resumoAnterior = resumir(filtrarPorPeriodo(pedidos, periodoAnterior));

  // Sem venda no período anterior pra comparar — não dá pra dizer se
  // piorou ou melhorou, então não inventa um diagnóstico.
  if (resumoAnterior.faturamento <= 0 || resumoAtual.faturamento <= 0) return null;

  const diferencaPP = (resumoAtual.margem - resumoAnterior.margem) * 100;
  if (diferencaPP > -LIMIAR_QUEDA_MARGEM_PP) return null;

  return {
    margemAtual: resumoAtual.margem,
    margemAnterior: resumoAnterior.margem,
    faturamentoAtual: resumoAtual.faturamento,
    faturamentoAnterior: resumoAnterior.faturamento,
    diferencaPP,
    periodoRotulo: periodoAtual.rotulo,
  };
}

export interface DiagnosticoAbc {
  /** Os poucos produtos que sozinhos respondem pela maior fatia do faturamento */
  topA: ItemCurvaABC[];
  /** Baixo faturamento (classe C) E vendendo com prejuízo — candidato a descontinuar */
  cEmPrejuizo: ItemCurvaABC[];
}

/**
 * Não recalcula a curva ABC — só lê o que `curvaABC()` já produz e separa
 * o que merece virar aviso: quem carrega o negócio, e quem nem vende
 * muito nem dá lucro.
 */
export function diagnosticarCurvaAbc(
  anuncios: Anuncio[],
  opcoes: OpcoesLimites = {},
): DiagnosticoAbc | null {
  const itens = curvaABC(anuncios.filter((a) => a.status === "ativo"));
  if (itens.length === 0) return null;

  const topA = itens.filter((i) => i.classe === "A").slice(0, 5);
  const cEmPrejuizo = itens.filter(
    (i) => i.classe === "C" && margemNoPreco(i.anuncio, i.anuncio.precoAtual, opcoes) < 0,
  );

  if (topA.length === 0 && cEmPrejuizo.length === 0) return null;
  return { topA, cEmPrejuizo };
}

export interface DiagnosticoDadoFaltando {
  anunciosSemCusto: number;
  contasSemMeta: number;
}

/**
 * O que impede o resto do sistema (inclusive os outros agentes) de
 * calcular direito. Sem isso, o preço mínimo e a margem mostrada são
 * chute, não conta.
 */
export function diagnosticarDadoFaltando(
  anuncios: Anuncio[],
  contasAtivas: ContaMarketplace[],
  metasPorConta: Record<string, MetasMargem | null>,
): DiagnosticoDadoFaltando | null {
  const anunciosSemCusto = anuncios.filter((a) => a.status === "ativo" && a.cmv === null).length;
  const contasSemMeta = contasAtivas.filter((c) => !metasPorConta[c.id]).length;
  if (anunciosSemCusto === 0 && contasSemMeta === 0) return null;
  return { anunciosSemCusto, contasSemMeta };
}

export interface AlertaSaudeConta {
  conta: ContaMarketplace;
  alerta: string;
}

/**
 * Não fala de lucro — fala da conta continuar existindo. `reputacao.alerta`
 * já vem calculado por conta; aqui só reúne quem está com algo acesso.
 */
export function diagnosticarSaudeContas(contas: ContaMarketplace[]): AlertaSaudeConta[] {
  return contas
    .filter((c) => c.reputacao?.alerta)
    .map((c) => ({ conta: c, alerta: c.reputacao!.alerta! }));
}

export interface ResumoDiario {
  faturamento: number;
  margem: number;
  pedidos: number;
  quedaDeMargem: boolean;
  anunciosSemCusto: number;
  contasEmAlerta: number;
  destaqueAbc: string | null;
}

/** Um resumo curto do dia, juntando o que as outras quatro frentes já
 * apuraram — pensado pra ler em 10 segundos, não pra substituir elas. */
export function montarResumoDiario(
  pedidosHoje: Pedido[],
  quedaMargem: DiagnosticoMargem | null,
  dadoFaltando: DiagnosticoDadoFaltando | null,
  saude: AlertaSaudeConta[],
  abc: DiagnosticoAbc | null,
): ResumoDiario {
  const resumo = resumir(pedidosHoje);
  return {
    faturamento: resumo.faturamento,
    margem: resumo.margem,
    pedidos: resumo.pedidos,
    quedaDeMargem: quedaMargem !== null,
    anunciosSemCusto: dadoFaltando?.anunciosSemCusto ?? 0,
    contasEmAlerta: saude.length,
    destaqueAbc: abc && abc.topA.length > 0 ? abc.topA[0]!.anuncio.produto : null,
  };
}

/* ------------------------------------------------------------------ */
/* Agente de Estoque                                                   */
/* ------------------------------------------------------------------ */

/** Dias restantes iguais ou abaixo disso viram alerta. */
export const DIAS_ALERTA_RUPTURA = 7;
/** Quantos dias de cobertura a reposição sugerida deve garantir. */
export const DIAS_ALVO_COBERTURA = 30;

export interface DiagnosticoEstoque {
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  estoqueAtual: number;
  vendidoUltimos7Dias: number;
  mediaDiaria: number;
  diasRestantes: number;
  quantidadeSugerida: number;
  diasAlvoCobertura: number;
}

/**
 * Projeta ruptura a partir de venda REAL dos últimos 7 dias (soma os
 * `Pedido` do SKU, ignorando cancelado) — não usa uma média fixa do
 * cadastro, que pode estar desatualizada. "Esgotado" (quantidade 0) não
 * entra aqui: é um estado diferente, já visível direto na tela de
 * Estoque; isto é sobre o que ainda dá tempo de evitar.
 */
export function diagnosticarRuptura(
  itens: ItemEstoqueDetalhado[],
  pedidos: Pedido[],
  referencia = new Date(),
  diasAlerta = DIAS_ALERTA_RUPTURA,
  diasAlvo = DIAS_ALVO_COBERTURA,
): DiagnosticoEstoque[] {
  const inicioJanela = somarDias(inicioDoDia(referencia), -6);
  const alertas: DiagnosticoEstoque[] = [];

  for (const item of itens) {
    if (item.quantidade <= 0) continue;

    const vendidoUltimos7Dias = pedidos
      .filter(
        (p) =>
          p.sku === item.sku &&
          p.status !== "cancelado" &&
          dentroDoPeriodo(p.data, { inicio: inicioJanela, fim: referencia, rotulo: "" }),
      )
      .reduce((soma, p) => soma + p.quantidade, 0);

    const mediaDiaria = vendidoUltimos7Dias / 7;
    // Não vendeu nada na janela — não dá pra projetar ruptura por giro
    // (pode ser produto parado, que já é o gatilho de um agente diferente).
    if (mediaDiaria <= 0) continue;

    const diasRestantes = Math.floor(item.quantidade / mediaDiaria);
    if (diasRestantes > diasAlerta) continue;

    const quantidadeSugerida = Math.max(1, Math.ceil(mediaDiaria * diasAlvo) - item.quantidade);

    alertas.push({
      sku: item.sku,
      produto: item.produto,
      marketplaceId: item.marketplaceId,
      estoqueAtual: item.quantidade,
      vendidoUltimos7Dias,
      mediaDiaria,
      diasRestantes,
      quantidadeSugerida,
      diasAlvoCobertura: diasAlvo,
    });
  }

  // O que vai acabar primeiro é o que mais precisa de atenção.
  return alertas.sort((a, b) => a.diasRestantes - b.diasRestantes);
}

/* ------------------------------------------------------------------ */
/* Agentes de Estoque e Fulfillment — reposição inteligente (Bloco 4)   */
/* ------------------------------------------------------------------ */

/** Folga, em dias, somada ao prazo de entrega: o alerta vem antes do
 * ponto exato, pra dar tempo de cotar, aprovar e pagar o pedido. */
export const DIAS_SEGURANCA_REPOSICAO = 5;
/** Quando vale repor "com cuidado", a compra cobre só estes dias depois
 * que a mercadoria chega (em vez dos 30 normais). */
export const DIAS_COBERTURA_CUIDADO = 15;
/** Margem mínima usada quando a conta ainda não tem meta configurada. */
export const MARGEM_MINIMA_PADRAO = 0.1;
/** Quantos dias de venda manter no Full: o suficiente pra não faltar,
 * sem mandar tanto que a armazenagem coma a margem. */
export const DIAS_ALVO_FULL = 30;
/** A partir desta cobertura, o estoque no Full é considerado parado
 * (mesma regra da taxa de estoque parado que o Auditor confere). */
export const DIAS_PARADO_FULL = 60;
/** Taxas do Full usadas pra estimar a economia de retirar estoque —
 * FICTÍCIAS, as mesmas que o Auditor usa. */
const TAXA_ARMAZENAGEM_NORMAL = 0.008;
const TAXA_RETIRADA_POR_UNIDADE = 2.5;

/** Dias pra mandar mercadoria pro centro de distribuição de cada canal:
 * preparar, agendar a coleta/entrega, transportar e o canal conferir.
 * FICTÍCIO até a API do canal informar o agendamento real. */
export const PRAZO_ENVIO_FULL_DIAS: Record<MarketplaceId, number> = {
  "mercado-livre": 7,
  shopee: 6,
  amazon: 10,
  magalu: 8,
  "tiktok-shop": 8,
  shein: 12,
};

/** O que o agente calcula pra cada SKU — o alerta sem os campos do banco. */
export type AlertaEstoqueCalculado = Omit<
  AlertaEstoque,
  "id" | "data" | "status" | "decididoEm" | "contaId"
>;

/** Curva ABC por SKU a partir do faturamento real dos últimos `dias`:
 * A = os que somam os primeiros 80% do faturamento, B = até 95%, C = o resto. */
export function classificarAbcPorSku(
  pedidos: Pedido[],
  referencia = new Date(),
  dias = 30,
): Map<string, "A" | "B" | "C"> {
  const corte = referencia.getTime() - dias * 86400000;
  const porSku = new Map<string, number>();
  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    const t = new Date(p.data).getTime();
    if (t < corte || t > referencia.getTime()) continue;
    porSku.set(p.sku, (porSku.get(p.sku) ?? 0) + p.faturamento);
  }
  const total = [...porSku.values()].reduce((a, b) => a + b, 0);
  const classes = new Map<string, "A" | "B" | "C">();
  if (total <= 0) return classes;
  let acumulado = 0;
  for (const [sku, fat] of [...porSku.entries()].sort((a, b) => b[1] - a[1])) {
    // A classe é decidida pelo acumulado ANTES deste SKU: o SKU que
    // "cruza" a linha dos 80% ainda é A.
    const antes = acumulado;
    acumulado += fat / total;
    classes.set(sku, antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C");
  }
  return classes;
}

/** Margem de um SKU nos últimos `dias` DEPOIS do Ads (lucro líquido
 * menos o que foi gasto em mídia, sobre o faturamento); null sem venda.
 * É a margem que diz se vale a pena comprar mais: produto que só vende
 * bancando Ads caro não paga a reposição. */
export function margemDoSku(
  pedidos: Pedido[],
  sku: string,
  referencia = new Date(),
  dias = 30,
): number | null {
  const corte = referencia.getTime() - dias * 86400000;
  const doSku = pedidos.filter((p) => {
    const t = new Date(p.data).getTime();
    return p.sku === sku && t >= corte && t <= referencia.getTime();
  });
  const r = resumir(doSku);
  return r.faturamento > 0 ? (r.lucroLiquido - r.custoMidia) / r.faturamento : null;
}

/** A menor margem mínima configurada nas contas do canal (a regra mais
 * permissiva que o seller aceita); padrão quando nenhuma tem meta. */
function margemMinimaDoCanal(contas: ContaMarketplace[], marketplaceId: MarketplaceId): number {
  const metas = contas
    .filter((c) => c.marketplaceId === marketplaceId && c.metas)
    .map((c) => c.metas!.margemMinima);
  return metas.length > 0 ? Math.min(...metas) : MARGEM_MINIMA_PADRAO;
}

const fmtPct = (n: number) => `${(n * 100).toFixed(1).replace(".", ",")}%`;

/**
 * Vale a pena repor? Cruza margem real e curva ABC:
 * - prejuízo → não repor: comprar mais aumenta o prejuízo, o preço vem antes;
 * - margem abaixo da mínima OU curva C → repor com cuidado (compra menor);
 * - o resto → repor.
 */
export function avaliarReposicao(
  margem: number | null,
  classe: "A" | "B" | "C" | null,
  margemMinima: number,
): { veredito: VereditoReposicao; motivo: string } {
  if (margem !== null && margem <= 0) {
    return {
      veredito: "nao-repor",
      motivo: `Vende no prejuízo: margem de ${fmtPct(margem)} nos últimos 30 dias, já descontado o Ads. Repor agora só aumenta o prejuízo: ajuste o preço (Agente de Precificação) ou o Ads (Agente de Ads) antes.`,
    };
  }
  const abaixoDaMinima = margem !== null && margem < margemMinima;
  if (abaixoDaMinima || classe === "C") {
    const razoes: string[] = [];
    if (abaixoDaMinima)
      razoes.push(`a margem (${fmtPct(margem!)}) está abaixo da sua mínima de ${fmtPct(margemMinima)}`);
    if (classe === "C") razoes.push("é curva C (vende pouco perto dos outros)");
    return {
      veredito: "repor-com-cuidado",
      motivo: `Vale repor, mas pouco: ${razoes.join(" e ")}. A sugestão cobre só ${DIAS_COBERTURA_CUIDADO} dias depois que a mercadoria chegar, pra não prender dinheiro.`,
    };
  }
  return {
    veredito: "repor",
    motivo: `Vale repor: margem de ${margem === null ? "—" : fmtPct(margem)} depois do Ads${classe ? ` e curva ${classe}` : ""}.`,
  };
}

/** Unidades vendidas por dia nos últimos 7 dias (venda real dos
 * pedidos). `origem` separa quem consome cada estoque: os pedidos do Full
 * saem do Full; os outros saem do estoque próprio. */
function ritmo7Dias(
  pedidos: Pedido[],
  sku: string,
  referencia: Date,
  origem: "full" | "proprio",
) {
  const inicio = somarDias(inicioDoDia(referencia), -6);
  const vendido = pedidos
    .filter(
      (p) =>
        p.sku === sku &&
        p.status !== "cancelado" &&
        (origem === "full") === (p.tipoLogistica === "full") &&
        dentroDoPeriodo(p.data, { inicio, fim: referencia, rotulo: "" }),
    )
    .reduce((s, p) => s + p.quantidade, 0);
  return { vendido, media: vendido / 7 };
}

/**
 * Agente de Estoque: avisa a tempo de o fornecedor entregar, diz se vale
 * a pena repor e quanto dinheiro isso exige.
 *
 * O alerta sai quando os dias de estoque que restam ficam iguais ou
 * menores que o prazo do fornecedor + a folga de segurança — ou seja,
 * no último momento em que ainda dá pra pedir sem faltar.
 */
export function analisarReposicaoEstoque(
  itens: ItemEstoqueDetalhado[],
  pedidos: Pedido[],
  contas: ContaMarketplace[],
  referencia = new Date(),
): AlertaEstoqueCalculado[] {
  const abc = classificarAbcPorSku(pedidos, referencia);
  const alertas: AlertaEstoqueCalculado[] = [];

  for (const item of itens) {
    if (item.quantidade <= 0) continue;
    const { vendido, media } = ritmo7Dias(pedidos, item.sku, referencia, "proprio");
    if (media <= 0) continue;

    const diasRestantes = Math.floor(item.quantidade / media);
    const prazo = item.prazoFornecedorDias;
    if (diasRestantes > prazo + DIAS_SEGURANCA_REPOSICAO) continue;

    const margem = margemDoSku(pedidos, item.sku, referencia);
    const classe = abc.get(item.sku) ?? null;
    const { veredito, motivo } = avaliarReposicao(
      margem,
      classe,
      margemMinimaDoCanal(contas, item.marketplaceId),
    );

    // Compra que cobre o prazo de entrega + os dias de cobertura depois
    // que a mercadoria chega. "Com cuidado" cobre menos dias.
    const diasCobertura =
      veredito === "repor-com-cuidado" ? DIAS_COBERTURA_CUIDADO : DIAS_ALVO_COBERTURA;
    const quantidadeSugerida =
      veredito === "nao-repor"
        ? 0
        : Math.max(1, Math.ceil(media * (prazo + diasCobertura)) - item.quantidade);

    alertas.push({
      tipoAlerta: "ruptura",
      sku: item.sku,
      produto: item.produto,
      marketplaceId: item.marketplaceId,
      estoqueAtual: item.quantidade,
      vendidoUltimos7Dias: vendido,
      mediaDiaria: media,
      diasRestantes,
      quantidadeSugerida,
      diasAlvoCobertura: diasCobertura,
      prazoFornecedorDias: prazo,
      diasParaPedir: diasRestantes - prazo,
      diasSemEstoque: Math.max(0, prazo - diasRestantes),
      custoUnitario: item.custoUnitario,
      custoReposicao: Math.round(quantidadeSugerida * item.custoUnitario * 100) / 100,
      veredito,
      motivoVeredito: motivo,
      classeAbc: classe,
      margem30d: margem,
    });
  }
  // Quem já passou do ponto de pedir vem primeiro.
  return alertas.sort((a, b) => (a.diasParaPedir ?? 0) - (b.diasParaPedir ?? 0));
}

/**
 * Agente de Fulfillment, em duas frentes:
 *
 * 1. "ruptura" — vai faltar no Full. O prazo que conta é o de ENVIO pro
 *    centro de distribuição (e, se o estoque próprio não der, também o do
 *    fornecedor). Diz quanto mandar agora e quanto falta comprar.
 * 2. "parado" — está sobrando no Full: cobertura acima de 60 dias paga a
 *    taxa de estoque parado. Diz quanto retirar e quanto isso economiza.
 */
export function analisarFulfillment(
  itensFull: ItemEstoqueDetalhado[],
  estoqueProprio: ItemEstoqueDetalhado[],
  pedidos: Pedido[],
  contas: ContaMarketplace[],
  referencia = new Date(),
): AlertaEstoqueCalculado[] {
  const abc = classificarAbcPorSku(pedidos, referencia);
  const proprioPorSku = new Map(estoqueProprio.map((i) => [i.sku, i]));
  const alertas: AlertaEstoqueCalculado[] = [];

  for (const item of itensFull) {
    if (item.quantidade <= 0) continue;
    const prazoEnvio = PRAZO_ENVIO_FULL_DIAS[item.marketplaceId];
    const { vendido, media } = ritmo7Dias(pedidos, item.sku, referencia, "full");
    const diasRestantes = media > 0 ? Math.floor(item.quantidade / media) : Infinity;
    const margem = margemDoSku(pedidos, item.sku, referencia);
    const classe = abc.get(item.sku) ?? null;
    // Do estoque próprio, só dá pra mandar o que SOBRA depois de reservar
    // o que ele mesmo vai vender até uma compra nova chegar do fornecedor.
    const itemProprio = proprioPorSku.get(item.sku);
    const ritmoProprio = ritmo7Dias(pedidos, item.sku, referencia, "proprio").media;
    const reserva = itemProprio ? Math.ceil(ritmoProprio * itemProprio.prazoFornecedorDias) : 0;
    const proprio = Math.max(0, (itemProprio?.quantidade ?? 0) - reserva);

    // --- 1. Vai faltar no Full ---
    const soComCompra = proprio <= 0;
    const prazoEfetivo = soComCompra ? item.prazoFornecedorDias + prazoEnvio : prazoEnvio;

    if (media > 0 && diasRestantes <= prazoEfetivo + DIAS_SEGURANCA_REPOSICAO) {
      const { veredito, motivo } = avaliarReposicao(
        margem,
        classe,
        margemMinimaDoCanal(contas, item.marketplaceId),
      );
      const alvo = veredito === "repor-com-cuidado" ? DIAS_COBERTURA_CUIDADO : DIAS_ALVO_FULL;
      const necessario =
        veredito === "nao-repor"
          ? 0
          : Math.max(1, Math.ceil(media * (prazoEnvio + alvo)) - item.quantidade);
      const enviar = Math.min(necessario, proprio);
      const comprar = necessario - enviar;

      alertas.push({
        tipoAlerta: "ruptura",
        sku: item.sku,
        produto: item.produto,
        marketplaceId: item.marketplaceId,
        estoqueAtual: item.quantidade,
        vendidoUltimos7Dias: vendido,
        mediaDiaria: media,
        diasRestantes,
        quantidadeSugerida: necessario,
        diasAlvoCobertura: alvo,
        prazoFornecedorDias: item.prazoFornecedorDias,
        prazoEnvioFullDias: prazoEnvio,
        diasParaPedir: diasRestantes - prazoEfetivo,
        diasSemEstoque: Math.max(0, prazoEfetivo - diasRestantes),
        estoqueProprio: proprio,
        quantidadeEnviar: enviar,
        quantidadeComprar: comprar,
        custoUnitario: item.custoUnitario,
        // Dinheiro que sai do caixa: só a parte que precisa comprar.
        custoReposicao: Math.round(comprar * item.custoUnitario * 100) / 100,
        custoArmazenagemMensal: item.custoArmazenagemMensal,
        veredito,
        motivoVeredito: motivo,
        classeAbc: classe,
        margem30d: margem,
      });
      continue;
    }

    // --- 2. Parado no Full ---
    if (item.coberturaDias > DIAS_PARADO_FULL) {
      const ritmoTela = item.vendasDia;
      const manter = Math.ceil(ritmoTela * DIAS_ALVO_FULL);
      const retirar = Math.max(0, item.quantidade - manter);
      if (retirar <= 0) continue;
      const custoNovo = manter * item.custoUnitario * TAXA_ARMAZENAGEM_NORMAL;
      const economia = Math.max(0, item.custoArmazenagemMensal - custoNovo);
      const custoRetirada = retirar * TAXA_RETIRADA_POR_UNIDADE;

      alertas.push({
        tipoAlerta: "parado",
        sku: item.sku,
        produto: item.produto,
        marketplaceId: item.marketplaceId,
        estoqueAtual: item.quantidade,
        vendidoUltimos7Dias: vendido,
        mediaDiaria: ritmoTela,
        diasRestantes: item.coberturaDias,
        quantidadeSugerida: 0,
        diasAlvoCobertura: DIAS_ALVO_FULL,
        prazoEnvioFullDias: prazoEnvio,
        custoUnitario: item.custoUnitario,
        custoArmazenagemMensal: item.custoArmazenagemMensal,
        quantidadeRetirar: retirar,
        custoRetirada: Math.round(custoRetirada * 100) / 100,
        economiaMensal: Math.round(economia * 100) / 100,
        classeAbc: classe,
        margem30d: margem,
      });
    }
  }

  return alertas.sort((a, b) => {
    // Primeiro o que vai faltar (mais urgente antes), depois os parados
    // (o que mais custa antes).
    if (a.tipoAlerta !== b.tipoAlerta) return a.tipoAlerta === "ruptura" ? -1 : 1;
    if (a.tipoAlerta === "ruptura") return (a.diasParaPedir ?? 0) - (b.diasParaPedir ?? 0);
    return (b.custoArmazenagemMensal ?? 0) - (a.custoArmazenagemMensal ?? 0);
  });
}

/** Chave estável de um alerta: o mesmo SKU pode ter um alerta de
 * ruptura e, em outro momento, um de parado. */
export function chaveAlertaEstoque(a: { sku: string; tipoAlerta?: string }): string {
  return `${a.tipoAlerta ?? "ruptura"}:${a.sku}`;
}

/** Totais do topo do painel: quanto dinheiro a reposição exige. */
export interface ResumoReposicao {
  /** Soma das compras recomendadas (repor + repor com cuidado) */
  dinheiroNecessario: number;
  itensRepor: number;
  itensCuidado: number;
  itensNaoRepor: number;
  /** Fulfillment: unidades pra mandar do estoque próprio pro Full */
  unidadesEnviar: number;
  /** Fulfillment: armazenagem por mês dos SKUs parados */
  custoParadoMensal: number;
  /** Fulfillment: economia por mês retirando o excesso */
  economiaMensal: number;
}

export function resumirReposicao(alertas: AlertaEstoque[]): ResumoReposicao {
  const r: ResumoReposicao = {
    dinheiroNecessario: 0,
    itensRepor: 0,
    itensCuidado: 0,
    itensNaoRepor: 0,
    unidadesEnviar: 0,
    custoParadoMensal: 0,
    economiaMensal: 0,
  };
  for (const a of alertas) {
    if (a.status !== "pendente") continue;
    if (a.tipoAlerta === "parado") {
      r.custoParadoMensal += a.custoArmazenagemMensal ?? 0;
      r.economiaMensal += a.economiaMensal ?? 0;
      continue;
    }
    if (a.veredito === "nao-repor") r.itensNaoRepor++;
    else {
      if (a.veredito === "repor-com-cuidado") r.itensCuidado++;
      else r.itensRepor++;
      r.dinheiroNecessario += a.custoReposicao ?? 0;
      r.unidadesEnviar += a.quantidadeEnviar ?? 0;
    }
  }
  const c = (n: number) => Math.round(n * 100) / 100;
  r.dinheiroNecessario = c(r.dinheiroNecessario);
  r.custoParadoMensal = c(r.custoParadoMensal);
  r.economiaMensal = c(r.economiaMensal);
  return r;
}

/**
 * Junta o que está no banco (status que o seller escolheu) com o cálculo
 * de agora: enquanto o alerta está pendente, os números vêm sempre do
 * cálculo mais recente. Alerta já decidido fica como foi gravado.
 */
export function mesclarAlertasEstoque(
  gravados: AlertaEstoque[],
  calculados: AlertaEstoqueCalculado[],
): AlertaEstoque[] {
  const porChave = new Map(calculados.map((c) => [chaveAlertaEstoque(c), c]));
  return gravados.map((g) => {
    if (g.status !== "pendente") return g;
    const atual = porChave.get(chaveAlertaEstoque(g));
    return atual
      ? { ...g, ...atual, id: g.id, data: g.data, status: g.status, decididoEm: g.decididoEm, contaId: g.contaId }
      : g;
  });
}

/* ------------------------------------------------------------------ */
/* Agente de Ads                                                       */
/* ------------------------------------------------------------------ */
// As duas janelas do agente. As duas reaproveitam o pedido real (o mesmo
// `custoMidia` que a tela de Ads do Dashboard já usa) — nenhuma inventa
// uma segunda fonte de investimento/venda separada da que já existe.

export interface ItemSugestaoAds {
  sku: string;
  produto: string;
  quantidade: number;
  unidadesPorDia: number;
  faturamento: number;
  lucroLiquido: number;
  margem: number;
}

/**
 * Produtos que vendem bem sozinhos e não têm nenhum gasto de Ads no
 * período — candidatos a começar a investir. `limiarVendas` é o corte
 * mínimo de unidades pra entrar na lista.
 */
export function sugerirAnunciosParaAds(
  pedidos: Pedido[],
  periodo: Periodo,
  limiarVendas = 5,
): ItemSugestaoAds[] {
  const doPeriodo = filtrarPorPeriodo(pedidos, periodo).filter((p) => p.status !== "cancelado");
  const dias = Math.max(1, listarDias(periodo).length);

  const mapa = new Map<
    string,
    { produto: string; quantidade: number; faturamento: number; lucro: number; custoMidia: number }
  >();
  for (const p of doPeriodo) {
    const atual = mapa.get(p.sku) ?? {
      produto: p.produto,
      quantidade: 0,
      faturamento: 0,
      lucro: 0,
      custoMidia: 0,
    };
    atual.quantidade += p.quantidade;
    atual.faturamento += p.faturamento;
    atual.lucro += p.lucroLiquido;
    atual.custoMidia += p.custoMidia;
    mapa.set(p.sku, atual);
  }

  const sugestoes: ItemSugestaoAds[] = [];
  for (const [sku, item] of mapa) {
    if (item.custoMidia > 0) continue; // já investe — isso é pauta da Análise, não da Sugestão
    if (item.quantidade < limiarVendas) continue;
    sugestoes.push({
      sku,
      produto: item.produto,
      quantidade: item.quantidade,
      unidadesPorDia: item.quantidade / dias,
      faturamento: item.faturamento,
      lucroLiquido: item.lucro,
      margem: item.faturamento > 0 ? item.lucro / item.faturamento : 0,
    });
  }

  // Quem mais vende primeiro — é o candidato mais forte.
  return sugestoes.sort((a, b) => b.quantidade - a.quantidade);
}

export interface ItemAnaliseAds extends ItemAdsPorSku {
  unidadesPorDia: number;
  /** Margem se o Ads não existisse — pra comparar lado a lado */
  margemSemAds: number;
  /** Margem de verdade, com o Ads já descontado */
  margemComAds: number;
}

/**
 * Os produtos que já estão em Ads, com o veredito pronto. Não recalcula
 * nada — só pega `agruparPorSkuComAds` (a mesma conta que o Dashboard já
 * mostra) e acrescenta o que falta pro card: vendas por dia e as duas
 * margens lado a lado, pra não obrigar quem lê a fazer conta de cabeça.
 */
export function analisarAnunciosEmAds(pedidos: Pedido[], periodo: Periodo): ItemAnaliseAds[] {
  const doPeriodo = filtrarPorPeriodo(pedidos, periodo);
  const dias = Math.max(1, listarDias(periodo).length);

  return agruparPorSkuComAds(doPeriodo)
    .map((item) => ({
      ...item,
      unidadesPorDia: item.quantidade / dias,
      margemSemAds: item.faturamento > 0 ? item.lucroAntesAds / item.faturamento : 0,
      margemComAds: item.faturamento > 0 ? item.lucroPosAds / item.faturamento : 0,
    }))
    .sort((a, b) => a.lucroPosAds - b.lucroPosAds);
}


/* ------------------------------------------------------------------ */
/* Agente de Ads — ROAS mínimo e as regras de decisão                  */
/* ------------------------------------------------------------------ */

/** Quantos dias um anúncio precisa estar rodando em Ads antes de o agente
 * julgar alguma coisa — duas semanas completas, pra pegar dois fins de
 * semana e não julgar pela sorte (ou azar) de um só. */
export const DIAS_TESTE_ADS = 14;

/** Quantos dias SEGUIDOS abaixo do ROAS mínimo até o agente sugerir tirar
 * verba de um anúncio da curva C. */
export const DIAS_ABAIXO_MINIMO_ADS = 7;

/** Folga acima do ROAS mínimo pra um anúncio ser considerado saudável e
 * poder receber mais verba (0,3 = 30% acima do mínimo). */
export const FOLGA_ROAS_ADS = 0.3;

/** Anúncio "cansado": pelo menos isso de cliques na janela de teste... */
export const CLIQUES_MINIMOS_CANSADO = 100;
/** ...e conversão (vendas ÷ cliques) abaixo disso. */
export const CONVERSAO_MAXIMA_CANSADO = 0.01;

/** Gasto mínimo em Ads na janela de teste pra valer a pena sugerir mexer
 * num anúncio — mexer em quem gasta R$ 3 só gera barulho. */
export const GASTO_MINIMO_REALOCACAO = 50;

/**
 * A conta aberta que dá origem ao ROAS mínimo: o que sobra de cada venda
 * ANTES de pagar o Ads. É exatamente esse valor que o Ads pode consumir
 * sem dar prejuízo — por isso o custo de mídia fica de fora aqui.
 */
export interface ContribuicaoAnuncio {
  preco: number;
  cmv: number;
  impostos: number;
  comissao: number;
  taxaFixa: number;
  frete: number;
  afiliados: number;
  custosOperacionais: number;
  /** R$ que sobram por venda antes do Ads */
  contribuicao: number;
  /** contribuicao ÷ preco (0-1) */
  margemContribuicao: number;
  /** 1 ÷ margemContribuicao. null quando o anúncio já dá prejuízo mesmo
   * sem Ads — aí nenhum ROAS salva, o problema é preço ou custo. */
  roasMinimo: number | null;
}

/** Calcula a margem de contribuição e o ROAS mínimo de um anúncio, num
 * preço qualquer (o atual, ou outro — é o que o simulador usa). */
export function contribuicaoAnuncio(
  a: Anuncio,
  preco = a.precoAtual,
  opcoes: OpcoesLimites = {},
): ContribuicaoAnuncio {
  const aliquota = opcoes.aliquotaImposto ?? a.impostoPercentual;
  const cmv = a.cmv ?? 0;
  const impostos = preco * aliquota;
  const comissao = preco * a.comissaoPercentual;
  const custosOperacionais = (opcoes.custosOperacionais ?? (() => 0))(preco);
  const contribuicao =
    preco -
    cmv -
    impostos -
    comissao -
    a.taxaFixa -
    a.freteUnitario -
    a.custoAfiliadoUnitario -
    custosOperacionais;
  const margemContribuicao = preco > 0 ? contribuicao / preco : 0;
  return {
    preco,
    cmv,
    impostos,
    comissao,
    taxaFixa: a.taxaFixa,
    frete: a.freteUnitario,
    afiliados: a.custoAfiliadoUnitario,
    custosOperacionais,
    contribuicao,
    margemContribuicao,
    roasMinimo: margemContribuicao > 0 ? 1 / margemContribuicao : null,
  };
}

/** Um ponto do gráfico de trajetória: o ROAS dos 7 dias que terminam
 * naquele dia (média móvel), pra um dia ruim isolado não parecer queda. */
export interface PontoRoas {
  data: string; // yyyy-mm-dd
  roas: number | null;
}

/** Tudo que o agente sabe de UM anúncio em Ads, já calculado. */
export interface AnaliseRoasAnuncio {
  anuncio: Anuncio;
  contribuicao: ContribuicaoAnuncio;
  /** false quando o anúncio não tem CMV cadastrado — sem custo não existe
   * ROAS mínimo confiável, e o agente não sugere nada pra ele. */
  calculavel: boolean;
  classe: "A" | "B" | "C" | null;
  /** Dias com histórico de Ads (máx. 30 no protótipo) */
  diasRodando: number;
  /** Números da janela de teste (últimos 14 dias) */
  investimento: number;
  faturamento: number;
  cliques: number;
  vendas: number;
  /** vendas ÷ cliques (0-1); null sem cliques */
  conversao: number | null;
  /** faturamento ÷ investimento; null sem investimento */
  roasAtual: number | null;
  /** Lucro que o Ads deixou na janela: o que as vendas via Ads
   * contribuíram menos o que foi gasto nele */
  lucroAds: number;
  /** Dias seguidos (contando de hoje pra trás) em que o ROAS dos 7 dias
   * anteriores ficou abaixo do mínimo */
  diasSeguidosAbaixo: number;
  /** Vendas via Ads nos últimos 7 dias e nos 7 anteriores — é o que diz se
   * as vendas estão crescendo ou paradas */
  vendasSemanaAtual: number;
  vendasSemanaAnterior: number;
  semaforo: SemaforoDecisao;
  /** Cobertura de estoque do SKU, em dias; null quando não há dado */
  coberturaEstoqueDias: number | null;
  trajetoria: PontoRoas[];
}

function roasDe(faturamento: number, investimento: number): number | null {
  return investimento > 0 ? faturamento / investimento : null;
}

/**
 * Monta a análise de todos os anúncios ativos com Ads. Pura: recebe os
 * anúncios, o histórico diário e o estoque, devolve os números — as
 * decisões (ajuste de objetivo, realocação, anúncio cansado) vêm das
 * funções abaixo, em cima deste resultado.
 */
export function analisarRoasAnuncios(
  anuncios: Anuncio[],
  historico: HistoricoAdsDia[],
  estoque: ItemEstoqueDetalhado[],
  opcoes: OpcoesLimites = {},
): AnaliseRoasAnuncio[] {
  const classes = new Map(curvaABC(anuncios).map((i) => [i.anuncio.id, i.classe]));
  const porAnuncio = new Map<string, HistoricoAdsDia[]>();
  for (const h of historico) {
    const lista = porAnuncio.get(h.anuncioId) ?? [];
    lista.push(h);
    porAnuncio.set(h.anuncioId, lista);
  }
  const cobertura = new Map(estoque.map((e) => [e.sku, e.coberturaDias]));

  const resultado: AnaliseRoasAnuncio[] = [];
  for (const a of anuncios) {
    if (a.status !== "ativo" || !a.ads) continue;
    const dias = (porAnuncio.get(a.id) ?? []).sort((x, y) => x.data.localeCompare(y.data));
    if (dias.length === 0) continue;

    const contribuicao = contribuicaoAnuncio(a, a.precoAtual, opcoes);
    const calculavel = a.cmv !== null;

    const janela = dias.slice(-DIAS_TESTE_ADS);
    const investimento = janela.reduce((s, d) => s + d.investimento, 0);
    const faturamento = janela.reduce((s, d) => s + d.faturamentoAtribuido, 0);
    const cliques = janela.reduce((s, d) => s + d.cliques, 0);
    const vendas = janela.reduce((s, d) => s + d.vendasAtribuidas, 0);
    const roasAtual = roasDe(faturamento, investimento);

    // Trajetória: ROAS móvel de 7 dias, a partir do 7º dia de histórico.
    const trajetoria: PontoRoas[] = [];
    for (let i = 6; i < dias.length; i++) {
      const bloco = dias.slice(i - 6, i + 1);
      trajetoria.push({
        data: dias[i]!.data,
        roas: roasDe(
          bloco.reduce((s, d) => s + d.faturamentoAtribuido, 0),
          bloco.reduce((s, d) => s + d.investimento, 0),
        ),
      });
    }

    let diasSeguidosAbaixo = 0;
    const minimo = contribuicao.roasMinimo;
    if (minimo !== null) {
      for (let i = trajetoria.length - 1; i >= 0; i--) {
        const r = trajetoria[i]!.roas;
        if (r !== null && r < minimo) diasSeguidosAbaixo++;
        else break;
      }
    }

    const vendasSemanaAtual = dias.slice(-7).reduce((s, d) => s + d.vendasAtribuidas, 0);
    const vendasSemanaAnterior = dias.slice(-14, -7).reduce((s, d) => s + d.vendasAtribuidas, 0);

    const semaforo: SemaforoDecisao =
      minimo === null || roasAtual === null || roasAtual < minimo
        ? "vermelho"
        : roasAtual < minimo * (1 + FOLGA_ROAS_ADS)
          ? "amarelo"
          : "verde";

    resultado.push({
      anuncio: a,
      contribuicao,
      calculavel,
      classe: classes.get(a.id) ?? null,
      diasRodando: dias.length,
      investimento,
      faturamento,
      cliques,
      vendas,
      conversao: cliques > 0 ? vendas / cliques : null,
      roasAtual,
      lucroAds: faturamento * contribuicao.margemContribuicao - investimento,
      diasSeguidosAbaixo,
      vendasSemanaAtual,
      vendasSemanaAnterior,
      semaforo,
      coberturaEstoqueDias: cobertura.get(a.sku) ?? null,
      trajetoria,
    });
  }
  return resultado;
}

/** Arredonda pra 1 casa decimal pra CIMA — ROAS objetivo sugerido nunca
 * pode ficar abaixo do limite só por causa de arredondamento. */
function arredondarParaCima1(n: number) {
  return Math.ceil(n * 10) / 10;
}

export interface SugestaoRealocacaoAds {
  fonte: AnaliseRoasAnuncio;
  destino: AnaliseRoasAnuncio;
}

/**
 * Tira verba de quem está no prejuízo (curva C) e aponta quem pode receber
 * (curva A). Só junta anúncios da MESMA conta: a verba de Ads é de cada
 * conta, não dá pra mover de um marketplace pro outro.
 *
 * Fonte: curva C, testado há 14+ dias, 7+ dias seguidos abaixo do mínimo,
 * gasto relevante. Destino: curva A, testado há 14+ dias, ROAS 30%+ acima
 * do mínimo e estoque pra pelo menos 30 dias (o mesmo alvo de cobertura
 * do Agente de Estoque — não adianta empurrar verba pra quem vai acabar).
 */
export function sugerirRealocacaoAds(analises: AnaliseRoasAnuncio[]): SugestaoRealocacaoAds[] {
  const validos = analises.filter(
    (x) => x.calculavel && x.contribuicao.roasMinimo !== null && x.diasRodando >= DIAS_TESTE_ADS,
  );
  const fontes = validos
    .filter(
      (x) =>
        x.classe === "C" &&
        x.diasSeguidosAbaixo >= DIAS_ABAIXO_MINIMO_ADS &&
        x.investimento >= GASTO_MINIMO_REALOCACAO,
    )
    .sort((x, y) => y.investimento - x.investimento);
  const destinos = validos.filter(
    (x) =>
      x.classe === "A" &&
      x.roasAtual !== null &&
      x.roasAtual >= x.contribuicao.roasMinimo! * (1 + FOLGA_ROAS_ADS) &&
      (x.coberturaEstoqueDias ?? 0) >= DIAS_ALVO_COBERTURA,
  );

  const pares: SugestaoRealocacaoAds[] = [];
  for (const fonte of fontes) {
    const candidatos = destinos
      .filter((d) => d.anuncio.contaId === fonte.anuncio.contaId)
      .sort(
        (x, y) =>
          y.roasAtual! / y.contribuicao.roasMinimo! - x.roasAtual! / x.contribuicao.roasMinimo!,
      );
    const destino = candidatos[0];
    if (destino) pares.push({ fonte, destino });
  }
  return pares;
}

export interface SugestaoAjusteObjetivo {
  analise: AnaliseRoasAnuncio;
  direcao: "subir" | "baixar";
  objetivoSugerido: number;
}

/** ROAS mínimo acima disso = margem de contribuição abaixo de 4%. Aí o
 * problema é preço/custo, não Ads — o agente não sugere mexer no objetivo
 * (quem trata isso é o Agente de Precificação). */
export const ROAS_MINIMO_TETO_AJUSTE = 25;

/**
 * Ajuste do ROAS objetivo configurado no Ads do marketplace:
 * - ROAS encostando no mínimo (menos de 10% de folga) e objetivo baixo
 *   demais → SUBIR o objetivo, pra plataforma gastar com mais cuidado.
 * - ROAS com folga grande (o dobro do mínimo ou mais) E vendas paradas
 *   (esta semana não vendeu mais que a anterior) → dá pra BAIXAR o
 *   objetivo e ganhar volume, mas NUNCA pra menos de 30% acima do mínimo.
 * Quem já está numa sugestão de realocação fica de fora — a realocação
 * já diz o que fazer com ele.
 */
export function sugerirAjusteObjetivo(
  analises: AnaliseRoasAnuncio[],
  jaEmRealocacao: Set<string>,
): SugestaoAjusteObjetivo[] {
  const sugestoes: SugestaoAjusteObjetivo[] = [];
  for (const x of analises) {
    const minimo = x.contribuicao.roasMinimo;
    const objetivo = x.anuncio.roasObjetivo;
    if (!x.calculavel || minimo === null || objetivo === null || x.roasAtual === null) continue;
    if (x.diasRodando < DIAS_TESTE_ADS || jaEmRealocacao.has(x.anuncio.id)) continue;
    if (minimo > ROAS_MINIMO_TETO_AJUSTE) continue;

    const piso = arredondarParaCima1(minimo * (1 + FOLGA_ROAS_ADS));
    if (x.roasAtual < minimo * 1.1 && objetivo < minimo * 1.2) {
      sugestoes.push({
        analise: x,
        direcao: "subir",
        objetivoSugerido: arredondarParaCima1(minimo * 1.2),
      });
    } else if (
      x.roasAtual >= minimo * 2 &&
      x.vendasSemanaAtual <= x.vendasSemanaAnterior &&
      objetivo >= piso + 0.5
    ) {
      sugestoes.push({
        analise: x,
        direcao: "baixar",
        objetivoSugerido: Math.max(piso, Math.round(objetivo * 0.8 * 10) / 10),
      });
    }
  }
  return sugestoes;
}

/** Muito clique, pouca compra: o anúncio atrai mas não convence. */
export function diagnosticarAnunciosCansados(analises: AnaliseRoasAnuncio[]): AnaliseRoasAnuncio[] {
  return analises.filter(
    (x) =>
      x.diasRodando >= DIAS_TESTE_ADS &&
      x.cliques >= CLIQUES_MINIMOS_CANSADO &&
      x.conversao !== null &&
      x.conversao < CONVERSAO_MAXIMA_CANSADO,
  );
}

/* ------------------------------------------------------------------ */
/* Agente Auditor — conferência de taxas e cobranças                   */
/* ------------------------------------------------------------------ */

/** Diferença em reais a partir da qual vale apontar uma cobrança. Abaixo
 * disso é arredondamento do canal, não erro. */
export const TOLERANCIA_AUDITOR = 0.05;

/** Quantos dias pra trás o Auditor confere os pedidos. Mais que isso, o
 * prazo de reclamação da maioria dos canais já passou. */
export const DIAS_AUDITORIA = 30;

/** Rótulo em português de cada item conferido. */
export const ROTULO_ITEM_AUDITOR: Record<ItemCobrancaAuditor, string> = {
  comissao: "Comissão",
  taxaFixa: "Taxa fixa",
  frete: "Frete",
  parcelamento: "Parcelamento sem juros",
  taxaTransacao: "Taxa de transação",
  taxaServico: "Taxa de programa",
  afiliado: "Comissão de afiliado",
  cupom: "Cupom de desconto",
  freteDevolucao: "Frete de devolução",
  tarifaFulfillment: "Tarifa do Full por unidade",
  garantia: "Garantia estendida",
  armazenagem: "Armazenagem no Full",
  armazenagemProlongada: "Armazenagem prolongada",
  retirada: "Retirada de estoque",
  multaFull: "Multa de não conformidade",
};

const ROTULO_TAMANHO = { pequeno: "pequeno", medio: "médio", grande: "grande" } as const;

const r2 = (n: number) => Math.round(n * 100) / 100;
const brl = (n: number) =>
  `R$ ${n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d),)/g, ".")}`;
const pct = (n: number) => {
  const v = Math.round(n * 1000) / 10;
  return `${Number.isInteger(v) ? v.toFixed(0) : v.toFixed(1).replace(".", ",")}%`;
};

/** Monta um item conferido e, se ele veio diferente, escreve o que chama
 * atenção no valor cobrado. */
function itemConferido(
  item: ItemCobrancaAuditor,
  esperado: number,
  cobrado: number,
  regra: string,
  observar?: (cobrado: number) => string | undefined,
): ItemDivergenteAuditor {
  const e = r2(esperado);
  const c = r2(cobrado);
  const divergente = Math.abs(c - e) >= TOLERANCIA_AUDITOR;
  const indevido = divergente && e === 0 && c > 0;
  let observacao: string | undefined;
  if (divergente) {
    observacao =
      observar?.(c) ??
      (indevido
        ? "Não era pra ter essa cobrança."
        : c > e
          ? `Cobrado ${brl(c - e)} a mais do que a regra manda.`
          : `Cobrado ${brl(e - c)} a menos do que a regra manda.`);
  }
  return { item, esperado: e, cobrado: c, regra, observacao, indevido };
}

/** true quando o item veio fora da regra. */
export function itemDivergente(i: ItemDivergenteAuditor): boolean {
  return Math.abs(i.cobrado - i.esperado) >= TOLERANCIA_AUDITOR;
}

/**
 * Confere UM pedido contra as regras e devolve TODOS os itens conferidos,
 * cada um com a conta que explica o esperado. Os que vieram certos também
 * voltam — a tela mostra com ✓ — e `itemDivergente` separa os errados.
 *
 * Sempre conferidos: comissão, taxa fixa e frete. Os outros só entram
 * quando fazem sentido naquele canal/pedido (ex.: afiliado só em canal
 * que tem afiliado) ou quando o canal cobrou alguma coisa neles.
 */
export function conferirTodasCobrancasPedido(
  pedido: Pedido,
  conta: ContaMarketplace,
): ItemDivergenteAuditor[] {
  const regras = REGRAS_COBRANCA[pedido.marketplaceId];
  const ex = pedido.extrato;
  const fat = pedido.faturamento;
  const cobrado = (item: ItemCobrancaAuditor, padrao = 0) => ex?.cobrado[item] ?? padrao;
  const foiCobrado = (item: ItemCobrancaAuditor) => (ex?.cobrado[item] ?? 0) > 0;
  const itens: ItemDivergenteAuditor[] = [];

  // Comissão — percentual da conta sobre o valor da venda.
  const comissaoEsperada = fat * conta.comissaoPercentual;
  itens.push(
    itemConferido(
      "comissao",
      comissaoEsperada,
      pedido.comissao,
      `${pct(conta.comissaoPercentual)} sobre a venda de ${brl(fat)}`,
      (c) => (fat > 0 ? `O valor cobrado equivale a ${pct(c / fat)} da venda.` : undefined),
    ),
  );

  // Taxa fixa — valor fixo por pedido configurado na conta.
  itens.push(
    itemConferido(
      "taxaFixa",
      conta.taxaFixa,
      pedido.taxaFixa,
      `Taxa fixa por pedido desta conta: ${brl(conta.taxaFixa)}`,
    ),
  );

  // Frete — depende de QUEM paga o frete deste pedido.
  const responsavel =
    ex?.responsavelFrete ?? (pedido.tipoLogistica === "full" ? "canal-full" : "seller");
  const regraFrete =
    responsavel === "canal-full"
      ? "Pedido saiu pelo Full: o frete é por conta do canal, não seu"
      : responsavel === "comprador"
        ? regras.freteSellerAPartirDe === null
          ? "Neste canal o frete não é cobrado do vendedor por pedido"
          : `Pedido de ${brl(fat)}, abaixo de ${brl(regras.freteSellerAPartirDe)}: quem paga o frete é o comprador`
        : regras.freteSellerAPartirDe === null
          ? `Frete grátis por sua conta, pela tabela do canal: ${brl(pedido.freteEsperado)}`
          : `Pedido de ${brl(fat)}, a partir de ${brl(regras.freteSellerAPartirDe)}: frete grátis por sua conta, pela tabela do canal (${brl(pedido.freteEsperado)})`;
  itens.push(
    itemConferido(
      "frete",
      responsavel === "seller" ? pedido.freteEsperado : 0,
      pedido.freteCobrado,
      regraFrete,
      (c) =>
        responsavel !== "seller" && c > 0
          ? "Não era pra ter cobrança de frete neste pedido: o frete não é seu."
          : undefined,
    ),
  );

  // Parcelamento sem juros — só em canal onde o vendedor oferece.
  if (regras.parcelamentoPorParcela !== null || foiCobrado("parcelamento")) {
    const porParcela = regras.parcelamentoPorParcela ?? 0;
    const extras = Math.max(0, pedido.parcelas - 1);
    const esperado = fat * porParcela * extras;
    const regra =
      regras.parcelamentoPorParcela === null
        ? "Você não oferece parcelamento sem juros neste canal"
        : extras === 0
          ? "Venda à vista: sem custo de parcelamento"
          : `${pedido.parcelas}x sem juros: ${extras} parcela${extras > 1 ? "s" : ""} além da primeira × ${pct(porParcela)} sobre ${brl(fat)}`;
    itens.push(
      itemConferido("parcelamento", esperado, cobrado("parcelamento", esperado), regra, (c) => {
        if (porParcela <= 0 || fat <= 0) return undefined;
        const vezes = Math.round(c / (fat * porParcela)) + 1;
        return vezes > 1 && Math.abs(fat * porParcela * (vezes - 1) - c) < TOLERANCIA_AUDITOR
          ? `O valor cobrado é o de ${vezes}x sem juros, mas o cliente comprou em ${pedido.parcelas}x.`
          : undefined;
      }),
    );
  }

  // Taxa de transação/pagamento.
  if (regras.taxaTransacao !== null || foiCobrado("taxaTransacao")) {
    const taxa = regras.taxaTransacao ?? 0;
    const esperado = fat * taxa;
    itens.push(
      itemConferido(
        "taxaTransacao",
        esperado,
        cobrado("taxaTransacao", esperado),
        taxa > 0 ? `${pct(taxa)} sobre ${brl(fat)}` : "Este canal não cobra taxa de transação",
        (c) => (fat > 0 && taxa > 0 ? `O valor cobrado equivale a ${pct(c / fat)} da venda.` : undefined),
      ),
    );
  }

  // Taxa de programa (frete grátis, cashback).
  if (regras.taxaServico !== null || foiCobrado("taxaServico")) {
    const taxa = regras.taxaServico ?? 0;
    const esperado = fat * taxa;
    itens.push(
      itemConferido(
        "taxaServico",
        esperado,
        cobrado("taxaServico", esperado),
        taxa > 0
          ? `Programa de frete grátis: ${pct(taxa)} sobre ${brl(fat)}`
          : "Você não participa de nenhum programa neste canal",
        (c) => (fat > 0 && taxa > 0 ? `O valor cobrado equivale a ${pct(c / fat)} da venda.` : undefined),
      ),
    );
  }

  // Comissão de afiliado — só quando a venda veio de afiliado.
  if (regras.comissaoAfiliado !== null || foiCobrado("afiliado")) {
    const taxa = regras.comissaoAfiliado ?? 0;
    const veio = ex?.veioDeAfiliado ?? false;
    const esperado = veio ? fat * taxa : 0;
    itens.push(
      itemConferido(
        "afiliado",
        esperado,
        cobrado("afiliado", esperado),
        veio
          ? `Venda veio de afiliado: ${pct(taxa)} sobre ${brl(fat)}`
          : "A venda não veio de afiliado: não tem comissão de afiliado",
        (c) =>
          !veio && c > 0
            ? "Cobraram comissão de afiliado, mas esta venda não veio de nenhum afiliado."
            : undefined,
      ),
    );
  }

  // Cupom — só o cupom criado pelo vendedor sai do bolso dele.
  if (ex?.cupom || foiCobrado("cupom")) {
    const cupom = ex?.cupom ?? null;
    const esperado = cupom?.origem === "seller" ? cupom.valor : 0;
    itens.push(
      itemConferido(
        "cupom",
        esperado,
        cobrado("cupom", esperado),
        cupom?.origem === "seller"
          ? `Cupom criado por você: ${brl(cupom.valor)}`
          : cupom
            ? `Cupom do próprio canal (${brl(cupom.valor)}): o desconto é bancado por ele, não por você`
            : "Esta compra não usou cupom seu",
        (c) =>
          cupom?.origem === "canal" && c > 0
            ? "O cupom era do canal, mas o desconto foi descontado de você."
            : undefined,
      ),
    );
  }

  // Frete de devolução — só é do vendedor quando a culpa é dele.
  if (pedido.valorDevolvido > 0 || foiCobrado("freteDevolucao")) {
    const motivo = pedido.motivoDevolucao ?? "sem motivo informado";
    const culpaSeller = MOTIVOS_DEVOLUCAO_CULPA_SELLER.includes(motivo);
    const tabela = ex?.freteDevolucaoTabela ?? 0;
    const esperado = culpaSeller ? tabela : 0;
    itens.push(
      itemConferido(
        "freteDevolucao",
        esperado,
        cobrado("freteDevolucao", esperado),
        culpaSeller
          ? `Devolução por "${motivo}": o frete de volta é seu (${brl(tabela)} pela tabela)`
          : `Devolução por "${motivo}": o frete de volta é do canal, não seu`,
        (c) =>
          !culpaSeller && c > 0
            ? "O motivo da devolução não foi culpa sua, mas o frete de volta foi cobrado de você."
            : undefined,
      ),
    );
  }

  // Tarifa do Full por unidade — pelo tamanho cadastrado.
  if (
    (pedido.tipoLogistica === "full" && regras.tarifaFulfillment !== null) ||
    foiCobrado("tarifaFulfillment")
  ) {
    const tabela = regras.tarifaFulfillment;
    const tamanho = ex?.tamanhoFulfillment ?? tamanhoFulfillmentDoSku(pedido.sku);
    const porUnidade = tabela?.[tamanho] ?? 0;
    const esperado = porUnidade * pedido.quantidade;
    itens.push(
      itemConferido(
        "tarifaFulfillment",
        esperado,
        cobrado("tarifaFulfillment", esperado),
        tabela
          ? `Tamanho cadastrado ${ROTULO_TAMANHO[tamanho]}: ${brl(porUnidade)} × ${pedido.quantidade} un.`
          : "Este canal não cobra tarifa por unidade do Full",
        (c) => {
          if (!tabela) return undefined;
          for (const t of ["pequeno", "medio", "grande"] as const) {
            if (t !== tamanho && Math.abs(tabela[t] * pedido.quantidade - c) < TOLERANCIA_AUDITOR) {
              return `O valor cobrado é o do tamanho ${ROTULO_TAMANHO[t]} (${brl(tabela[t])} por unidade): o canal pode ter medido o produto diferente do cadastro.`;
            }
          }
          return undefined;
        },
      ),
    );
  }

  // Garantia estendida — só aparece se cobraram.
  if (foiCobrado("garantia")) {
    itens.push(
      itemConferido(
        "garantia",
        0,
        cobrado("garantia"),
        regras.vendeGarantia
          ? "Garantia estendida vendida junto"
          : "Você não vende garantia estendida neste canal",
      ),
    );
  }

  return itens;
}

/** Só os itens que vieram FORA da regra (compatível com a versão antiga). */
export function conferirCobrancaPedido(
  pedido: Pedido,
  conta: ContaMarketplace,
): ItemDivergenteAuditor[] {
  return conferirTodasCobrancasPedido(pedido, conta).filter(itemDivergente);
}

const CAUSA_PROVAVEL: Record<ItemCobrancaAuditor, string> = {
  comissao:
    "a comissão sai diferente quando o canal reclassifica a categoria do anúncio ou aplica uma regra de campanha",
  taxaFixa: "a taxa fixa muda quando o canal reenquadra a faixa de preço do pedido",
  frete:
    "o frete costuma sair diferente quando o peso ou as medidas cadastradas no anúncio não batem com o volume real, ou quando o canal cobra frete de um pedido em que o frete não é seu",
  parcelamento:
    "o custo de parcelamento sai errado quando o canal considera um número de parcelas diferente do que o cliente usou",
  taxaTransacao: "a taxa de transação sai diferente quando o canal aplica a taxa de outro meio de pagamento",
  taxaServico:
    "a taxa de programa sai diferente quando o canal aplica o percentual de outro programa ou não respeita a sua adesão",
  afiliado:
    "a comissão de afiliado aparece por engano quando o canal atribui a venda a um link de afiliado que não foi usado",
  cupom:
    "o cupom é descontado de você por engano quando o canal registra um cupom dele como se fosse seu",
  freteDevolucao:
    "o frete de devolução só é seu quando a culpa é sua (defeito, produto diferente, item incompleto)",
  tarifaFulfillment:
    "a tarifa do Full sai diferente quando o canal mede o produto e enquadra num tamanho maior que o cadastrado",
  garantia: "a garantia estendida aparece por engano quando o canal vincula o serviço a um anúncio seu",
  armazenagem:
    "a armazenagem sai diferente quando o canal aplica a taxa de estoque parado a um produto que está girando",
  armazenagemProlongada:
    "a armazenagem prolongada só vale pra unidades paradas há muito tempo; ela aparece por engano quando o canal conta a idade do estoque errado",
  retirada: "a retirada só pode ser cobrada quando você pede pra tirar estoque do Full",
  multaFull:
    "a multa de não conformidade só vale quando o canal registra um problema no seu envio (etiqueta, embalagem, quantidade)",
};

function causaProvavel(itens: ItemDivergenteAuditor[]): string {
  const partes = itens.map((i) => CAUSA_PROVAVEL[i.item]);
  return partes.length > 0
    ? `Possível causa: ${partes.join("; ")}.`
    : "Confira a fatura do canal pra entender a diferença.";
}

function listarNomes(itens: ItemDivergenteAuditor[]): string {
  // Só a primeira letra em minúscula: "Full" continua com F maiúsculo.
  const nomes = itens.map((i) => {
    const r = ROTULO_ITEM_AUDITOR[i.item];
    return r.charAt(0).toLowerCase() + r.slice(1);
  });
  return nomes.length === 1
    ? nomes[0]!
    : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/**
 * Varre os pedidos dos últimos `dias` e devolve uma ocorrência por
 * PEDIDO com alguma cobrança fora da regra — nunca uma por item, pra um
 * pedido com frete e comissão errados não virar dois alertas.
 */
export function auditarCobrancas(
  pedidos: Pedido[],
  contas: ContaMarketplace[],
  config: { dias?: number; referencia?: Date } = {},
): OcorrenciaAuditor[] {
  const dias = config.dias ?? DIAS_AUDITORIA;
  const referencia = config.referencia ?? new Date();
  const corte = referencia.getTime() - dias * 86400000;
  const porConta = new Map(contas.map((c) => [c.id, c]));

  const ocorrencias: OcorrenciaAuditor[] = [];
  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    if (new Date(p.data).getTime() < corte) continue;
    const conta = porConta.get(p.contaId);
    if (!conta) continue;

    const conferidos = conferirTodasCobrancasPedido(p, conta);
    const itens = conferidos.filter(itemDivergente);
    if (itens.length === 0) continue;

    const diferenca = r2(itens.reduce((s, i) => s + (i.cobrado - i.esperado), 0));
    if (Math.abs(diferenca) < TOLERANCIA_AUDITOR) continue;

    ocorrencias.push({
      id: "",
      chave: `pedido:${p.id}`,
      tipo: "cobranca-divergente",
      data: p.data,
      anuncioId: null,
      pedidoId: p.id,
      sku: p.sku,
      produto: p.produto,
      marketplaceId: p.marketplaceId,
      contaId: p.contaId,
      contaNome: conta.nome,
      motivo: `O pedido ${p.id} foi cobrado ${diferenca > 0 ? "a mais" : "a menos"} em ${listarNomes(itens)}: diferença de ${brl(Math.abs(diferenca))}.`,
      causaProvavel: causaProvavel(itens),
      campo: null,
      valorAnterior: null,
      valorNovo: null,
      pedidosAfetados: [],
      itensDivergentes: itens,
      itensConferidos: conferidos,
      mesReferencia: null,
      diferenca,
      status: "aberto",
      atualizadoEm: null,
    });
  }
  return ocorrencias.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca));
}

const NOME_MES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** "2026-08" → "agosto/2026" */
export function rotuloMesReferencia(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${NOME_MES[Number(m) - 1] ?? m}/${ano}`;
}

/**
 * Confere a fatura mensal do Full de cada SKU: armazenagem, armazenagem
 * prolongada, retirada de estoque e multa de não conformidade. Uma
 * ocorrência por SKU por mês, só quando algum item veio fora da regra.
 */
export function auditarCobrancasFull(
  faturas: CobrancaFullMes[],
  estoqueFull: ItemEstoqueDetalhado[],
  contas: ContaMarketplace[],
): OcorrenciaAuditor[] {
  const porSku = new Map(estoqueFull.map((i) => [`${i.marketplaceId}:${i.sku}`, i]));
  const ocorrencias: OcorrenciaAuditor[] = [];

  for (const f of faturas) {
    const item = porSku.get(`${f.marketplaceId}:${f.sku}`);
    if (!item) continue;
    // O Full é da conta principal do canal (a primeira conta ativa dele).
    const conta = contas.find((c) => c.marketplaceId === f.marketplaceId);
    if (!conta) continue;

    const parado = item.coberturaDias > ARMAZENAGEM_FULL.diasParado;
    const taxa = parado ? ARMAZENAGEM_FULL.parado : ARMAZENAGEM_FULL.normal;
    const esperadoArmazenagem = item.valorEstoque * taxa;
    const prolongada = item.coberturaDias > ARMAZENAGEM_FULL.diasProlongada;
    const esperadoProlongada = prolongada
      ? item.quantidade * ARMAZENAGEM_FULL.prolongadaPorUnidade
      : 0;
    const esperadoRetirada = f.retiradasSolicitadas * ARMAZENAGEM_FULL.retiradaPorUnidade;

    const conferidos: ItemDivergenteAuditor[] = [
      itemConferido(
        "armazenagem",
        esperadoArmazenagem,
        f.cobrado.armazenagem ?? esperadoArmazenagem,
        `${pct(taxa)} ao mês sobre ${brl(item.valorEstoque)} em estoque (cobertura de ${item.coberturaDias} dias${parado ? `, acima de ${ARMAZENAGEM_FULL.diasParado}: taxa de estoque parado` : ""})`,
        (c) =>
          !parado &&
          item.valorEstoque > 0 &&
          Math.abs(item.valorEstoque * ARMAZENAGEM_FULL.parado - c) < TOLERANCIA_AUDITOR
            ? `Cobraram a taxa de estoque parado (${pct(ARMAZENAGEM_FULL.parado)}), mas a cobertura é de ${item.coberturaDias} dias, abaixo de ${ARMAZENAGEM_FULL.diasParado}.`
            : undefined,
      ),
      itemConferido(
        "armazenagemProlongada",
        esperadoProlongada,
        f.cobrado.armazenagemProlongada ?? esperadoProlongada,
        prolongada
          ? `Cobertura de ${item.coberturaDias} dias, acima de ${ARMAZENAGEM_FULL.diasProlongada}: ${brl(ARMAZENAGEM_FULL.prolongadaPorUnidade)} × ${item.quantidade} un.`
          : `Cobertura de ${item.coberturaDias} dias, abaixo de ${ARMAZENAGEM_FULL.diasProlongada}: não tem armazenagem prolongada`,
        (c) =>
          !prolongada && c > 0
            ? "Cobraram armazenagem prolongada, mas o estoque deste SKU está girando e não tem unidade parada há mais de 120 dias."
            : undefined,
      ),
      itemConferido(
        "retirada",
        esperadoRetirada,
        f.cobrado.retirada ?? esperadoRetirada,
        f.retiradasSolicitadas > 0
          ? `${f.retiradasSolicitadas} un. retiradas a seu pedido × ${brl(ARMAZENAGEM_FULL.retiradaPorUnidade)}`
          : "Você não pediu nenhuma retirada de estoque no mês",
        (c) =>
          f.retiradasSolicitadas === 0 && c > 0
            ? "Cobraram retirada de estoque, mas você não pediu nenhuma retirada."
            : undefined,
      ),
      itemConferido(
        "multaFull",
        0,
        f.cobrado.multaFull ?? 0,
        f.naoConformidades > 0
          ? `${f.naoConformidades} não conformidade(s) registrada(s) no mês`
          : "Nenhuma não conformidade registrada no seu envio",
        (c) =>
          f.naoConformidades === 0 && c > 0
            ? "Cobraram multa, mas o canal não registrou nenhuma não conformidade no seu envio."
            : undefined,
      ),
    ];
    const itens = conferidos.filter(itemDivergente);
    if (itens.length === 0) continue;
    const diferenca = r2(itens.reduce((s, i) => s + (i.cobrado - i.esperado), 0));

    ocorrencias.push({
      id: "",
      chave: `full:${f.marketplaceId}:${f.sku}:${f.mes}`,
      tipo: "cobranca-full",
      data: f.data,
      anuncioId: null,
      pedidoId: null,
      sku: f.sku,
      produto: f.produto,
      marketplaceId: f.marketplaceId,
      contaId: conta.id,
      contaNome: conta.nome,
      motivo: `A fatura do Full de ${rotuloMesReferencia(f.mes)} deste SKU veio ${diferenca > 0 ? "a mais" : "a menos"} em ${listarNomes(itens)}: diferença de ${brl(Math.abs(diferenca))}.`,
      causaProvavel: causaProvavel(itens),
      campo: null,
      valorAnterior: null,
      valorNovo: null,
      pedidosAfetados: [],
      itensDivergentes: itens,
      itensConferidos: conferidos,
      mesReferencia: f.mes,
      diferenca,
      status: "aberto",
      atualizadoEm: null,
    });
  }
  return ocorrencias.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca));
}

/**
 * Junta o que está gravado no banco (status que o seller escolheu) com o
 * cálculo de agora (valores e explicações atualizados). O banco é a
 * memória do STATUS; a conta sempre vem do cálculo mais recente. Quando
 * a ocorrência não aparece mais no cálculo (saiu da janela de 30 dias),
 * fica a versão gravada.
 */
export function mesclarOcorrenciasAuditor(
  gravadas: OcorrenciaAuditor[],
  calculadas: OcorrenciaAuditor[],
): OcorrenciaAuditor[] {
  const porChave = new Map(calculadas.map((o) => [o.chave, o]));
  return gravadas.map((g) => {
    const atual = porChave.get(g.chave);
    return atual
      ? { ...atual, id: g.id, status: g.status, atualizadoEm: g.atualizadoEm }
      : g;
  });
}

/**
 * Transforma cada mudança de regra (comissão ou taxa fixa de um anúncio)
 * numa ocorrência, já com os pedidos que saíram DEPOIS da mudança e
 * quanto isso custou a mais. Esses pedidos não são erro de cobrança — é
 * a regra nova valendo —, por isso ficam agrupados aqui dentro.
 */
export function auditarMudancasTaxa(
  historico: HistoricoTaxaAnuncio[],
  anuncios: Anuncio[],
  pedidos: Pedido[],
  contas: ContaMarketplace[],
): OcorrenciaAuditor[] {
  const porAnuncio = new Map(anuncios.map((a) => [a.id, a]));
  const porConta = new Map(contas.map((c) => [c.id, c]));

  const ocorrencias: OcorrenciaAuditor[] = [];
  for (const h of historico) {
    const anuncio = porAnuncio.get(h.anuncioId);
    if (!anuncio) continue;
    const conta = porConta.get(anuncio.contaId);

    const ehPercentual = h.campo === "comissaoPercentual";
    const fmt = (v: number) =>
      ehPercentual
        ? `${(v * 100).toFixed(1).replace(".", ",")}%`
        : `R$ ${v.toFixed(2).replace(".", ",")}`;
    const delta = h.valorNovo - h.valorAnterior;
    const desde = new Date(h.detectadoEm).getTime();

    const afetados: PedidoAfetadoAuditor[] = pedidos
      .filter(
        (p) =>
          p.sku === h.sku &&
          p.contaId === anuncio.contaId &&
          p.status !== "cancelado" &&
          new Date(p.data).getTime() >= desde,
      )
      .map((p) => ({
        pedidoId: p.id,
        data: p.data,
        faturamento: p.faturamento,
        custoExtra:
          Math.round((ehPercentual ? p.faturamento * delta : delta * p.quantidade) * 100) / 100,
      }))
      .sort((a, b) => +new Date(b.data) - +new Date(a.data));

    const total = Math.round(afetados.reduce((s, p) => s + p.custoExtra, 0) * 100) / 100;
    const nomeCampo = ehPercentual ? "A comissão" : "A taxa fixa";

    ocorrencias.push({
      id: "",
      chave: `taxa:${h.id}`,
      tipo: "mudanca-taxa",
      data: h.detectadoEm,
      anuncioId: h.anuncioId,
      pedidoId: null,
      sku: h.sku,
      produto: h.produto,
      marketplaceId: h.marketplaceId,
      contaId: anuncio.contaId,
      contaNome: conta?.nome ?? "",
      motivo: `${nomeCampo} deste anúncio mudou de ${fmt(h.valorAnterior)} para ${fmt(h.valorNovo)}.`,
      causaProvavel:
        delta > 0
          ? "A margem deste anúncio caiu e o ROAS mínimo dele subiu. Confira o preço no Agente de Precificação e o objetivo de Ads no Agente de Ads."
          : "A taxa caiu: a margem deste anúncio melhorou e ele aguenta um ROAS mínimo menor.",
      campo: h.campo,
      valorAnterior: h.valorAnterior,
      valorNovo: h.valorNovo,
      pedidosAfetados: afetados,
      itensDivergentes: [],
      diferenca: total,
      status: "aberto",
      atualizadoEm: null,
    });
  }
  return ocorrencias.sort((a, b) => +new Date(b.data) - +new Date(a.data));
}

export interface ResumoAuditoria {
  /** Só o que foi cobrado A MAIS (as diferenças a menos não entram) */
  cobradoAMais: number;
  recuperado: number;
  pendente: number;
  abertas: number;
}

/** Os três números do topo da tela do Auditor. */
export function resumirAuditoria(ocorrencias: OcorrenciaAuditor[]): ResumoAuditoria {
  let cobradoAMais = 0;
  let recuperado = 0;
  let pendente = 0;
  let abertas = 0;
  for (const o of ocorrencias) {
    if (o.tipo === "mudanca-taxa" || o.diferenca <= 0) continue;
    cobradoAMais += o.diferenca;
    if (o.status === "reembolsado") recuperado += o.diferenca;
    else if (o.status !== "ignorado") pendente += o.diferenca;
    if (o.status === "aberto" || o.status === "reclamacao-aberta") abertas++;
  }
  const arredondar = (n: number) => Math.round(n * 100) / 100;
  return {
    cobradoAMais: arredondar(cobradoAMais),
    recuperado: arredondar(recuperado),
    pendente: arredondar(pendente),
    abertas,
  };
}
