// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Check,
  Clock,
  Copy,
  Loader2,
  MessageSquareText,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingDown,
} from "lucide-react";
import {
  chatGestorService,
  campanhasService,
  contasService,
  estoqueService,
  eventosAgenteService,
  fulfillmentService,
  produtosService,
  recuperacaoService,
  vendasService,
} from "@/services";
import type { MensagemChat } from "@/services";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { resumir } from "@/lib/finance";
import {
  frasesComparativo,
  montarMensagemWhatsApp,
  variacao,
  type AgenteTop,
  type Comparativo,
  type ItemTop,
  type montarComparativos,
} from "@/lib/gestor";
import { Painel } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InsightAnalista, TipoInsightAnalista } from "@/types";
import { ESTILO_SEMAFORO } from "./comum";

const NOME_GESTOR = "Agente Gestor";

type Comparativos = ReturnType<typeof montarComparativos>;

const ICONE_INSIGHT: Record<TipoInsightAnalista, typeof AlertTriangle> = {
  queda_margem: TrendingDown,
  curva_abc: BarChart3,
  dado_faltando: AlertTriangle,
  saude_conta: ShieldAlert,
  resumo_diario: Sparkles,
};

const TITULO_INSIGHT: Record<TipoInsightAnalista, string> = {
  queda_margem: "Margem em queda",
  curva_abc: "Curva ABC",
  dado_faltando: "Dado faltando",
  saude_conta: "Saúde da conta",
  resumo_diario: "Resumo do dia",
};

/**
 * O painel do Gestor — o "cérebro": junta o que os outros agentes
 * descobriram e o resultado do negócio. Três abas:
 * - Resumo: o Top 3 do dia em R$, o resumo diário/semanal com
 *   comparativos e a prévia da mensagem do WhatsApp;
 * - Avisos: as cinco frentes (margem, curva ABC, dado faltando, saúde da
 *   conta e o resumo do dia) — aqui é "marcar como visto", não aprovar;
 * - Conversar: o chat, que sabe de tudo isso.
 */
