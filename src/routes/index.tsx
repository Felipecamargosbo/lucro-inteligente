import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { VisaoGeral } from "@/components/dashboard/VisaoGeral";
import { ProdutosMaisVendidos } from "@/components/dashboard/ProdutosMaisVendidos";
import { Canais } from "@/components/dashboard/Canais";
import { Ads } from "@/components/dashboard/Ads";
import { Logistica } from "@/components/dashboard/Logistica";
import { Geografia } from "@/components/dashboard/Geografia";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard executivo | Planeta97" },
      {
        name: "description",
        content:
          "Faturamento, custos, lucro líquido, margem e projeção do mês em um só painel para sellers de marketplaces.",
      },
      { property: "og:title", content: "Dashboard executivo | Planeta97" },
      {
        property: "og:description",
        content: "Veja quanto você realmente ganhou depois de CMV, comissões, taxas e impostos.",
      },
    ],
  }),
  component: Dashboard,
});

type AbaDashboard = "visao-geral" | "produtos" | "ads" | "logistica";

const ABAS: { id: AbaDashboard; titulo: string; descricao: string }[] = [
  {
    id: "visao-geral",
    titulo: "Visão geral",
    descricao: "KPIs, receitas dia a dia, saúde de margem, canais e geografia",
  },
  {
    id: "produtos",
    titulo: "Produtos",
    descricao: "Ranking completo de produtos vendidos, com todas as métricas",
  },
  {
    id: "ads",
    titulo: "ADS",
    descricao: "Gasto com mídia, TACOS e lucro pós-ADS",
  },
  {
    id: "logistica",
    titulo: "Logística",
    descricao: "Full vs coleta — faturamento e margem",
  },
];

/** Separador das seções que antes eram abas próprias — mantém a página longa
 * legível sem precisar esconder nada atrás de um clique. */
function SecaoDashboard({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="border-t pt-6">
        <h2 className="text-sm font-bold">{titulo}</h2>
        <p className="text-xs text-muted-foreground">{descricao}</p>
      </div>
      {children}
    </section>
  );
}

function Dashboard() {
  const [aba, setAba] = useState<AbaDashboard>("visao-geral");

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap gap-1 border-b">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              aba === a.id
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.titulo}
          </button>
        ))}
      </div>

      {aba === "visao-geral" ? (
        <div className="space-y-8">
          <VisaoGeral />
          <SecaoDashboard
            titulo="Canais de venda"
            descricao="Quanto cada marketplace — e cada loja dentro dele — representa no período"
          >
            <Canais />
          </SecaoDashboard>
          <SecaoDashboard
            titulo="Geografia"
            descricao="De onde vêm as vendas: faturamento e pedidos por estado e região"
          >
            <Geografia />
          </SecaoDashboard>
        </div>
      ) : aba === "produtos" ? (
        <ProdutosMaisVendidos />
      ) : aba === "ads" ? (
        <Ads />
      ) : (
        <Logistica />
      )}
    </div>
  );
}
