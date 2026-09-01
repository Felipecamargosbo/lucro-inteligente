import { useState } from "react";
import { Check, Pencil, Target } from "lucide-react";
import { formatBRL, formatPercentual } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function MetaFaturamento({
  meta,
  realizado,
  onSalvarMeta,
}: {
  meta: number;
  realizado: number;
  onSalvarMeta: (valor: number) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [valorEditado, setValorEditado] = useState(String(meta));

  const progresso = meta > 0 ? Math.min(realizado / meta, 1) : 0;
  const bateu = realizado >= meta && meta > 0;

  const salvar = () => {
    const novo = Number(valorEditado);
    if (novo > 0) onSalvarMeta(novo);
    setEditando(false);
  };

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-brand" />
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Meta de faturamento do mês
          </p>
        </div>

        {editando ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">R$</span>
            <Input
              type="number"
              value={valorEditado}
              onChange={(e) => setValorEditado(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && salvar()}
              className="h-7 w-28 text-xs"
              autoFocus
            />
            <button
              onClick={salvar}
              className="rounded p-1 text-brand transition-colors hover:bg-brand-soft"
              aria-label="Salvar meta"
            >
              <Check className="size-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              setValorEditado(String(meta));
              setEditando(true);
            }}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Meta: <span className="num font-semibold text-foreground">{formatBRL(meta)}</span>
            <Pencil className="size-3" />
          </button>
        )}
      </div>

      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            bateu ? "bg-profit" : "bg-brand",
          )}
          style={{ width: `${progresso * 100}%` }}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <span className="text-muted-foreground">
          <strong className="num text-foreground">{formatBRL(realizado)}</strong> faturados este
          mês
        </span>
        <span className={cn("num font-semibold", bateu ? "text-profit" : "text-muted-foreground")}>
          {bateu ? "Meta batida! 🎉" : `${formatPercentual(progresso)} da meta`}
        </span>
      </div>
    </div>
  );
}
