import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Clock, Link2Off } from "lucide-react";
import { anunciosService } from "@/services";
import { calcularCobertura, raioXAnuncio } from "@/lib/finance";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { Painel } from "@/components/comum/Indicadores";
import { cn } from "@/lib/utils";
import type { Anuncio, Marketplace } from "@/types";

type TipoPendencia = "sem-custo" | "sem-vinculo" | "taxa-estimada";

const TIPOS: Record<
  TipoPendencia,
  { rotulo: string; descricao: string; Icone: typeof CircleAlert; cor: string }
> = {
  "sem-custo": {
    rotulo: "Sem custo cadastrado",
    descricao:
      "Sem o custo do produto não existe margem — estes anúncios ficam fora de qualquer conta de lucro.",
    Icone: CircleAlert,
    cor: "text-loss",
  },
  "sem-vinculo": {
    rotulo: "Sem vínculo com produto",
    descricao:
      "O anúncio não está ligado a um produto do catálogo, então não há de onde puxar o custo.",
    Icone: Link2Off,
    cor: "text-foreground",
  },
  "taxa-estimada": {
    rotulo: "Taxa ainda estimada",
    descricao:
      "As taxas são projeção sobre o preço de hoje. O valor final muda quando o canal liquidar.",
    Icone: Clock,
    cor: "text-muted-foreground",
  },
};

function classificar(a: Anuncio): TipoPendencia[] {
  const lista: TipoPendencia[] = [];
  if (a.cmv === null) lista.push("sem-custo");
  if (!a.produtoVinculado) lista.push("sem-vinculo");
  if (a.origemTaxas === "estimado") lista.push("taxa-estimada");
  return lista;
}

export function PendenciasCanal({ marketplace }: { marketplace: Marketplace }) {
  const [filtro, setFiltro] = useState<TipoPendencia | "todas">("todas");

  const anuncios = useMemo(
    () => anunciosService.listar().filter((a) => a.marketplaceId === marketplace.id),
    [marketplace.id],
  );

  const cobertura = calcularCobertura(anuncios);

  const pendentes = useMemo(
    () =>
      anuncios
        .map((a) => ({ anuncio: a, tipos: classificar(a) }))
        .filter((i) => i.tipos.length > 0)
        .filter((i) => filtro === "todas" || i.tipos.includes(filtro))
        // Faturamento perdido primeiro: resolver o que mais vende rende mais
        .sort(
          (a, b) =>
            b.anuncio.precoAtual * b.anuncio.unidadesVendidas -
            a.anuncio.precoAtual * a.anuncio.unidadesVendidas,
        ),
    [anuncios, filtro],
  );

  /** Faturamento que passa por anúncios sem custo — dinheiro sem margem conhecida. */
  const receitaCega = anuncios
    .filter((a) => a.cmv === null)
    .reduce((s, a) => s + a.precoAtual * a.unidadesVendidas, 0);

  const contagem: Record<TipoPendencia, number> = {
    "sem-custo": cobertura.semCusto,
    "sem-vinculo": cobertura.semVinculo,
    "taxa-estimada": cobertura.comTaxaEstimada,
  };

  if (pendentes.length === 0 && filtro === "todas") {
    return (
      <Painel titulo="Pendências" descricao="O que impede o cálculo confiável de margem">
        <div className="flex flex-col items-center px-5 py-12 text-center">
          <CheckCircle2 className="size-8 text-profit" />
          <p className="mt-3 text-sm font-medium">Nada pendente neste canal</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Todos os anúncios têm custo cadastrado, vínculo com produto e taxas liquidadas.
          </p>
        </div>
      </Painel>
    );
  }

  return (
    <div className="space-y-4">
      {/* O impacto, em dinheiro */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Catálogo com margem calculável
          </p>
          <p
            className={cn(
              "num mt-1 text-2xl font-bold",
              cobertura.percentualCalculavel >= 0.9 ? "text-profit" : "text-loss",
            )}
          >
            {formatPercentual(cobertura.percentualCalculavel)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formatNumero(cobertura.comCusto)} de {formatNumero(cobertura.total)} anúncios
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Faturamento sem margem conhecida
          </p>
          <p className="num mt-1 text-2xl font-bold text-loss">{formatBRL(receitaCega)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Dinheiro que entrou sem você saber se deu lucro
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Anúncios com taxa estimada
          </p>
          <p className="num mt-1 text-2xl font-bold">
            {formatNumero(cobertura.comTaxaEstimada)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Valores podem mudar até a liquidação
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFiltro("todas")}
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
            filtro === "todas"
              ? "border-brand bg-brand-soft text-brand"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          Todas
        </button>
        {(Object.keys(TIPOS) as TipoPendencia[]).map((t) => {
          if (contagem[t] === 0) return null;
          const meta = TIPOS[t];
          const Icone = meta.Icone;
          return (
            <button
              key={t}
              onClick={() => setFiltro(t)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                filtro === t
                  ? "border-brand bg-brand-soft text-brand"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icone className="size-3" />
              {meta.rotulo} ({formatNumero(contagem[t])})
            </button>
          );
        })}
      </div>

      {filtro !== "todas" && (
        <p className="rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
          {TIPOS[filtro].descricao}
        </p>
      )}

      <Painel
        titulo="Anúncios pendentes"
        descricao="Ordenados por faturamento — resolver os de cima rende mais"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Produto / SKU</th>
                <th className="px-3 py-2 text-right font-medium">Preço</th>
                <th className="px-3 py-2 text-right font-medium">Un. vendidas</th>
                <th className="px-3 py-2 text-right font-medium">Faturamento</th>
                <th className="px-3 py-2 font-medium">Pendências</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.map(({ anuncio, tipos }) => {
                const r = raioXAnuncio(anuncio, marketplace.metas);
                const faturamento = anuncio.precoAtual * anuncio.unidadesVendidas;
                return (
                  <tr key={anuncio.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="max-w-[280px] px-4 py-3">
                      <p className="truncate text-xs font-medium">{anuncio.produto}</p>
                      <p className="num text-[10px] text-muted-foreground">{anuncio.sku}</p>
                    </td>
                    <td className="num px-3 py-3 text-right text-xs">
                      {formatBRL(r.precoVenda)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                      {formatNumero(anuncio.unidadesVendidas)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs font-semibold">
                      {formatBRL(faturamento)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {tipos.map((t) => {
                          const meta = TIPOS[t];
                          const Icone = meta.Icone;
                          return (
                            <span
                              key={t}
                              className={cn(
                                "inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium",
                                meta.cor,
                              )}
                            >
                              <Icone className="size-3" />
                              {meta.rotulo}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {pendentes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    Nenhum anúncio com esta pendência.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Painel>
    </div>
  );
}
