// O Gestor: junta o que os outros agentes descobriram e o resultado do
// negócio, sem IA — roda no navegador, de graça. A IA só entra no chat.
//
// Três coisas moram aqui:
// 1. Top 3 do dia: as três decisões pendentes que valem mais dinheiro,
//    uma por agente, em R$;
// 2. Resumo diário e semanal com comparativos, escrito por extenso;
// 3. A mesma mensagem no formato do WhatsApp (prévia pra copiar).

import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { resumir } from "@/lib/finance";
import type {
  AcaoAds,
  AlertaEstoque,
  EventoAgente,
  ItemEstoqueDetalhado,
  OcorrenciaAuditor,
  Pedido,
  SemaforoDecisao,
} from "@/types";

/* ------------------------------------------------------------------ */
/* Top 3 do dia                                                        */
/* ------------------------------------------------------------------ */

/** Pra qual aba o botão "Abrir no agente" leva. */
export type AgenteTop = "auditor" | "estoque" | "fulfillment" | "precificacao" | "ads";

export interface ItemTop {
  agente: AgenteTop;
  /** Nome do agente, pra mostrar */
  nomeAgente: string;
  /** Uma frase curta do que fazer */
  titulo: string;
  /** Por que, com os números */
  explicacao: string;
  /** Quanto dinheiro está em jogo — é o que ordena o Top 3 */
  valor: number;
  /** Como ler o valor: "cobrado a mais", "lucro em risco por semana"... */
  rotuloValor: string;
  semaforo: SemaforoDecisao;
}

const NOME_AGENTE: Record<AgenteTop, string> = {
  auditor: "Auditor",
  estoque: "Estoque",
  fulfillment: "Fulfillment",
  precificacao: "Precificação",
  ads: "Ads",
};

/** Quanto lucro deixa de entrar por semana se o produto ficar sem
 * estoque: vendas por dia × 7 × preço × margem. Sem margem conhecida,
 * usa o faturamento (e o texto diz isso). */
function lucroSemanalEmRisco(a: AlertaEstoque, preco: number): { valor: number; usouMargem: boolean } {
  const faturamentoSemana = a.mediaDiaria * 7 * preco;
  if (a.margem30d !== undefined && a.margem30d !== null && a.margem30d > 0) {
    return { valor: faturamentoSemana * a.margem30d, usouMargem: true };
  }
  return { valor: faturamentoSemana, usouMargem: false };
}

/** O maior item de um agente (o Top 3 mostra no máximo um por agente,
 * pra não virar três avisos do mesmo lugar). */
function maior(itens: ItemTop[]): ItemTop | null {
  return itens.reduce<ItemTop | null>((m, i) => (m === null || i.valor > m.valor ? i : m), null);
}

function itemEstoque(
  alertas: AlertaEstoque[],
  agente: "estoque" | "fulfillment",
  precoPorSku: Map<string, number>,
): ItemTop | null {
  const itens: ItemTop[] = [];
  for (const a of alertas) {
    if (a.status !== "pendente") continue;
    if (a.tipoAlerta === "parado") {
      const economia = a.economiaMensal ?? 0;
      const parado = (a.custoUnitario ?? 0) * a.estoqueAtual;
      if (agente === "fulfillment" && economia > 0) {
        itens.push({
          agente,
          nomeAgente: NOME_AGENTE[agente],
          titulo: `Retirar ${a.produto} parado no Full`,
          explicacao: `Parado há mais de 60 dias no Full, pagando armazenagem. Tirar ${formatNumero(a.quantidadeRetirar ?? a.estoqueAtual)} unidades economiza ${formatBRL(economia)} por mês.`,
          valor: economia,
          rotuloValor: "de economia por mês",
          semaforo: "amarelo",
        });
      } else if (parado > 0) {
        itens.push({
          agente,
          nomeAgente: NOME_AGENTE[agente],
          titulo: `${a.produto} parado`,
          explicacao: `${formatNumero(a.estoqueAtual)} unidades sem vender, com ${formatBRL(parado)} de mercadoria parada. Vale uma promoção ou baixar o preço.`,
          valor: parado,
          rotuloValor: "de mercadoria parada",
          semaforo: "amarelo",
        });
      }
      continue;
    }
    // Ruptura: só conta se o próprio agente acha que vale repor.
    if (a.veredito === "nao-repor") continue;
    const preco = precoPorSku.get(a.sku) ?? 0;
    const { valor, usouMargem } = lucroSemanalEmRisco(a, preco);
    if (valor <= 0) continue;
    const dias = Math.max(0, Math.round(a.diasRestantes));
    itens.push({
      agente,
      nomeAgente: NOME_AGENTE[agente],
      titulo: `Repor ${a.produto}`,
      explicacao: `${dias === 0 ? "O estoque já acabou" : `O estoque acaba em ${dias} dia${dias === 1 ? "" : "s"}`}${a.prazoFornecedorDias ? ` e o fornecedor leva ${a.prazoFornecedorDias} dias pra entregar` : ""}. Sem repor, você deixa de ${usouMargem ? "lucrar" : "faturar"} cerca de ${formatBRL(valor)} por semana.`,
      valor,
      rotuloValor: usouMargem ? "de lucro em risco por semana" : "de faturamento em risco por semana",
      semaforo: dias <= 3 ? "vermelho" : "amarelo",
    });
  }
  return maior(itens);
}

