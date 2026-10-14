import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import { getCanalPorSlug } from "@/config/navegacao";
import { useConfiguracoes } from "@/context/configuracoes";
import { ConteudoConta } from "@/components/marketplaces/ConteudoConta";

export const Route = createFileRoute("/marketplaces/$canal/$conta")({
  loader: ({ params }) => {
    const canal = getCanalPorSlug(params.canal);
    if (!canal) throw notFound();
    // A conta em si é conferida na tela: ao abrir o link direto (ou dar F5),
    // as contas reais ainda estão carregando aqui e isso dava 404.
    return { canal };
  },
  head: ({ loaderData }) => {
    const nome = loaderData?.canal.titulo ?? "Canal";
    return {
      meta: [
        { title: `${nome} | Planeta97` },
        {
          name: "description",
          content: `Resultado, taxas e saúde desta conta no ${nome}: lucro real por anúncio, promoções e reputação.`,
        },
        { property: "og:title", content: `${nome} | Planeta97` },
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
  const { canal } = Route.useLoaderData();
  const { conta: contaId } = Route.useParams();
  const { contas } = useConfiguracoes();

  // Lê do contexto (não do loader) para refletir edições feitas em
  // Configurações → Integrações, como o nome da conta.
  const conta = contas.find((c) => c.id === contaId && c.marketplaceId === canal.id);
  const contasDoCanal = contas.filter((c) => c.marketplaceId === canal.id).length;
  if (!conta) {
    return (
      <div className="px-5 py-16 text-center text-sm text-muted-foreground">
        Carregando a conta… Se ela não aparecer,{" "}
        <Link to="/marketplaces" className="font-medium underline">
          volte para Marketplaces
        </Link>
        .
      </div>
    );
  }

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
