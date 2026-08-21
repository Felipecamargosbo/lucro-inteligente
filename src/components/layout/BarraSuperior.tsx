import { Bell } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { MENU } from "@/config/navegacao";
import { SeletorPeriodo } from "@/components/comum/SeletorPeriodo";
import { notificacoesService } from "@/services";

export function BarraSuperior({ aoAbrirNotificacoes }: { aoAbrirNotificacoes: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const item =
    MENU.find((m) => (m.url === "/" ? pathname === "/" : pathname.startsWith(m.url))) ?? MENU[0]!;
  const naoLidas = notificacoesService.listar().filter((n) => !n.lida).length;

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b bg-card px-6">
      <div className="flex min-w-0 items-center gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-base font-semibold">{item.titulo}</h1>
          <p className="truncate text-[11px] text-muted-foreground">{item.descricao}</p>
        </div>
        {item.usaPeriodo && (
          <>
            <div className="h-8 w-px bg-border" />
            <SeletorPeriodo />
          </>
        )}
      </div>

      <button
        onClick={aoAbrirNotificacoes}
        className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Abrir notificações"
      >
        <Bell className="size-5" />
        {naoLidas > 0 && (
          <span className="absolute right-1 top-1 size-2.5 rounded-full border-2 border-card bg-brand" />
        )}
      </button>
    </header>
  );
}