export function montarTop3(p: {
  ocorrenciasAuditor: OcorrenciaAuditor[];
  alertasEstoque: AlertaEstoque[];
  alertasFulfillment: AlertaEstoque[];
  eventosPreco: EventoAgente[];
  acoesAds: AcaoAds[];
  estoqueDetalhado: ItemEstoqueDetalhado[];
  /** SKU → preço atual (o primeiro anúncio do SKU) */
  precoPorSku: Map<string, number>;
}): ItemTop[] {
  const candidatos: (ItemTop | null)[] = [];

  // Auditor: tudo que foi cobrado a mais e ainda está sem reclamação.
  const abertas = p.ocorrenciasAuditor.filter((o) => o.status === "aberto" && o.diferenca > 0);
  if (abertas.length > 0) {
    const total = abertas.reduce((s, o) => s + o.diferenca, 0);
    candidatos.push({
      agente: "auditor",
      nomeAgente: NOME_AGENTE.auditor,
      titulo: "Abrir reclamação das cobranças a mais",
      explicacao: `${abertas.length} ${abertas.length === 1 ? "cobrança veio" : "cobranças vieram"} acima do que deveria, somando ${formatBRL(total)}. O dinheiro só volta se você reclamar no marketplace.`,
      valor: total,
      rotuloValor: "cobrado a mais",
      semaforo: "vermelho",
    });
  }

  candidatos.push(itemEstoque(p.alertasEstoque, "estoque", p.precoPorSku));
  candidatos.push(itemEstoque(p.alertasFulfillment, "fulfillment", p.precoPorSku));

  // Precificação: baixar libera dinheiro parado; subir aumenta o lucro.
  const porSku = new Map(p.estoqueDetalhado.map((e) => [e.sku, e]));
  const itensPreco: ItemTop[] = [];
  for (const e of p.eventosPreco) {
    if (e.status !== "pendente") continue;
    const est = porSku.get(e.sku);
    if (!est) continue;
    if (e.direcao === "subir") {
      const ganho = (e.precoSugerido - e.precoAtual) * est.vendasDia * 7;
      if (ganho <= 0) continue;
      itensPreco.push({
        agente: "precificacao",
        nomeAgente: NOME_AGENTE.precificacao,
        titulo: `Subir o preço de ${e.produto}`,
        explicacao: `Vende rápido e o estoque vai acabar antes da reposição. Subir de ${formatBRL(e.precoAtual)} para ${formatBRL(e.precoSugerido)} rende uns ${formatBRL(ganho)} a mais por semana no ritmo atual.`,
        valor: ganho,
        rotuloValor: "a mais por semana",
        semaforo: "verde",
      });
    } else {
      const preso = est.quantidade * est.custoUnitario;
      if (preso <= 0) continue;
      itensPreco.push({
        agente: "precificacao",
        nomeAgente: NOME_AGENTE.precificacao,
        titulo: `Baixar o preço de ${e.produto}`,
        explicacao: `Parado há ${e.diasParado} dias, com ${formatBRL(preso)} de mercadoria presa. Baixar de ${formatBRL(e.precoAtual)} para ${formatBRL(e.precoSugerido)} ajuda a girar e liberar esse dinheiro.`,
        valor: preso,
        rotuloValor: "de dinheiro parado",
        semaforo: "amarelo",
      });
    }
  }
  candidatos.push(maior(itensPreco));

  // Ads: dinheiro gasto em anúncio que não converte.
  const itensAds: ItemTop[] = [];
  for (const a of p.acoesAds) {
    if (a.status !== "pendente") continue;
    const d = a.detalhe;
    if (d.tipo === "anuncio_cansado") {
      itensAds.push({
        agente: "ads",
        nomeAgente: NOME_AGENTE.ads,
        titulo: `Revisar o anúncio de ${a.produto}`,
        explicacao: `${formatNumero(d.cliques)} cliques e só ${formatNumero(d.vendas)} venda(s) em 14 dias: ${formatBRL(d.investimento)} pagos por visita que não compra.`,
        valor: d.investimento,
        rotuloValor: "gastos em 14 dias",
        semaforo: "vermelho",
      });
    } else if (d.tipo === "realocacao") {
      itensAds.push({
        agente: "ads",
        nomeAgente: NOME_AGENTE.ads,
        titulo: `Mover verba de ${d.fonte.produto} para ${d.destino.produto}`,
        explicacao: `${d.fonte.produto} gastou ${formatBRL(d.fonte.investimento)} em 14 dias abaixo do ROAS mínimo (no prejuízo). ${d.destino.produto} está dando retorno.`,
        valor: d.fonte.investimento,
        rotuloValor: "no prejuízo em 14 dias",
        semaforo: "amarelo",
      });
    }
  }
  candidatos.push(maior(itensAds));

  return candidatos
    .filter((c): c is ItemTop => c !== null && c.valor > 0)
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 3);
}

