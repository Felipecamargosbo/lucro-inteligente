import { AlertTriangle, CheckCircle2, ShieldQuestion } from "lucide-react";
import { formatPercentual } from "@/lib/format";
import { Painel } from "@/components/comum/Indicadores";
import { cn } from "@/lib/utils";
import type { ContaMarketplace, NivelReputacao } from "@/types";

const NIVEIS: Record<NivelReputacao, { rotulo: string; texto: string; fundo: string }> = {
  excelente: { rotulo: "Excelente", texto: "text-profit", fundo: "bg-profit-soft" },
  bom: { rotulo: "Bom", texto: "text-profit", fundo: "bg-profit-soft" },
  regular: { rotulo: "Regular", texto: "text-foreground", fundo: "bg-warning-soft" },
  "em-risco": { rotulo: "Em risco", texto: "text-loss", fundo: "bg-loss-soft" },
  "sem-dados": { rotulo: "Sem dados", texto: "text-muted-foreground", fundo: "bg-muted" },
};

/**
 * Termômetro de um indicador contra o limite do canal.
 * O que importa não é o número absoluto: é a distância até o limite.
 */
function Termometro({
  rotulo,
  valor,
  limite,
  explicacao,
}: {
  rotulo: string;
  valor: number;
  limite: number | null;
  explicacao: string;
}) {
  // Escala até 1,5x o limite, para o excesso ficar visível
  const escala = limite ? limite * 1.5 : Math.max(valor * 1.5, 0.01);
  const posicao = Math.min((valor / escala) * 100, 100);
  const posicaoLimite = limite ? Math.min((limite / escala) * 100, 100) : null;

  const estourou = limite !== null && valor > limite;
  const perto = limite !== null && !estourou && valor > limite * 0.8;

  const cor = estourou ? "bg-loss" : perto ? "bg-warning" : "bg-profit";

  return (
    <div className="rounded-xl border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-medium">{rotulo}</p>
        <p
          className={cn(
            "num text-sm font-bold",
            estourou ? "text-loss" : perto ? "text-foreground" : "text-profit",
          )}
        >
          {formatPercentual(valor, 2)}
        </p>
      </div>

      <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", cor)} style={{ width: `${posicao}%` }} />
        {posicaoLimite !== null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-foreground/70"
            style={{ left: `${posicaoLimite}%` }}
            title={`Limite do canal: ${formatPercentual(limite!, 2)}`}
          />
        )}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        {limite !== null ? (
          <>
            Limite do canal: <strong>{formatPercentual(limite, 2)}</strong>.{" "}
            {estourou
              ? "Você está acima — a conta já está sendo penalizada."
              : perto
                ? "Você está perto do limite."
                : "Dentro do aceitável."}
          </>
        ) : (
          explicacao
        )}
      </p>
    </div>
  );
}

export function ReputacaoCanal({ conta }: { conta: ContaMarketplace }) {
  const r = conta.reputacao;

  if (!r) {
    return (
      <Painel
        titulo="Reputação da conta"
        descricao="Saúde operacional neste canal"
      >
        <div className="flex flex-col items-center px-5 py-12 text-center">
          <ShieldQuestion className="size-8 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Sem dados de reputação</p>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            Este canal ainda não enviou indicadores de reputação — normalmente porque a conexão
            não está ativa ou porque a conta é nova. Sem esses dados, não é possível avisar sobre
            risco de perda de medalha.
          </p>
        </div>
      </Painel>
    );
  }

  const nivel = NIVEIS[r.nivel];

  return (
    <div className="space-y-5">
      {/* Situação geral */}
      <div className={cn("rounded-xl p-5", nivel.fundo)}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {r.alerta ? (
            <AlertTriangle className={cn("size-5 shrink-0", nivel.texto)} />
          ) : (
            <CheckCircle2 className={cn("size-5 shrink-0", nivel.texto)} />
          )}
          <div className="min-w-0">
            <p className={cn("text-sm font-bold", nivel.texto)}>
              {r.rotuloCanal ?? `Reputação ${nivel.rotulo.toLowerCase()}`}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {r.alerta ??
                "Nenhum indicador próximo do limite. A conta não está em risco no momento."}
            </p>
          </div>
        </div>
      </div>

      <Painel
        titulo="Indicadores da conta"
        descricao="Cada indicador comparado com o limite deste canal"
      >
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <Termometro
            rotulo="Taxa de atraso"
            valor={r.taxaAtraso}
            limite={r.limiteAtraso}
            explicacao="Pedidos despachados fora do prazo."
          />
          <Termometro
            rotulo="Taxa de cancelamento"
            valor={r.taxaCancelamento}
            limite={r.limiteCancelamento}
            explicacao="Cancelamentos por sua responsabilidade."
          />
          <Termometro
            rotulo="Taxa de reclamação"
            valor={r.taxaReclamacao}
            limite={null}
            explicacao="Reclamações abertas sobre seus pedidos."
          />
        </div>

        <div className="border-t px-5 py-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Reputação não aparece na conta bancária, mas mexe direto na margem: perder medalha
            derruba exposição, encarece a mídia necessária para vender o mesmo volume e pode tirar
            o frete grátis subsidiado — que é justamente uma das linhas do Raio-X.
          </p>
        </div>
      </Painel>
    </div>
  );
}
