// Lógica de negócio financeira: como uma venda vira lucro líquido.
// Tudo aqui é puro (entra número, sai número) para no futuro funcionar
// igual com dados reais vindos das APIs.

import type {
  Anuncio,
  ContaMarketplace,
  FaixaSaudeMargem,
  ItemEstoqueDetalhado,
  Lancamento,
  MarketplaceId,
  MetasMargem,
  OrigemValor,
  Pedido,
  Periodo,
  Promocao,
  SemaforoDecisao,
} from "@/types";
import { dentroDoPeriodo, fimDoDia, inicioDoDia, listarDias, somarDias } from "./period";

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
/* Agente de Ads                                                       */
/* ------------------------------------------------------------------ */

export interface DiagnosticoAds {
  anuncio: Anuncio;
  investimento: number;
  vendasAtribuidas: number;
  roas: number;
  acos: number;
  ctr: number;
  cpc: number;
  margemSemAds: number;
  margemComAds: number;
  margemMinima: number;
  valeAPena: boolean;
}

/**
 * O veredito não é o ROAS — é a margem de verdade. Um ROAS de 8x ainda
 * pode ser prejuízo se a margem do produto, antes de qualquer Ads, já
 * era apertada; e um ROAS de 2x pode valer a pena se sobra bastante
 * margem pra absorver. Por isso a conta sempre passa pelo mesmo motor
 * de margem que o resto do sistema usa — nunca julga o Ads sozinho.
 */
export function diagnosticarAds(
  anuncios: Anuncio[],
  margemMinima: number,
  opcoes: OpcoesLimites = {},
): DiagnosticoAds[] {
  const avaliacoes: DiagnosticoAds[] = [];

  for (const a of anuncios) {
    if (a.status !== "ativo" || !a.ads || a.ads.investimento <= 0) continue;

    const { investimento, impressoes, cliques, vendasAtribuidas } = a.ads;
    const receitaAtribuida = vendasAtribuidas * a.precoAtual;

    const margemComAds = margemNoPreco(a, a.precoAtual, opcoes);
    // Mesmo anúncio, mesmo preço, só tirando o Ads da conta — pra isolar
    // exatamente o que ele está custando de margem.
    const margemSemAds = margemNoPreco(
      { ...a, custoMidiaUnitario: 0 },
      a.precoAtual,
      opcoes,
    );

    avaliacoes.push({
      anuncio: a,
      investimento,
      vendasAtribuidas,
      roas: investimento > 0 ? receitaAtribuida / investimento : 0,
      acos: receitaAtribuida > 0 ? investimento / receitaAtribuida : 1,
      ctr: impressoes > 0 ? cliques / impressoes : 0,
      cpc: cliques > 0 ? investimento / cliques : 0,
      margemSemAds,
      margemComAds,
      margemMinima,
      valeAPena: margemComAds >= margemMinima,
    });
  }

  // Quem está corroendo mais margem primeiro — é onde a atenção rende mais.
  return avaliacoes.sort((x, y) => x.margemComAds - y.margemComAds);
}