/* ------------------------------------------------------------------ */
/* Resumo diário e semanal                                             */
/* ------------------------------------------------------------------ */

export interface NumerosPeriodo {
  faturamento: number;
  lucro: number;
  margem: number;
  pedidos: number;
}

export interface Comparativo {
  /** "Hoje", "Últimos 7 dias", "Mês até hoje" */
  rotulo: string;
  /** Pra frase, com artigo: "a terça passada", "os 7 dias anteriores" */
  rotuloAnterior: string;
  /** Curto, pro WhatsApp: "terça passada", "7 dias antes" */
  rotuloCurto: string;
  atual: NumerosPeriodo;
  anterior: NumerosPeriodo;
}

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
/** Domingo e sábado são "o"; os outros dias são "a". */
function diaPassado(d: Date): { comArtigo: string; curto: string } {
  const nome = DIAS_SEMANA[d.getDay()]!;
  const masculino = d.getDay() === 0 || d.getDay() === 6;
  const curto = `${nome} ${masculino ? "passado" : "passada"}`;
  return { comArtigo: `${masculino ? "o" : "a"} ${curto}`, curto };
}

function numeros(pedidos: Pedido[], inicio: Date, fim: Date): NumerosPeriodo {
  const r = resumir(
    pedidos.filter((p) => {
      const d = new Date(p.data).getTime();
      return d >= inicio.getTime() && d <= fim.getTime();
    }),
  );
  return { faturamento: r.faturamento, lucro: r.lucroLiquido, margem: r.margem, pedidos: r.pedidos };
}

function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function menosDias(d: Date, dias: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() - dias);
  return x;
}

/**
 * Os três comparativos, sempre "até o mesmo horário" pra ser justo:
 * - Hoje × o mesmo dia da semana passada (até a mesma hora);
 * - Últimos 7 dias × os 7 dias antes deles;
 * - Mês até hoje × o mesmo pedaço do mês passado (dia 1 até o mesmo dia).
 */
