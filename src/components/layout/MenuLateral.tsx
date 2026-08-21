import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { GRUPOS, MENU } from "@/config/navegacao";
import { EMPRESA, USUARIO_ATUAL } from "@/data/mock";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function MenuLateral({
  recolhido,
  alternar,
}: {
  recolhido: boolean;
  alternar: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const ativo = (url: string) =>
    url === "/" ? pathname === "/" : pathname.startsWith(url);

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-300",
        recolhido ? "w-[76px]" : "w-64",
      )}
    >
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sm font-bold text-sidebar-primary-foreground">
          N
        </div>
        {!recolhido && (
          <div className="min-w-0">
            <p className="truncate text-lg font-bold tracking-tight">NEXO</p>
            <p className="truncate text-[10px] uppercase tracking-widest text-sidebar-muted">
              Rentabilidade
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {GRUPOS.map((grupo) => (
          <div key={grupo} className="pb-2">
            {!recolhido && (
              <p className="px-3 pb-2 pt-4 text-[10px] font-bold uppercase tracking-widest text-sidebar-muted">
                {grupo}
              </p>
            )}
            {MENU.filter((item) => item.grupo === grupo).map((item) => {
              const link = (
                <Link
                  key={item.url}
                  to={item.url}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    ativo(item.url)
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    recolhido && "justify-center px-0",
                  )}
                >
                  <item.icone className="size-4 shrink-0" />
                  {!recolhido && <span className="truncate">{item.titulo}</span>}
                </Link>
              );

              return recolhido ? (
                <Tooltip key={item.url}>
                  <TooltipTrigger asChild>{link}</TooltipTrigger>
                  <TooltipContent side="right">{item.titulo}</TooltipContent>
                </Tooltip>
              ) : (
                link
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={alternar}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-[11px] font-semibold uppercase tracking-widest text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {recolhido ? (
            <ChevronsRight className="size-4" />
          ) : (
            <>
              <ChevronsLeft className="size-4" /> Recolher menu
            </>
          )}
        </button>

        <div className={cn("flex items-center gap-3", recolhido && "justify-center")}>
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-bold">
            {USUARIO_ATUAL.nome
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </div>
          {!recolhido && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold">{USUARIO_ATUAL.nome}</p>
              <p className="truncate text-[10px] text-sidebar-muted">{EMPRESA.nome}</p>
              <p className="truncate text-[10px] font-semibold text-sidebar-primary">
                {EMPRESA.plano}
              </p>
            </div>
          )}
        </div>

        {!recolhido && (
          <button
            onClick={() => toast.info("Login e logout serão ativados na próxima etapa.")}
            className="mt-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="size-3.5" /> Sair
          </button>
        )}
      </div>
    </aside>
  );
}
