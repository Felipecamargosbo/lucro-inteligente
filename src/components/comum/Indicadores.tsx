import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPercentual } from "@/lib/format";
import { getMarketplace } from "@/data/mock";
import type { MarketplaceId, StatusPedido } from "@/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function CardKpi({
  titulo,
  valor,
  detalhe,
  variacaoPercentual,
  destaque,
  dica,
  progresso,
}: {
  titulo: string;
  valor: string;
  detalhe?: string;
  variacaoPercentual?: number;
  destaque?: boolean;
  dica?: string;
  progresso?: number;
}) {
  const positivo = (variacaoPercentual ?? 0) >= 0;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-card p-5 shadow-card transition-shadow hover:shadow-float",
        destaque && "border-l-4 border-l-profit",
      )}
    >
      <div className="mb-1 flex items-center gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {titulo}
        </p>
        {dica && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent className="max-w-56">{dica}</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <h3
          className={cn(
            "num text-xl font-bold tracking-tight",
            destaque && "text-profit",
          )}
        >
          {valor}
        </h3>
        {variacaoPercentual !== undefined && (
          <span
            className={cn(
              "flex items-center text-[11px] font-bold",
              positivo ? "text-profit" : "text-loss",
            )}
          >
            {positivo ? (
              <ArrowUpRight className="size-3" />
            ) : (
              <ArrowDownRight className="size-3" />
            )}
            {formatPercentual(Math.abs(variacaoPercentual))}
          </span>
        )}
      </div>
      {detalhe && <p className="mt-2 text-[11px] text-muted-foreground">{detalhe}</p>}
      {progresso !== undefined && (
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-all"
            style={{ width: `${Math.min(100, Math.max(0, progresso * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function Painel({
  titulo,
  descricao,
  acoes,
  children,
  className,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border bg-card shadow-card", className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{titulo}</h2>
          {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
        </div>
        {acoes && <div className="flex items-center gap-2">{acoes}</div>}
      </header>
      {children}
    </section>
  );
}

/** Cor de marca de cada marketplace (forte, não o tom suave usado no resto do
 * app), com o texto em branco ou preto — o que der mais contraste em cada
 * uma. Mesmas cores de fundo usadas em LogoMarketplace.tsx e Canais.tsx. */
const CORES_MARKETPLACE: Record<MarketplaceId, string> = {
  "mercado-livre": "bg-[#FFE600] text-black",
  shopee: "bg-[#EE4D2D] text-white",
  amazon: "bg-[#FF9900] text-black",
  magalu: "bg-[#0086FF] text-white",
  "tiktok-shop": "bg-[#111111] text-white",
  shein: "bg-[#222222] text-white",
};

export function SeloMarketplace({ id }: { id: MarketplaceId }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        CORES_MARKETPLACE[id],
      )}
    >
      {getMarketplace(id).nome}
    </span>
  );
}

const ROTULO_STATUS: Record<StatusPedido, { texto: string; cor: string }> = {
  entregue: { texto: "Entregue", cor: "bg-profit" },
  "em-transito": { texto: "Em trânsito", cor: "bg-info" },
  "aguardando-envio": { texto: "Aguardando envio", cor: "bg-warning" },
  cancelado: { texto: "Cancelado", cor: "bg-loss" },
};

export function StatusPedidoSelo({ status }: { status: StatusPedido }) {
  const s = ROTULO_STATUS[status];
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-medium">
      <span className={cn("size-2 rounded-full", s.cor)} />
      {s.texto}
    </span>
  );
}

export function SeloMargem({ margem }: { margem: number }) {
  const cor =
    margem >= 0.2
      ? "bg-profit-soft text-profit"
      : margem >= 0.1
        ? "bg-warning-soft text-foreground"
        : "bg-loss-soft text-loss";
  return (
    <span className={cn("num rounded px-2 py-1 text-[10px] font-bold", cor)}>
      {formatPercentual(margem)}
    </span>
  );
}