export function montarComparativos(pedidos: Pedido[], agora = new Date()): {
  dia: Comparativo;
  semana: Comparativo;
  mes: Comparativo;
} {
  const hojeInicio = inicioDoDia(agora);
  const semanaPassada = menosDias(agora, 7);
  const passado = diaPassado(agora);
  const dia: Comparativo = {
    rotulo: "Hoje",
    rotuloAnterior: passado.comArtigo,
    rotuloCurto: passado.curto,
    atual: numeros(pedidos, hojeInicio, agora),
    anterior: numeros(pedidos, inicioDoDia(semanaPassada), semanaPassada),
  };

  const seteDiasInicio = menosDias(hojeInicio, 6);
  const semana: Comparativo = {
    rotulo: "Últimos 7 dias",
    rotuloAnterior: "os 7 dias anteriores",
    rotuloCurto: "7 dias antes",
    atual: numeros(pedidos, seteDiasInicio, agora),
    anterior: numeros(pedidos, menosDias(seteDiasInicio, 7), menosDias(agora, 7)),
  };

  const mesInicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const mesPassadoInicio = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  // Mesmo dia do mês passado (se o mês passado for mais curto, o último dia dele).
  const ultimoDiaMesPassado = new Date(agora.getFullYear(), agora.getMonth(), 0).getDate();
  const mesPassadoFim = new Date(mesPassadoInicio);
  mesPassadoFim.setDate(Math.min(agora.getDate(), ultimoDiaMesPassado));
  mesPassadoFim.setHours(agora.getHours(), agora.getMinutes(), agora.getSeconds(), 0);
  const mes: Comparativo = {
    rotulo: "Mês até hoje",
    rotuloAnterior: `o mesmo período do mês passado (dia 1 a ${mesPassadoFim.getDate()})`,
    rotuloCurto: `mês passado, dia 1 a ${mesPassadoFim.getDate()}`,
    atual: numeros(pedidos, mesInicio, agora),
    anterior: numeros(pedidos, mesPassadoInicio, mesPassadoFim),
  };

  return { dia, semana, mes };
}

/** Variação em %, ou null quando não dá pra comparar (antes era zero). */
export function variacao(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return (atual - anterior) / Math.abs(anterior);
}

/** "12% a mais" / "8% a menos" / "igual" — pra frase por extenso. */
function textoVariacao(atual: number, anterior: number): string {
  const v = variacao(atual, anterior);
  if (v === null) return atual > 0 ? "sem base de comparação (antes não teve venda)" : "igual";
  if (Math.abs(v) < 0.005) return "praticamente igual";
  return `${formatPercentual(Math.abs(v), 0)} a ${v > 0 ? "mais" : "menos"}`;
}

/** As frases do resumo, curtas e explicadas. */
export function frasesComparativo(c: Comparativo): string[] {
  const a = c.atual;
  const b = c.anterior;
  const frases: string[] = [];
  const quando =
    c.rotulo === "Hoje" ? "Hoje você" : c.rotulo === "Últimos 7 dias" ? "Nos últimos 7 dias você" : "No mês, até agora, você";
  frases.push(
    `${quando} faturou ${formatBRL(a.faturamento)} em ${formatNumero(a.pedidos)} pedido${a.pedidos === 1 ? "" : "s"} e lucrou ${formatBRL(a.lucro)} (margem de ${formatPercentual(a.margem)}).`,
  );
  const diferencaLucro = a.lucro - b.lucro;
  frases.push(
    `Comparando com ${c.rotuloAnterior}: o lucro foi ${textoVariacao(a.lucro, b.lucro)}${
      variacao(a.lucro, b.lucro) !== null && Math.abs(diferencaLucro) >= 0.01
        ? ` (${diferencaLucro >= 0 ? "+" : "−"}${formatBRL(Math.abs(diferencaLucro))})`
        : ""
    } e o faturamento ${textoVariacao(a.faturamento, b.faturamento)}.`,
  );
  // O que explica: vendeu mais/menos (volume) e/ou ganhou mais/menos
  // em cada venda (margem). Pode ser os dois ao mesmo tempo.
  const vPedidos = variacao(a.pedidos, b.pedidos);
  const difMargem = (a.margem - b.margem) * 100;
  if (vPedidos !== null && Math.abs(vPedidos) >= 0.1) {
    frases.push(
      vPedidos > 0
        ? `Você vendeu mais: ${formatNumero(a.pedidos)} pedidos contra ${formatNumero(b.pedidos)}.`
        : `Você vendeu menos: ${formatNumero(a.pedidos)} pedidos contra ${formatNumero(b.pedidos)}.`,
    );
  }
  if (vPedidos !== null && Math.abs(difMargem) >= 1) {
    frases.push(
      difMargem > 0
        ? `A margem subiu de ${formatPercentual(b.margem)} para ${formatPercentual(a.margem)}: cada venda está deixando mais lucro.`
        : `A margem caiu de ${formatPercentual(b.margem)} para ${formatPercentual(a.margem)}: cada venda está deixando menos lucro — vale olhar preço, taxas e Ads.`,
    );
  }
  return frases;
}

