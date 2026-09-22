// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Check,
  Clock,
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
import { Painel } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { InsightAnalista, TipoInsightAnalista } from "@/types";
import { ESTILO_SEMAFORO } from "./comum";

const NOME_ANALISTA = "Agente Analista";

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
 * O painel do Analista: cinco frentes, um card por aviso ativo. Diferente
 * do Precificação, aqui não tem aprovar/recusar — é "marcar como visto",
 * porque não é uma decisão de preço, é uma observação.
 */
export function PainelAnalista({
  insights,
  carregando,
  aoDispensar,
  perfilId,
}: {
  insights: InsightAnalista[];
  carregando: boolean;
  aoDispensar: (i: InsightAnalista) => void;
  perfilId: string | null;
}) {
  const pendentes = insights.filter((i) => i.status === "pendente");
  const [visao, setVisao] = useState<"feed" | "conversa">("feed");

  return (
    <Painel
      titulo="Analista"
      descricao="Cinco frentes, sempre olhando: margem, curva ABC, dado faltando, saúde da conta e o resumo do dia"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Bot className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{NOME_ANALISTA}</p>
          <p className="text-[10px] text-muted-foreground">
            Lê os números do negócio e avisa o que merece atenção
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      <div className="flex gap-1 border-b px-4 pt-3">
        {(
          [
            ["feed", "Feed", `(${pendentes.length})`],
            ["conversa", "Conversar", ""],
          ] as const
        ).map(([id, rotulo, sufixo]) => (
          <button
            key={id}
            onClick={() => setVisao(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
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

      {visao === "feed" ? (
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
      ) : (
        <ChatAnalista insights={insights} perfilId={perfilId} />
      )}
    </Painel>
  );
}

/** Junta um retrato do negócio inteiro — vendas, custos, promoções,
 * recuperação, estoque, fulfillment, contas — com o que cada um dos
 * outros agentes já descobriu. É esse texto que vira o "conhecimento"
 * do Gestor a cada mensagem. */
async function montarContextoGestor(perfilId: string): Promise<string> {
  const pedidos = vendasService.listar();
  const resumo30dias = resumir(pedidos);
  const produtos = produtosService.listar(perfilId);
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

  return `=== VISÃO GERAL (todos os pedidos no sistema) ===
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
}: {
  insights: InsightAnalista[];
  perfilId: string | null;
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
    const contexto = await montarContextoGestor(perfilId);
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
            Pergunta qualquer coisa sobre o negócio — vendas, estoque, fulfillment, o que os
            outros agentes encontraram. A conversa fica salva só por hoje.
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
