import { createFileRoute, notFound } from "@tanstack/react-router";
import { getCanalPorSlug } from "@/config/navegacao";
import { contasService } from "@/services";
import { useConfiguracoes } from "@/context/configuracoes";
import { ConteudoConta } from "@/components/marketplaces/ConteudoConta";

export const Route = createFileRoute("/marketplaces/$canal/$conta")({
  loader: ({ params }) => {
    const canal = getCanalPorSlug(params.canal);
    if (!canal) throw notFound();

    const conta = contasService.buscar(params.conta);
    if (!conta || conta.marketplaceId !== canal.id) throw notFound();

    return { canal, contasDoCanal: contasService.doCanal(canal.id).length };
  },
  head: ({ loaderData }) => {
    const nome = loaderData?.canal.titulo ?? "Canal";
    return {
      meta: [
        { title: `${nome} | NEXO Rentabilidade` },
        {
          name: "description",
          content: `Resultado, taxas e saúde desta conta no ${nome}: lucro real por anúncio, promoções e reputação.`,
        },
        { property: "og:title", content: `${nome} | NEXO Rentabilidade` },
        {
          property: "og:description",
          content: `Lucro real por anúncio, promoções e reputação no ${nome}.`,
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: PaginaConta,
});

function PaginaConta() {
  const { canal, contasDoCanal } = Route.useLoaderData();
  const { conta: contaId } = Route.useParams();
  const { contas } = useConfiguracoes();

  // Lê do contexto (não do loader) para refletir edições feitas em
  // Configurações → Integrações, como o nome da conta.
  const conta = contas.find((c) => c.id === contaId);
  if (!conta) return null; // o loader já garantiu que existe

  return (
    <ConteudoConta
      conta={conta}
      canal={canal}
      voltarPara={contasDoCanal > 1 ? "/marketplaces/$canal" : "/marketplaces"}
      voltarParams={contasDoCanal > 1 ? { canal: canal.slug } : undefined}
      voltarRotulo={contasDoCanal > 1 ? "Trocar de conta" : "Todos os canais"}
    />
  );
}
