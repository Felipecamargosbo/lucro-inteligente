import { Link, useRouterState } from "@tanstack/react-router";
import { PlugZap } from "lucide-react";
import { anunciosService, vendasService } from "@/services";
import { emDemonstracao } from "@/lib/demonstracao";

/** Telas que não dependem de vendas/anúncios importados — nelas o aviso não
 * aparece (Marketplaces é justamente onde o seller conecta as contas). */
const SEM_AVISO = ["/marketplaces", "/configuracoes", "/calculadora"];

/**
 * Faixa no topo das telas de análise para a conta limpa (sem demonstração)
 * que ainda não tem nenhum dado real importado. Explica por que os números
 * estão zerados e leva o seller até Marketplaces. Some sozinha assim que o
 * primeiro anúncio ou pedido real chegar.
 */
export function AvisoContaSemDados() {
  const caminho = useRouterState({ select: (s) => s.location.pathname });

  if (emDemonstracao()) return null;
  if (SEM_AVISO.some((p) => caminho === p || caminho.startsWith(`${p}/`))) return null;
  if (vendasService.listar().length > 0 || anunciosService.listar().length > 0) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-dashed bg-muted/40 px-4 py-3 text-sm">
      <PlugZap className="size-4 shrink-0 text-muted-foreground" />
      <p className="min-w-0 flex-1 text-muted-foreground">
        <strong className="text-foreground">Ainda não há dados nesta tela.</strong> Os números
        aparecem aqui assim que as vendas e os anúncios das suas contas conectadas forem
        importados.
      </p>
      <Link
        to="/marketplaces"
        className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-brand-foreground hover:bg-brand/90"
      >
        Ir para Marketplaces
      </Link>
    </div>
  );
}