/* ------------------------------------------------------------------ */
/* WhatsApp                                                            */
/* ------------------------------------------------------------------ */

function linhaTabela(rotulo: string, atual: string, anterior: string, variacaoTxt: string): string {
  return `${rotulo} | ${atual} | ${anterior} | ${variacaoTxt}`;
}

function variacaoCurta(atual: number, anterior: number): string {
  const v = variacao(atual, anterior);
  if (v === null) return "—";
  const sinal = v > 0 ? "▲" : v < 0 ? "▼" : "=";
  return `${sinal} ${formatPercentual(Math.abs(v), 0)}`;
}

/**
 * A mensagem pronta pro WhatsApp: título, tabelinha com "|" e frases
 * curtas explicando. WhatsApp usa *asterisco* pra negrito. Diário tem o
 * dia; semanal tem a semana e o mês.
 */
export function montarMensagemWhatsApp(p: {
  tipo: "diario" | "semanal";
  comparativos: ReturnType<typeof montarComparativos>;
  top3: ItemTop[];
  agora?: Date;
}): string {
  const agora = p.agora ?? new Date();
  const data = agora.toLocaleDateString("pt-BR");
  const linhas: string[] = [];
  const blocos: Comparativo[] =
    p.tipo === "diario" ? [p.comparativos.dia] : [p.comparativos.semana, p.comparativos.mes];

  linhas.push(p.tipo === "diario" ? `*Resumo do dia — ${data}*` : `*Resumo da semana — ${data}*`);

  for (const c of blocos) {
    linhas.push("");
    linhas.push(`*${c.rotulo}* (x ${c.rotuloCurto})`);
    linhas.push(linhaTabela("Item", "Agora", "Antes", "Variação"));
    linhas.push(
      linhaTabela(
        "Faturamento",
        formatBRL(c.atual.faturamento),
        formatBRL(c.anterior.faturamento),
        variacaoCurta(c.atual.faturamento, c.anterior.faturamento),
      ),
    );
    linhas.push(
      linhaTabela(
        "Lucro",
        formatBRL(c.atual.lucro),
        formatBRL(c.anterior.lucro),
        variacaoCurta(c.atual.lucro, c.anterior.lucro),
      ),
    );
    linhas.push(
      linhaTabela(
        "Margem",
        formatPercentual(c.atual.margem),
        formatPercentual(c.anterior.margem),
        `${((c.atual.margem - c.anterior.margem) * 100 >= 0 ? "+" : "−")}${Math.abs((c.atual.margem - c.anterior.margem) * 100).toFixed(1).replace(".", ",")} pp`,
      ),
    );
    linhas.push(
      linhaTabela(
        "Pedidos",
        formatNumero(c.atual.pedidos),
        formatNumero(c.anterior.pedidos),
        variacaoCurta(c.atual.pedidos, c.anterior.pedidos),
      ),
    );
    for (const f of frasesComparativo(c).slice(1)) linhas.push(`_${f}_`);
  }

  if (p.top3.length > 0) {
    linhas.push("");
    linhas.push("*O que fazer primeiro*");
    p.top3.forEach((t, i) => {
      linhas.push(`${i + 1}. ${t.titulo} — ${formatBRL(t.valor)} ${t.rotuloValor} (${t.nomeAgente})`);
    });
  }

  linhas.push("");
  linhas.push("Detalhes no NEXO › Agentes › Gestor.");
  return linhas.join("\n").replace(/ /g, " ");
}
