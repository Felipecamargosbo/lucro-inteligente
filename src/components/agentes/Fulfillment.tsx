// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useState } from "react";
import {
  Check,
  Clock,
  Loader2,
  Warehouse,
} from "lucide-react";
import { formatNumero } from "@/lib/format";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AlertaEstoque } from "@/types";
import type { Aba } from "./comum";

export function PainelFulfillment({
  alertas,
  carregando,
  aoDispensar,
}: {
  alertas: AlertaEstoque[];
  carregando: boolean;
  aoDispensar: (a: AlertaEstoque) => void;
}) {
  const [aba, setAba] = useState<Aba>("operacao");
  const pendentes = alertas.filter((a) => a.status === "pendente");
  const decididos = alertas.filter((a) => a.status !== "pendente");
  const lista = aba === "operacao" ? pendentes : decididos;

  return (
    <Painel
      titulo="Fulfillment"
      descricao="Projeção de ruptura no estoque alocado nos centros de distribuição do marketplace"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Warehouse className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Agente de Fulfillment</p>
          <p className="text-[10px] text-muted-foreground">
            Avisa antes de faltar — não edita nem envia quantidade pra lugar nenhum
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
            Verificando ritmo de venda...
          </div>
        )}

        {!carregando &&
          lista.map((a) => (
            <CardAlertaFulfillment key={a.id} alerta={a} aoDispensar={() => aoDispensar(a)} />
          ))}

        {!carregando && lista.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-muted-foreground">
              {aba === "operacao"
                ? "Nenhum produto perto de esgotar no ritmo atual de venda."
                : "Nenhum alerta visto ainda."}
            </p>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        A quantidade alocada no Full ainda é de exemplo — quando a API do marketplace
        conectar, esse número passa a ser real, sem mudar nada nesta tela.
      </div>
    </Painel>
  );
}

function CardAlertaFulfillment({
  alerta,
  aoDispensar,
}: {
  alerta: AlertaEstoque;
  aoDispensar: () => void;
}) {
  const urgente = alerta.diasRestantes <= 3;

  return (
    <div className="px-4 py-4">
      <div className="flex gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            urgente ? "bg-loss-soft text-loss" : "bg-warning-soft text-warning",
          )}
        >
          <Warehouse className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeloMarketplace id={alerta.marketplaceId} />
            <span className="truncate text-xs font-medium">{alerta.produto}</span>
            <span className="num text-[10px] text-muted-foreground">{alerta.sku}</span>
            {alerta.status !== "pendente" && (
              <>
                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  visto
                </span>
                {alerta.decididoEm && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="size-3" />
                    {new Date(alerta.decididoEm).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </>
            )}
          </div>

          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Vendeu <strong className="text-foreground">{formatNumero(alerta.vendidoUltimos7Dias)} un.</strong> nos
            últimos 7 dias (média de {alerta.mediaDiaria.toFixed(1)}/dia). No ritmo atual, o
            estoque no Full acaba em{" "}
            <strong className={cn(urgente ? "text-loss" : "text-warning")}>
              {alerta.diasRestantes} dia{alerta.diasRestantes !== 1 ? "s" : ""}
            </strong>
            .
          </p>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Estoque no Full
              </p>
              <p className="num text-sm font-semibold">{formatNumero(alerta.estoqueAtual)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Repor pra {alerta.diasAlvoCobertura} dias
              </p>
              <p className="num text-sm font-bold text-profit">
                +{formatNumero(alerta.quantidadeSugerida)}
              </p>
            </div>
          </div>

          {alerta.status === "pendente" && (
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={aoDispensar}>
                <Check className="size-3.5" />
                Marcar como visto
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
