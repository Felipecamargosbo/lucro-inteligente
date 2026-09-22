// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useState } from "react";
import {
  Check,
  Clock,
  Loader2,
  MessageCircle,
  Sparkles,
  X,
} from "lucide-react";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { StatusSugestao, TicketSac } from "@/types";
import type { Aba } from "./comum";

const NOME_SAC = "Agente de SAC";

/**
 * O painel de SAC: uma pergunta de cliente por card. Diferente dos
 * outros dois agentes, tem um passo intermediário — "Gerar resposta" —
 * porque é o único ponto do sistema que gasta token de verdade, então
 * fica sempre atrás de um clique explícito, nunca automático.
 */
export function PainelSac({
  tickets,
  carregando,
  gerandoId,
  rascunhos,
  aoMudarRascunho,
  aoGerar,
  aoDecidir,
}: {
  tickets: TicketSac[];
  carregando: boolean;
  gerandoId: string | null;
  rascunhos: Record<string, string>;
  aoMudarRascunho: (id: string, texto: string) => void;
  aoGerar: (t: TicketSac) => void;
  aoDecidir: (t: TicketSac, status: Extract<StatusSugestao, "aprovada" | "recusada">) => void;
}) {
  const [aba, setAba] = useState<Aba>("operacao");
  const pendentes = tickets.filter((t) => t.status === "pendente");
  const decididos = tickets.filter((t) => t.status !== "pendente");
  const lista = aba === "operacao" ? pendentes : decididos;

  return (
    <Painel
      titulo="SAC"
      descricao="Perguntas de cliente esperando resposta — a IA sugere, você decide"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <MessageCircle className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{NOME_SAC}</p>
          <p className="text-[10px] text-muted-foreground">
            Sugere a resposta; enviar ainda é manual até a API de mensagens conectar
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b px-4 pt-3">
        {(
          [
            ["operacao", `Operação (${pendentes.length})`],
            ["historico", `Histórico (${decididos.length})`],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
              aba === id
                ? "border-b-2 border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="divide-y">
        {carregando && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Carregando perguntas...
          </div>
        )}

        {!carregando &&
          lista.map((t) => (
            <CardTicketSac
              key={t.id}
              ticket={t}
              gerando={gerandoId === t.id}
              rascunho={rascunhos[t.id] ?? t.resposta ?? ""}
              aoMudarRascunho={(texto) => aoMudarRascunho(t.id, texto)}
              aoGerar={() => aoGerar(t)}
              aoDecidir={(status) => aoDecidir(t, status)}
            />
          ))}

        {!carregando && lista.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-muted-foreground">
              {aba === "operacao"
                ? "Nenhuma pergunta pendente agora."
                : "Nenhuma decisão registrada ainda."}
            </p>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        A pergunta do cliente ainda é de exemplo — não há API de mensagens conectada. A
        resposta, essa é gerada de verdade por IA quando você pede.
      </div>
    </Painel>
  );
}

function CardTicketSac({
  ticket,
  gerando,
  rascunho,
  aoMudarRascunho,
  aoGerar,
  aoDecidir,
}: {
  ticket: TicketSac;
  gerando: boolean;
  rascunho: string;
  aoMudarRascunho: (texto: string) => void;
  aoGerar: () => void;
  aoDecidir: (status: Extract<StatusSugestao, "aprovada" | "recusada">) => void;
}) {
  const temResposta = ticket.resposta !== null;
  const decidido = ticket.status !== "pendente";

  return (
    <div className="px-4 py-4">
      <div className="flex gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <MessageCircle className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeloMarketplace id={ticket.marketplaceId} />
            <span className="truncate text-xs font-medium">{ticket.produto}</span>
            <span className="num text-[10px] text-muted-foreground">{ticket.sku}</span>
            {decidido && (
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-semibold",
                  ticket.status === "aprovada"
                    ? "bg-profit-soft text-profit"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {ticket.status === "aprovada" ? "aprovada" : "descartada"}
              </span>
            )}
            {decidido && ticket.decididoEm && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="size-3" />
                {new Date(ticket.decididoEm).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
              Pergunta do cliente
            </p>
            <p className="mt-0.5 text-xs">{ticket.pergunta}</p>
          </div>

          {decidido ? (
            // Histórico: só leitura — o que foi decidido já foi decidido.
            ticket.resposta && (
              <div className="mt-2 rounded-lg bg-muted/30 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  {ticket.status === "aprovada" ? "Resposta enviada" : "Resposta descartada"}
                </p>
                <p className="mt-0.5 text-xs">{ticket.resposta}</p>
              </div>
            )
          ) : !temResposta ? (
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={aoGerar} disabled={gerando}>
                {gerando ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {gerando ? "Gerando..." : "Gerar resposta com IA"}
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Resposta sugerida — pode editar antes de aprovar
              </p>
              <Textarea
                value={rascunho}
                onChange={(e) => aoMudarRascunho(e.target.value)}
                className="min-h-20 text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => aoDecidir("aprovada")}>
                  <Check className="size-3.5" />
                  Aprovar
                </Button>
                <Button size="sm" variant="outline" onClick={() => aoDecidir("recusada")}>
                  <X className="size-3.5" />
                  Descartar
                </Button>
                <Button size="sm" variant="ghost" onClick={aoGerar} disabled={gerando}>
                  {gerando ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Gerar de novo
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
