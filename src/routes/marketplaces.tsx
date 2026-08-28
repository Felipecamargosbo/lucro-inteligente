import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Rota "pai" de /marketplaces. Existe apenas para abrir espaço às rotas
 * filhas: a visão geral fica em marketplaces.index.tsx e cada canal em
 * marketplaces.$canal.tsx. Sem este arquivo, /marketplaces capturaria
 * também as URLs dos canais.
 */
export const Route = createFileRoute("/marketplaces")({
  component: () => <Outlet />,
});
