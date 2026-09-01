import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Construction } from "lucide-react";
import { VisaoGeral } from "@/components/dashboard/VisaoGeral";
import { Painel } from "@/components/comum/Indicadores";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard executivo | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "Faturamento, custos, lucro líquido, margem e projeção do mês em um só painel para sellers de marketplaces.",
      },
      { property: "og:title", content: "Dashboard executivo | NEXO Rentabilidade" },
      {
        property: "og:description",
        content: "Veja quanto você realmente ganhou depois de CMV, comissões, taxas e impostos.",
      },
    ],
  }),
  component: Dashboard,
});

type AbaDashboard =
  | "visao-geral"
  | "comparativos"
  | "canais"
  | "ads"
  | "logistica"
  | "geografia"
  | "financeiro";

const ABAS: { id: AbaDashboard; titulo: string; descricao: string }[] = [
  {
    id: "visao-geral",
    titulo: "Visão geral",
    descricao: "KPIs, meta do mês e faturamento dia a dia",
  },
  {
    id: "comparativos",
    titulo: "Comparativos",
    descricao: "Evolução vs período anterior, top e piores produtos",
  },
  {
    id: "canais",
    titulo: "Canais",
    descricao: "Pedidos e faturamento por canal de venda",
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
  {
    id: "geografia",
    titulo: "Geografia",
    descricao: "Faturamento e pedidos por estado",
  },
  {
    id: "financeiro",
    titulo: "Financeiro",
    descricao: "Recebíveis previstos e impacto de devoluções",
  },
];

function EmConstrucao({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <Painel titulo={titulo} descricao={descricao}>
      <div className="flex flex-col items-center px-5 py-14 text-center">
        <Construction className="size-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">Esta aba ainda não foi construída</p>
        <p className="mt-1 max-w-sm text-xs text-muted-foreground">
          Estamos fazendo o Dashboard por etapas — essa é uma das próximas.
        </p>
      </div>
    </Painel>
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
        <VisaoGeral />
      ) : (
        <EmConstrucao
          titulo={ABAS.find((a) => a.id === aba)!.titulo}
          descricao={ABAS.find((a) => a.id === aba)!.descricao}
        />
      )}
    </div>
  );
}
