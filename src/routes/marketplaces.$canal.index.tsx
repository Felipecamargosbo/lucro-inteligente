import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getCanalPorSlug } from "@/config/navegacao";
import { contasService } from "@/services";
import { useConfiguracoes } from "@/context/configuracoes";
import { Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/marketplaces/$canal/")({
  loader: ({ params }) => {
    const canal = getCanalPorSlug(params.canal);
    if (!canal) throw notFound();

    // Canal com uma conta só: pula a seleção e vai direto pras abas —
    // ninguém deveria clicar duas vezes pra chegar num lugar que só tem
    // um destino possível.
    const contas = contasService.doCanal(canal.id);
    if (contas.length === 1) {
      throw redirect({
        to: "/marketplaces/$canal/$conta",
        params: { canal: params.canal, conta: contas[0]!.id },
      });
    }

    return { canal };
  },
  head: ({ loaderData }) => {
    const nome = loaderData?.canal.titulo ?? "Canal";
    return {
      meta: [
        { title: `${nome} | NEXO Rentabilidade` },
        {
          name: "description",
          content: `Escolha a conta do ${nome} que você quer ver.`,
        },
      ],
    };
  },
  component: SelecaoDeConta,
});

function SelecaoDeConta() {
  const { canal } = Route.useLoaderData();
  const { contas } = useConfiguracoes();
  const contasDoCanal = contas.filter((c) => c.marketplaceId === canal.id);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <Link
        to="/marketplaces"
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Todos os canais
      </Link>

      <div className="flex items-center gap-3">
        <LogoMarketplace id={canal.id} tamanho="lg" />
        <div>
          <h2 className="text-lg font-semibold">{canal.titulo}</h2>
          <p className="text-xs text-muted-foreground">
            Você tem {contasDoCanal.length} contas neste canal — escolha qual quer ver
          </p>
        </div>
      </div>

      {contasDoCanal.length === 0 ? (
        <Painel titulo="Nenhuma conta" descricao="Este canal ainda não tem contas cadastradas">
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Conecte uma conta em Configurações → Integrações para começar.
          </div>
        </Painel>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {contasDoCanal.map((c) => {
            const cor =
              c.statusConexao === "conectado"
                ? "bg-profit"
                : c.statusConexao === "token-expirando"
                  ? "bg-warning"
                  : "bg-loss";
            return (
              <Link
                key={c.id}
                to="/marketplaces/$canal/$conta"
                params={{ canal: canal.slug, conta: c.id }}
                className="flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/40"
              >
                <span className={cn("size-2 shrink-0 rounded-full", cor)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{c.nome}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{c.cnpj}</p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
