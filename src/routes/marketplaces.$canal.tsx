import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";
import { getCanalPorSlug } from "@/config/navegacao";

/**
 * Camada do canal: só valida que o slug existe e abre espaço para as rotas
 * filhas — a seleção de conta (marketplaces.$canal.index.tsx) e a página da
 * conta específica (marketplaces.$canal.$conta.tsx). Sem este Outlet, a
 * rota filha nunca aparece na tela, mesmo executando corretamente.
 */
export const Route = createFileRoute("/marketplaces/$canal")({
  loader: ({ params }) => {
    if (!getCanalPorSlug(params.canal)) throw notFound();
  },
  component: () => <Outlet />,
});
