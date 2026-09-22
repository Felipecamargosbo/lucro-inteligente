// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useState } from "react";
import {
  Bot,
  Check,
  Clock,
  Loader2,
  TrendingDown,
  X,
} from "lucide-react";
import { contasService } from "@/services";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { DEGRAU_DESCONTO_PADRAO, DIAS_PARADO_PADRAO } from "@/lib/finance";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EventoAgente, StatusSugestao } from "@/types";
import { ESTILO_SEMAFORO } from "./comum";
import type { Aba } from "./comum";

const NOME_AGENTE = "Agente de Precificação";

/**
 * O painel de Precificação: sugestões de corte de preço para produto
 * parado, cada uma com o motivo, o antes e o depois.
 */
export function PainelPrecificacao({
  pendentes,
  decididos,
  aprovadas,
  carregando,
  aoDecidir,
}: {
  pendentes: EventoAgente[];
  decididos: EventoAgente[];
  aprovadas: number;
  carregando: boolean;
  aoDecidir: (evento: EventoAgente, status: StatusSugestao) => void;
}) {
  const [aba, setAba] = useState<Aba>("operacao");
  const lista = aba === "operacao" ? pendentes : decididos;

  return (
    <Painel
      titulo="Agentes"
      descricao="Cada decisão vem com o motivo, o antes e o depois. Nada é aplicado sem você aprovar"
    >
    {/* Indicadores */}
    <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
      <div className="rounded-lg bg-muted px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Esperando sua aprovação
        </p>
        <p
          className={cn(
            "num text-lg font-bold",
            pendentes.length > 0 && "text-warning",
          )}
        >
          {formatNumero(pendentes.length)}
        </p>
      </div>
      <div className="rounded-lg bg-muted px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Aprovadas nesta sessão
        </p>
        <p className="num text-lg font-bold text-profit">{formatNumero(aprovadas)}</p>
      </div>
      <div className="rounded-lg bg-muted px-3 py-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Regra ativa
        </p>
        <p className="text-xs font-semibold leading-tight">
          Parado há {DIAS_PARADO_PADRAO}+ dias → corta{" "}
          {formatPercentual(DEGRAU_DESCONTO_PADRAO, 0)}
        </p>
      </div>
    </div>

    {/* Quem está trabalhando */}
    <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
        <Bot className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold">{NOME_AGENTE}</p>
        <p className="text-[10px] text-muted-foreground">
          Procura produto encalhado e propõe corte sem furar a sua margem mínima
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

    {/* Feed */}
    <div className="divide-y">
      {carregando && (
        <div className="flex items-center justify-center gap-2 px-4 py-14 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Verificando seus produtos...
        </div>
      )}

      {!carregando && lista.map((e) => (
        <CardDecisao key={e.id} evento={e} aoDecidir={aoDecidir} />
      ))}

      {!carregando && lista.length === 0 && (
        <div className="px-4 py-14 text-center">
          <p className="text-xs text-muted-foreground">
            {aba === "operacao"
              ? "Nada parado além do limite. O agente não tem o que propor agora."
              : "Nenhuma decisão registrada ainda."}
          </p>
        </div>
      )}
    </div>

    <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
      Sem API conectada, o agente sugere mas não executa: depois de aprovar, o preço
      precisa ser alterado no marketplace. A margem mínima de cada canal vem das metas
      em Configurações.
    </div>
  </Painel>
  );
}

function CardDecisao({
  evento,
  aoDecidir,
}: {
  evento: EventoAgente;
  aoDecidir: (e: EventoAgente, status: StatusSugestao) => void;
}) {
  const conta = contasService.buscar(evento.contaId);
  const sem = ESTILO_SEMAFORO[evento.semaforo];
  const queda = evento.precoAtual - evento.precoSugerido;
  const pendente = evento.status === "pendente";

  return (
    <div className={cn("px-4 py-4", !pendente && "opacity-70")}>
      <div className="flex gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Bot className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          {/* Assinatura */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">{NOME_AGENTE}</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="size-3" />
              {new Date(evento.data).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {evento.status === "aprovada" && (
              <span className="rounded bg-profit-soft px-2 py-0.5 text-[10px] font-semibold text-profit">
                aprovada
              </span>
            )}
            {evento.status === "recusada" && (
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                recusada
              </span>
            )}
          </div>

          {/* Produto */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <SeloMarketplace id={evento.marketplaceId} />
            <span className="truncate text-xs font-medium">{evento.produto}</span>
            <span className="num text-[10px] text-muted-foreground">
              {evento.sku} · {conta?.nome ?? "—"}
            </span>
          </div>

          {/* Motivo */}
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {evento.motivo}
          </p>

          {/* Antes → depois */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Preço hoje
              </p>
              <p className="num text-sm font-semibold">{formatBRL(evento.precoAtual)}</p>
              <p className="num text-[10px] text-muted-foreground">
                margem {formatPercentual(evento.margemAtual)}
              </p>
            </div>

            <TrendingDown className="size-4 shrink-0 text-muted-foreground" />

            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Sugerido
              </p>
              <p className={cn("num text-sm font-bold", sem.texto)}>
                {formatBRL(evento.precoSugerido)}
              </p>
              <p className="num text-[10px] text-muted-foreground">
                margem {formatPercentual(evento.margemSugerida)}
              </p>
            </div>

            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Queda
              </p>
              <p className="num text-sm font-semibold">−{formatBRL(queda)}</p>
            </div>

            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Piso deste canal
              </p>
              <p className="num text-sm font-semibold">{formatBRL(evento.precoMinimo)}</p>
            </div>

            <span
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold",
                sem.texto,
              )}
            >
              <span className={cn("size-1.5 rounded-full", sem.ponto)} />
              {sem.rotulo}
            </span>
          </div>

          {evento.travadoNoPiso && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Travado no piso: o corte cheio passaria da sua margem mínima.
            </p>
          )}

          {/* Ações */}
          {pendente && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => aoDecidir(evento, "aprovada")}>
                <Check className="size-3.5" />
                Aprovar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => aoDecidir(evento, "recusada")}
              >
                <X className="size-3.5" />
                Recusar
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
