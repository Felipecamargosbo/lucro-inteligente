import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, LogOut } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CANAIS, GRUPOS, MENU, type ItemMenu } from "@/config/navegacao";
import { EMPRESA, USUARIO_ATUAL, getMarketplace } from "@/data/mock";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";

/** Bolinha de status da conexão do canal, para leitura num relance. */
function PontoStatus({ id }: { id: (typeof CANAIS)[number]["id"] }) {
  const m = getMarketplace(id);
  const cor =
    m.statusConexao === "conectado"
      ? "bg-profit"
      : m.statusConexao === "token-expirando"
        ? "bg-warning"
        : "bg-loss";
  return <span className={cn("size-1.5 shrink-0 rounded-full", cor)} />;
}

/**
 * "Marketplaces": abre a visão geral e lista cada canal.
 * Fica expandido por padrão quando o usuário já está dentro de /marketplaces.
 */
function GrupoMarketplaces({
  item,
  recolhido,
  pathname,
}: {
  item: ItemMenu;
  recolhido: boolean;
  pathname: string;
}) {
  const dentroDeMarketplaces = pathname.startsWith("/marketplaces");
  const [aberto, setAberto] = useState(dentroDeMarketplaces);

  // Recolhido: vira só o ícone, com tooltip, sem sub-itens.
  if (recolhido) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/marketplaces"
            className={cn(
              "flex items-center justify-center rounded-lg px-0 py-2 text-sm font-medium transition-colors",
              dentroDeMarketplaces
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <item.icone className="size-4 shrink-0" />
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">Marketplaces</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div>
      <button
        onClick={() => setAberto((v) => !v)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          dentroDeMarketplaces
            ? "text-sidebar-foreground"
            : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <item.icone className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Marketplaces</span>
        {aberto ? (
          <ChevronDown className="size-3.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3.5 shrink-0" />
        )}
      </button>

      {aberto && (
        <div className="mt-0.5 space-y-0.5">
          <Link
            to="/marketplaces"
            className={cn(
              "flex items-center gap-2 rounded-lg py-1.5 pl-10 pr-3 text-[13px] transition-colors",
              pathname === "/marketplaces"
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            Visão geral &amp; conexões
          </Link>

          {CANAIS.map((canal) => (
            <Link
              key={canal.slug}
              to="/marketplaces/$canal"
              params={{ canal: canal.slug }}
              className={cn(
                "flex items-center gap-2 rounded-lg py-1.5 pl-10 pr-3 text-[13px] transition-colors",
                pathname.startsWith(`/marketplaces/${canal.slug}`)
                  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )}
            >
              <LogoMarketplace id={canal.id} tamanho="xs" />
              <span className="flex-1 truncate">{canal.titulo}</span>
              <PontoStatus id={canal.id} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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
              // "Marketplaces" não é um link simples: é um grupo que abre
              // a lista de canais conectados.
              if (item.url === "/marketplaces") {
                return (
                  <GrupoMarketplaces
                    key={item.url}
                    item={item}
                    recolhido={recolhido}
                    pathname={pathname}
                  />
                );
              }

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
