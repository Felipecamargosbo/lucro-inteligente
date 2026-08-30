import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, XCircle } from "lucide-react";
import { ABAS_CANAL, getCanalPorSlug, type AbaCanal } from "@/config/navegacao";
import { marketplacesService, anunciosService } from "@/services";
import { calcularCobertura } from "@/lib/finance";
import { formatNumero, formatPercentual, tempoRelativo } from "@/lib/format";
import { Painel } from "@/components/comum/Indicadores";
import { DashboardCanal } from "@/components/marketplaces/DashboardCanal";
import { useConfiguracoes } from "@/context/configuracoes";
import { RaioXAnuncios } from "@/components/marketplaces/RaioXAnuncios";
import { PromocoesCanal } from "@/components/marketplaces/PromocoesCanal";
import { ReputacaoCanal } from "@/components/marketplaces/ReputacaoCanal";
import { PendenciasCanal } from "@/components/marketplaces/PendenciasCanal";
import { cn } from "@/lib/utils";
import type { Marketplace } from "@/types";

export const Route = createFileRoute("/marketplaces/$canal")({
  loader: ({ params }) => {
    const canal = getCanalPorSlug(params.canal);
    if (!canal) throw notFound();
    return { canal };
  },
  head: ({ loaderData }) => {
    const nome = loaderData?.canal.titulo ?? "Canal";
    return {
      meta: [
        { title: `${nome} | NEXO Rentabilidade` },
        {
          name: "description",
          content: `Resultado, taxas e saúde da sua operação no ${nome}: lucro real por anúncio, promoções e reputação da conta.`,
        },
        { property: "og:title", content: `${nome} | NEXO Rentabilidade` },
        {
          property: "og:description",
          content: `Lucro real por anúncio, promoções e reputação da conta no ${nome}.`,
        },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  component: PaginaCanal,
});

/* ------------------------------------------------------------------ */
/* Cabeçalho do canal                                                 */
/* ------------------------------------------------------------------ */

function StatusConexao({ m }: { m: Marketplace }) {
  const meta = {
    conectado: { texto: "Conectado", cor: "bg-profit-soft text-profit", Icone: CheckCircle2 },
    "token-expirando": {
      texto: "Token expirando",
      cor: "bg-warning-soft text-foreground",
      Icone: AlertTriangle,
    },
    desconectado: { texto: "Desconectado", cor: "bg-loss-soft text-loss", Icone: XCircle },
  }[m.statusConexao];
  const Icone = meta.Icone;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        meta.cor,
      )}
    >
      <Icone className="size-3.5" />
      {meta.texto}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                             */
/* ------------------------------------------------------------------ */

function PaginaCanal() {
  const { canal } = Route.useLoaderData();
  const [abaAtiva, setAbaAtiva] = useState<AbaCanal>("dashboard");
  const { metasPorCanal } = useConfiguracoes();

  const marketplace = marketplacesService
    .listar()
    .find((m) => m.id === canal.id);

  const anunciosDoCanal = anunciosService
    .listar()
    .filter((a) => a.marketplaceId === canal.id);
  const cobertura = calcularCobertura(anunciosDoCanal);

  if (!marketplace) {
    return (
      <div className="mx-auto max-w-[1500px]">
        <Painel titulo={canal.titulo} descricao="Canal não encontrado">
          <div className="px-5 py-10 text-center text-sm text-muted-foreground">
            Este canal não está cadastrado na sua conta.
          </div>
        </Painel>
      </div>
    );
  }

  const desconectado = marketplace.statusConexao === "desconectado";

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      {/* Cabeçalho do canal */}
      <div className="rounded-xl border bg-card p-5">
        <Link
          to="/marketplaces"
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Todos os canais
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-muted text-xs font-bold uppercase text-muted-foreground">
            {marketplace.nome.slice(0, 2)}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{marketplace.nome}</h2>
            <p className="truncate text-xs text-muted-foreground">
              Nexus Commerce · Loja Oficial
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusConexao m={marketplace} />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
              <Clock className="size-3" />
              {marketplace.ultimaSincronizacao
                ? `Sincronizado ${tempoRelativo(marketplace.ultimaSincronizacao)}`
                : "Nunca sincronizado"}
            </span>
          </div>
        </div>

        {/* Avisos honestos sobre a confiabilidade do que será exibido */}
        <div className="mt-4 flex flex-wrap gap-2">
          {desconectado && (
            <p className="rounded-lg bg-loss-soft px-3 py-2 text-[11px] font-medium text-loss">
              Canal desconectado — os números abaixo não são atualizados desde a última
              sincronização.
            </p>
          )}
          {!desconectado && cobertura.semCusto > 0 && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-[11px] font-medium">
              {formatNumero(cobertura.semCusto)} de {formatNumero(cobertura.total)} anúncios sem
              custo cadastrado — a margem só é calculável em{" "}
              {formatPercentual(cobertura.percentualCalculavel)} do catálogo.
            </p>
          )}
          {!desconectado && cobertura.comTaxaEstimada > 0 && (
            <p className="rounded-lg bg-muted px-3 py-2 text-[11px] font-medium text-muted-foreground">
              {formatNumero(cobertura.comTaxaEstimada)} anúncios com taxa estimada — os valores
              podem mudar até a liquidação do canal.
            </p>
          )}
          {!metasPorCanal[canal.id] && (
            <p className="rounded-lg bg-muted px-3 py-2 text-[11px] font-medium text-muted-foreground">
              Sem meta de margem definida para este canal — sem ela, só o prejuízo é sinalizado.
            </p>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1 border-b">
        {ABAS_CANAL.map((aba) => (
          <button
            key={aba.id}
            onClick={() => setAbaAtiva(aba.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              abaAtiva === aba.id
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {aba.titulo}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba */}
      {abaAtiva === "dashboard" ? (
        <DashboardCanal marketplace={marketplace} />
      ) : abaAtiva === "raio-x" ? (
        <RaioXAnuncios marketplace={marketplace} />
      ) : abaAtiva === "promocoes" ? (
        <PromocoesCanal marketplace={marketplace} />
      ) : abaAtiva === "reputacao" ? (
        <ReputacaoCanal marketplace={marketplace} />
      ) : (
        <PendenciasCanal marketplace={marketplace} />
      )}
    </div>
  );
}
