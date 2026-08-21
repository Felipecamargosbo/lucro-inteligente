import { AlertTriangle, BadgePercent, PlugZap, RefreshCw, Settings2 } from "lucide-react";
import { notificacoesService } from "@/services";
import { tempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TipoNotificacao } from "@/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const ICONES: Record<TipoNotificacao, typeof RefreshCw> = {
  sincronizacao: RefreshCw,
  erro: AlertTriangle,
  desconexao: PlugZap,
  configuracao: Settings2,
  promocao: BadgePercent,
};

const CORES: Record<TipoNotificacao, string> = {
  sincronizacao: "bg-profit-soft text-profit",
  erro: "bg-loss-soft text-loss",
  desconexao: "bg-warning-soft text-foreground",
  configuracao: "bg-muted text-muted-foreground",
  promocao: "bg-brand-soft text-brand",
};

export function PainelNotificacoes({
  aberto,
  aoFechar,
}: {
  aberto: boolean;
  aoFechar: (aberto: boolean) => void;
}) {
  const notificacoes = notificacoesService.listar();

  return (
    <Sheet open={aberto} onOpenChange={aoFechar}>
      <SheetContent className="w-full sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Notificações</SheetTitle>
          <SheetDescription>
            Avisos do sistema. Oportunidades de promoção ficam na área de Promoções.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-2 divide-y overflow-y-auto">
          {notificacoes.map((n) => {
            const Icone = ICONES[n.tipo];
            return (
              <div
                key={n.id}
                className={cn("flex gap-3 px-4 py-4", !n.lida && "bg-brand-soft/40")}
              >
                <div
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    CORES[n.tipo],
                  )}
                >
                  <Icone className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{n.titulo}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    {n.descricao}
                  </p>
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {tempoRelativo(n.data)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}
