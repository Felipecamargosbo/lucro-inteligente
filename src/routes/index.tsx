import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { VisaoGeral } from "@/components/dashboard/VisaoGeral";
import { Comparativos } from "@/components/dashboard/Comparativos";
import { Canais } from "@/components/dashboard/Canais";
import { Ads } from "@/components/dashboard/Ads";
import { Logistica } from "@/components/dashboard/Logistica";
import { Geografia } from "@/components/dashboard/Geografia";
import { Financeiro } from "@/components/dashboard/Financeiro";
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
      ) : aba === "comparativos" ? (
        <Comparativos />
      ) : aba === "canais" ? (
        <Canais />
      ) : aba === "ads" ? (
        <Ads />
      ) : aba === "logistica" ? (
        <Logistica />
      ) : aba === "geografia" ? (
        <Geografia />
      ) : (
        <Financeiro />
      )}
    </div>
  );
}