export function PainelAnalista({
  insights,
  carregando,
  aoDispensar,
  perfilId,
  top3,
  comparativos,
  aoAbrirAgente,
}: {
  insights: InsightAnalista[];
  carregando: boolean;
  aoDispensar: (i: InsightAnalista) => void;
  perfilId: string | null;
  /** As 3 decisões pendentes que valem mais dinheiro, uma por agente */
  top3: ItemTop[];
  comparativos: Comparativos;
  /** Leva pra aba do agente */
  aoAbrirAgente: (agente: AgenteTop) => void;
}) {
  const pendentes = insights.filter((i) => i.status === "pendente");
  const [visao, setVisao] = useState<"resumo" | "feed" | "conversa">("resumo");

  return (
    <Painel
      titulo="Gestor"
      descricao="Junta o que os outros agentes descobriram e mostra o que fazer primeiro"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Bot className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{NOME_GESTOR}</p>
          <p className="text-[10px] text-muted-foreground">
            Lê os números do negócio e o que cada agente encontrou, e diz por onde começar
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b px-4 pt-3">
        {(
          [
            ["resumo", "Resumo", ""],
            ["feed", "Avisos", `(${pendentes.length})`],
            ["conversa", "Conversar", ""],
          ] as const
        ).map(([id, rotulo, sufixo]) => (
          <button
            key={id}
            onClick={() => setVisao(id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
              visao === id
                ? "border-b-2 border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {id === "conversa" && <MessageSquareText className="size-3.5" />}
            {rotulo} {sufixo}
          </button>
        ))}
      </div>

      {visao === "resumo" && (
        <AbaResumo top3={top3} comparativos={comparativos} aoAbrirAgente={aoAbrirAgente} />
      )}

      {visao === "feed" && (
        <div className="divide-y">
          {carregando && (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Analisando seus números...
            </div>
          )}

          {!carregando &&
            pendentes.map((i) => (
              <CardInsight key={i.id} insight={i} aoDispensar={aoDispensar} />
            ))}

          {!carregando && pendentes.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-muted-foreground">
                Nada fora do esperado agora. Quando algo merecer atenção, aparece aqui.
              </p>
            </div>
          )}
        </div>
      )}

      {visao === "conversa" && (
        <ChatAnalista
          insights={insights}
          perfilId={perfilId}
          top3={top3}
          comparativos={comparativos}
        />
      )}
    </Painel>
  );
}

/* ------------------------------------------------------------------ */
/* Aba Resumo: Top 3 + resumo + WhatsApp                               */
/* ------------------------------------------------------------------ */

const COR_PONTO = {
  verde: "bg-profit",
  amarelo: "bg-warning",
  vermelho: "bg-loss",
} as const;

function AbaResumo({
  top3,
  comparativos,
  aoAbrirAgente,
}: {
  top3: ItemTop[];
  comparativos: Comparativos;
  aoAbrirAgente: (agente: AgenteTop) => void;
}) {
  const [tipo, setTipo] = useState<"diario" | "semanal">("diario");
  const [verWhats, setVerWhats] = useState(false);
  const blocos = tipo === "diario" ? [comparativos.dia] : [comparativos.semana, comparativos.mes];
  const mensagem = montarMensagemWhatsApp({ tipo, comparativos, top3 });

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(mensagem);
      toast.success("Mensagem copiada. É só colar no WhatsApp.");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto e copie com Ctrl+C.");
    }
  };

  return (
    <div className="divide-y">
      {/* Top 3 */}
      <div className="space-y-3 px-4 py-4">
        <div>
          <p className="text-xs font-semibold">O que fazer primeiro</p>
          <p className="text-[10px] text-muted-foreground">
            As decisões pendentes que valem mais dinheiro agora — no máximo uma por agente
          </p>
        </div>
        {top3.length === 0 && (
          <p className="rounded-md bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhuma decisão com dinheiro em jogo agora.
          </p>
        )}
        {top3.map((t, i) => (
          <div key={`${t.agente}-${i}`} className="flex gap-3 rounded-lg border px-3 py-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("size-2 rounded-full", COR_PONTO[t.semaforo])} />
                <span className="text-xs font-semibold">{t.titulo}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {t.nomeAgente}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">{t.explicacao}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="num text-sm font-bold">{formatBRL(t.valor)}</span>
                <span className="text-[10px] text-muted-foreground">{t.rotuloValor}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto h-7 text-[11px]"
                  onClick={() => aoAbrirAgente(t.agente)}
                >
                  Abrir no {t.nomeAgente}
                  <ArrowRight className="size-3" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Resumo diário / semanal */}
      <div className="space-y-3 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold">Resumo</p>
          <div className="ml-auto flex gap-1 rounded-md bg-muted p-0.5">
            {(
              [
                ["diario", "Diário"],
                ["semanal", "Semanal"],
              ] as const
            ).map(([id, rotulo]) => (
              <button
                key={id}
                onClick={() => setTipo(id)}
                className={cn(
                  "rounded px-2.5 py-1 text-[11px] font-semibold",
                  tipo === id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>

        {blocos.map((c) => (
          <BlocoComparativo key={c.rotulo} c={c} />
        ))}
      </div>

      {/* WhatsApp */}
      <div className="space-y-2 px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-semibold">
            Prévia do WhatsApp ({tipo === "diario" ? "diário" : "semanal"})
          </p>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => setVerWhats((v) => !v)}>
              {verWhats ? "Esconder" : "Ver mensagem"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={copiar}>
              <Copy className="size-3" />
              Copiar
            </Button>
          </div>
        </div>
        {verWhats && (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-muted/50 px-3 py-2.5 font-mono text-[11px] leading-relaxed">
            {mensagem}
          </pre>
        )}
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          Por enquanto é só prévia pra copiar. O envio automático pelo WhatsApp (todo dia e toda
          semana) entra depois do CNPJ, quando der pra conectar a API do WhatsApp.
        </p>
      </div>
    </div>
  );
}

function BlocoComparativo({ c }: { c: Comparativo }) {
  const linhas: { rotulo: string; atual: string; anterior: string; v: number | null; pp?: number }[] = [
    {
      rotulo: "Faturamento",
      atual: formatBRL(c.atual.faturamento),
      anterior: formatBRL(c.anterior.faturamento),
      v: variacao(c.atual.faturamento, c.anterior.faturamento),
    },
    {
      rotulo: "Lucro",
      atual: formatBRL(c.atual.lucro),
      anterior: formatBRL(c.anterior.lucro),
      v: variacao(c.atual.lucro, c.anterior.lucro),
    },
    {
      rotulo: "Margem",
      atual: formatPercentual(c.atual.margem),
      anterior: formatPercentual(c.anterior.margem),
      v: null,
      pp: (c.atual.margem - c.anterior.margem) * 100,
    },
    {
      rotulo: "Pedidos",
      atual: formatNumero(c.atual.pedidos),
      anterior: formatNumero(c.anterior.pedidos),
      v: variacao(c.atual.pedidos, c.anterior.pedidos),
    },
  ];

  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-baseline gap-2 border-b px-3 py-2">
        <span className="text-xs font-semibold">{c.rotulo}</span>
        <span className="text-[10px] text-muted-foreground">comparado com {c.rotuloAnterior}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-1.5 text-left font-medium"></th>
              <th className="px-3 py-1.5 text-right font-medium">Agora</th>
              <th className="px-3 py-1.5 text-right font-medium">Antes</th>
              <th className="px-3 py-1.5 text-right font-medium">Variação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const valorVar = l.pp !== undefined ? l.pp : l.v;
              const positivo = valorVar !== null && valorVar > 0;
              const negativo = valorVar !== null && valorVar < 0;
              return (
                <tr key={l.rotulo} className="border-t">
                  <td className="px-3 py-1.5 text-muted-foreground">{l.rotulo}</td>
                  <td className="num px-3 py-1.5 text-right font-semibold">{l.atual}</td>
                  <td className="num px-3 py-1.5 text-right text-muted-foreground">{l.anterior}</td>
                  <td
                    className={cn(
                      "num px-3 py-1.5 text-right font-semibold",
                      positivo && "text-profit",
                      negativo && "text-loss",
                    )}
                  >
                    {l.pp !== undefined
                      ? `${l.pp >= 0 ? "+" : "−"}${Math.abs(l.pp).toFixed(1).replace(".", ",")} pp`
                      : l.v === null
                        ? "—"
                        : `${l.v > 0 ? "▲" : l.v < 0 ? "▼" : ""} ${formatPercentual(Math.abs(l.v), 0)}`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="space-y-1 border-t px-3 py-2">
        {frasesComparativo(c).map((f) => (
          <p key={f} className="text-[11px] leading-relaxed">
            {f}
          </p>
        ))}
      </div>
    </div>
  );
}

/** Junta um retrato do negócio inteiro — vendas, custos, promoções,
 * recuperação, estoque, fulfillment, contas — com o que cada um dos
 * outros agentes já descobriu. É esse texto que vira o "conhecimento"
 * do Gestor a cada mensagem. */
async function montarContextoGestor(
  perfilId: string,
  top3: ItemTop[],
  comparativos: Comparativos,
): Promise<string> {
  const pedidos = vendasService.listar();
  const resumo30dias = resumir(pedidos);
  // Faltava o await aqui — era isso que fazia o chat dizer
  // "undefined produtos cadastrados".
  const produtos = await produtosService.listar(perfilId);
  const campanhas = campanhasService.listar();
  const oportunidades = recuperacaoService.listar();
  const estoque = estoqueService.resumo();
  const fulfillment = fulfillmentService.resumo();
  const contas = contasService.ativas();
  const resumoPendentes = await eventosAgenteService.listarResumoPendentes(perfilId);

  const linhasPendentes = resumoPendentes
    .map((r) => {
      const exemplos = r.exemplos.map((e) => `  · ${e}`).join("\n");
      return `${r.agenteId}: ${r.total} pendente(s).\n${exemplos}`;
    })
    .join("\n\n");

  const linhasTop =
    top3.length > 0
      ? top3
          .map(
            (t, i) =>
              `${i + 1}. [${t.nomeAgente}] ${t.titulo} — ${formatBRL(t.valor)} ${t.rotuloValor}. ${t.explicacao}`,
          )
          .join("\n")
      : "Nenhuma decisão com dinheiro em jogo agora.";
  const linhasComparativos = [comparativos.dia, comparativos.semana, comparativos.mes]
    .map((c) => `${c.rotulo} (comparado com ${c.rotuloAnterior}): ${frasesComparativo(c).join(" ")}`)
    .join("\n");

  return `=== O QUE FAZER PRIMEIRO (Top 3 do dia, ordenado por dinheiro em jogo) ===
${linhasTop}

=== RESULTADO E COMPARATIVOS ===
${linhasComparativos}

=== VISÃO GERAL (todos os pedidos no sistema) ===
Faturamento: ${resumo30dias.faturamento.toFixed(2)} | Lucro líquido: ${resumo30dias.lucroLiquido.toFixed(2)} | Margem: ${(resumo30dias.margem * 100).toFixed(1)}% | Pedidos: ${resumo30dias.pedidos}

=== CUSTOS ===
${produtos.length} produtos cadastrados no catálogo de custos.

=== PROMOÇÕES ===
${campanhas.length} campanha(s) de desconto no sistema.

=== RECUPERAÇÃO DE VENDAS ===
${oportunidades.length} oportunidade(s) em aberto.

=== ESTOQUE ===
Capital investido: ${estoque.capitalInvestido.toFixed(2)} | SKUs em risco de ruptura: ${estoque.skusRuptura} | Unidades paradas: ${estoque.unidadesParadas}

=== FULFILLMENT ===
Capital investido: ${fulfillment.capitalInvestido.toFixed(2)} | SKUs em risco de ruptura: ${fulfillment.skusRuptura} | Unidades paradas: ${fulfillment.unidadesParadas}

=== CONTAS DE MARKETPLACE ===
${contas.length} conta(s) ativa(s).

=== O QUE OS OUTROS AGENTES JÁ DESCOBRIRAM (pendente da sua decisão) ===
${linhasPendentes || "Nenhum agente com pendência agora."}`;
}

/**
 * A conversa de verdade com o Gestor — o Analista fundido com a visão
 * de tudo. Guarda histórico só do dia (busca "hoje" sempre, então
 * amanhã já começa limpo sozinho). O contexto (negócio inteiro + o que
 * os outros agentes descobriram) é remontado a cada mensagem, sempre
 * fresco.
 */
function ChatAnalista({
  insights,
  perfilId,
  top3,
  comparativos,
}: {
  insights: InsightAnalista[];
  perfilId: string | null;
  top3: ItemTop[];
  comparativos: Comparativos;
}) {
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);

  useEffect(() => {
    if (!perfilId) {
      setCarregandoHistorico(false);
      return;
    }
    chatGestorService.carregarHistoricoDoDia(perfilId).then((historico) => {
      setMensagens(historico);
      setCarregandoHistorico(false);
    });
  }, [perfilId]);

  const enviar = async () => {
    const conteudo = texto.trim();
    if (!conteudo || enviando || !perfilId) return;

    const mensagemUser: MensagemChat = { papel: "user", conteudo };
    const historico = [...mensagens, mensagemUser];
    setMensagens(historico);
    setTexto("");
    setEnviando(true);

    const erroSalvarUser = await chatGestorService.salvarMensagem(perfilId, mensagemUser);
    if (erroSalvarUser) {
      console.error("Não consegui salvar a mensagem do usuário:", erroSalvarUser);
      toast.error(`Não consegui salvar sua mensagem: ${erroSalvarUser}`);
    }
    const contexto = await montarContextoGestor(perfilId, top3, comparativos);
    const { resposta, erro } = await chatGestorService.conversar(historico, contexto);
    setEnviando(false);

    if (erro) {
      toast.error(`Não consegui responder: ${erro}`);
      return;
    }
    if (resposta) {
      const mensagemAssistente: MensagemChat = { papel: "assistente", conteudo: resposta };
      setMensagens((atual) => [...atual, mensagemAssistente]);
      const erroSalvarAssistente = await chatGestorService.salvarMensagem(
        perfilId,
        mensagemAssistente,
      );
      if (erroSalvarAssistente) {
        console.error("Não consegui salvar a resposta do agente:", erroSalvarAssistente);
        toast.error(`Não consegui salvar a resposta: ${erroSalvarAssistente}`);
      }
    }
  };

  return (
    <div className="flex h-[480px] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {carregandoHistorico && (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Carregando conversa de hoje...
          </div>
        )}

        {!carregandoHistorico && mensagens.length === 0 && (
          <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Pergunte qualquer coisa sobre o negócio — "por que o lucro caiu essa semana?", "o
            que faço primeiro hoje?", o que os outros agentes encontraram. A conversa fica salva
            só por hoje.
          </div>
        )}

        {!carregandoHistorico &&
          mensagens.map((m, i) => (
            <div
              key={i}
              className={cn("flex", m.papel === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-3 py-2 text-xs leading-relaxed",
                  m.papel === "user" ? "bg-brand text-white" : "bg-muted text-foreground",
                )}
              >
                {m.conteudo}
              </div>
            </div>
          ))}

        {enviando && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-muted px-3 py-2">
              <Loader2 className="size-3.5 animate-spin" />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-t px-4 py-3">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              enviar();
            }
          }}
          placeholder="Pergunta pro Gestor..."
          disabled={enviando}
          className="flex-1 rounded-md border bg-background px-3 py-2 text-xs"
        />
        <Button size="sm" onClick={enviar} disabled={enviando || !texto.trim()}>
          <Send className="size-3.5" />
          Enviar
        </Button>
      </div>
    </div>
  );
}

function CardInsight({
  insight,
  aoDispensar,
}: {
  insight: InsightAnalista;
  aoDispensar: (i: InsightAnalista) => void;
}) {
  const Icone = ICONE_INSIGHT[insight.tipo];
  const sem = ESTILO_SEMAFORO[insight.semaforo];
  const d = insight.dados;

  return (
    <div className="px-4 py-4">
      <div className="flex gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            insight.semaforo === "vermelho"
              ? "bg-loss-soft text-loss"
              : insight.semaforo === "amarelo"
                ? "bg-warning-soft text-warning"
                : "bg-profit-soft text-profit",
          )}
        >
          <Icone className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">{TITULO_INSIGHT[insight.tipo]}</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="size-3" />
              {new Date(insight.data).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {insight.motivo}
          </p>

          {/* Resumo diário ganha três números em destaque — os outros
              tipos já contam tudo que precisam no `motivo`. */}
          {insight.tipo === "resumo_diario" && (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  Faturamento hoje
                </p>
                <p className="num text-sm font-semibold">
                  {formatBRL(d.faturamento as number)}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  Margem
                </p>
                <p className={cn("num text-sm font-semibold", sem.texto)}>
                  {formatPercentual(d.margem as number)}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  Pedidos
                </p>
                <p className="num text-sm font-semibold">{formatNumero(d.pedidos as number)}</p>
              </div>
            </div>
          )}

          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => aoDispensar(insight)}>
              <Check className="size-3.5" />
              Marcar como visto
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
