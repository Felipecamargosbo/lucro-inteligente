// Lógica de negócio financeira: como uma venda vira lucro líquido.
// Tudo aqui é puro (entra número, sai número) para no futuro funcionar
// igual com dados reais vindos das APIs.

import type {
  Anuncio,
  FaixaSaudeMargem,
  MetasMargem,
  OrigemValor,
  Pedido,
  Periodo,
  Promocao,
} from "@/types";
import { dentroDoPeriodo, inicioDoDia, listarDias } from "./period";

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

export function raioXAnuncio(
  a: Anuncio,
  metas: MetasMargem | null,
  preco = a.precoAtual,
): RaioXAnuncio {
  const semCusto = a.cmv === null;
  const cmv = a.cmv ?? 0;

  const impostos = preco * a.impostoPercentual;
  const comissao = preco * a.comissaoPercentual;
  const totalDescontos =
    impostos +
    comissao +
    a.taxaFixa +
    a.freteUnitario +
    a.custoMidiaUnitario +
    a.custoAfiliadoUnitario;

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
    totalDescontos,
    custoTotal,
    lucroLiquido,
    margem,
    faixa: classificarFaixa(margem, metas, semCusto),
    origemTaxas: a.origemTaxas,
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
  const semVinculo = anuncios.filter((a) => !a.produtoVinculado).length;
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
  cmv: number;
  impostos: number;
  comissoes: number;
  outrosCustos: number;
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

  return {
    faturamento,
    pedidos: validos.length,
    ticketMedio: validos.length ? faturamento / validos.length : 0,
    cmv: soma((p) => p.cmv),
    impostos: soma((p) => p.impostos),
    comissoes: soma((p) => p.comissao),
    outrosCustos,
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
  pedidos: number;
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
    });
  }
  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    const chave = inicioDoDia(new Date(p.data)).toDateString();
    const ponto = mapa.get(chave);
    if (!ponto) continue;
    ponto.faturamento += p.faturamento;
    ponto.lucro += p.lucroLiquido;
    ponto.pedidos += p.quantidade;
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
