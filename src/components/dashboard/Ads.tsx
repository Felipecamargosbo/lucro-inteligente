import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePeriodo } from "@/context/periodo";
import { periodoAnterior } from "@/lib/period";
import { useSelecaoContas } from "@/context/selecao-contas";
import { vendasService } from "@/services";
import { CANAIS } from "@/config/navegacao";
import {
  agruparPorSkuComAds,
  filtrarPorPeriodo,
  resumir,
  seriePorDia,
  variacao,
} from "@/lib/finance";
import { formatBRL, formatBRLCompacto, formatPercentual } from "@/lib/format";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { cn } from "@/lib/utils";
import type { Pedido } from "@/types";

export function Ads() {
  const { periodo } = usePeriodo();
  const { filtrarPorSelecao } = useSelecaoContas();
  const pedidos = filtrarPorSelecao(vendasService.listar());

  const dados = useMemo(() => {
    const atuais = filtrarPorPeriodo(pedidos, periodo);
    const anteriores = filtrarPorPeriodo(pedidos, periodoAnterior(periodo));
    return {
      atuais,
      resumo: resumir(atuais),
      resumoAnterior: resumir(anteriores),
      serie: seriePorDia(atuais, periodo),
    };
  }, [pedidos, periodo]);

  const { resumo, resumoAnterior, serie, atuais } = dados;

  const tacos = resumo.faturamento ? resumo.custoMidia / resumo.faturamento : 0;
  const tacosAnterior = resumoAnterior.faturamento
    ? resumoAnterior.custoMidia / resumoAnterior.faturamento
    : 0;
  const lucroAntesAds = resumo.lucroLiquido;
  const lucroPosAds = resumo.lucroLiquido - resumo.custoMidia;

  // Composição por canal: quanto cada um gastou e faturou com ADS no período
  const porCanal = useMemo(() => {
    return CANAIS.map((canal) => {
      const doCanal = atuais.filter(
        (p: Pedido) => p.marketplaceId === canal.id && p.status !== "cancelado",
      );
      const faturamento = doCanal.reduce((s, p) => s + p.faturamento, 0);
      const gasto = doCanal.reduce((s, p) => s + p.custoMidia, 0);
      return {
        id: canal.id,
        titulo: canal.titulo,
        faturamento,
        gasto,
        tacos: faturamento ? gasto / faturamento : 0,
      };
    }).filter((c) => c.gasto > 0 || c.faturamento > 0);
  }, [atuais]);

  const semRetorno = useMemo(
    () =>
      agruparPorSkuComAds(atuais)
        .filter((i) => i.semRetorno)
        .sort((a, b) => b.custoMidia - a.custoMidia)
        .slice(0, 8),
    [atuais],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Gasto com ADS"
          valor={formatBRL(resumo.custoMidia)}
          variacaoPercentual={variacao(resumo.custoMidia, resumoAnterior.custoMidia)}
          dica="Total investido em anúncios patrocinados no período."
        />
        <CardKpi
          titulo="TACOS"
          valor={formatPercentual(tacos)}
          detalhe={`${tacos >= tacosAnterior ? "+" : "−"}${formatPercentual(Math.abs(variacao(tacos, tacosAnterior)))} vs. anterior`}
          dica="Gasto com ADS dividido pelo faturamento total — não só o das vendas vindas de anúncio. É o termômetro de quanto a mídia está comendo do seu resultado."
        />
        <CardKpi
          titulo="Lucro antes de ADS"
          valor={formatBRL(lucroAntesAds)}
          detalhe="O lucro líquido que já aparece em todo o sistema"
        />
        <CardKpi
          titulo="Lucro pós-ADS"
          valor={formatBRL(lucroPosAds)}
          detalhe={`Margem pós-ADS: ${formatPercentual(resumo.faturamento ? lucroPosAds / resumo.faturamento : 0)}`}
          destaque
        />
      </div>

      <Painel
        titulo="Gasto com ADS dia a dia"
        descricao="Barras: investimento em mídia · Linha: TACOS do dia"
      >
        <div className="h-72 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={serie}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <YAxis
                yAxisId="esq"
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
                tickFormatter={(v) => formatBRLCompacto(Number(v))}
              />
              <YAxis
                yAxisId="dir"
                orientation="right"
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
                tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
              />
              <ChartTooltip
                formatter={(v: number | string, nome) =>
                  nome === "TACOS" ? formatPercentual(Number(v)) : formatBRL(Number(v))
                }
                contentStyle={{ fontSize: 12, borderRadius: 12 }}
              />
              <Bar
                yAxisId="esq"
                dataKey="custoMidia"
                name="Gasto com ADS"
                fill="var(--brand)"
                radius={[6, 6, 0, 0]}
              />
              <Line
                yAxisId="dir"
                type="monotone"
                dataKey={(p: (typeof serie)[number]) =>
                  p.faturamento ? p.custoMidia / p.faturamento : 0
                }
                name="TACOS"
                stroke="var(--loss)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Painel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Painel titulo="ADS por canal" descricao="Onde o investimento em mídia está concentrado">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Canal</th>
                  <th className="px-3 py-2.5 text-right font-medium">Gasto ADS</th>
                  <th className="px-3 py-2.5 text-right font-medium">Faturamento</th>
                  <th className="px-3 py-2.5 text-right font-medium">TACOS</th>
                </tr>
              </thead>
              <tbody>
                {porCanal.map((c) => (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <LogoMarketplace id={c.id} tamanho="xs" />
                        <span className="text-xs font-medium">{c.titulo}</span>
                      </div>
                    </td>
                    <td className="num px-3 py-3 text-right text-xs font-semibold">
                      {formatBRL(c.gasto)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                      {formatBRL(c.faturamento)}
                    </td>
                    <td
                      className={cn(
                        "num px-3 py-3 text-right text-xs font-bold",
                        c.tacos > 0.15 ? "text-loss" : "text-profit",
                      )}
                    >
                      {formatPercentual(c.tacos)}
                    </td>
                  </tr>
                ))}
                {porCanal.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-xs text-muted-foreground">
                      Nenhum gasto com ADS no período.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Painel>

        <Painel
          titulo="Mídia sem retorno"
          descricao="Produtos em que o gasto de ADS supera o lucro que eles geravam antes dele"
        >
          <div className="divide-y">
            {semRetorno.map((item) => (
              <div key={item.sku} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{item.produto}</p>
                  <p className="num text-[10px] text-muted-foreground">
                    {item.sku} · Lucro antes de ADS: {formatBRL(item.lucroAntesAds)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-sm font-bold text-loss">− {formatBRL(item.custoMidia)}</p>
                  <p className="num text-[10px] font-medium text-loss">
                    Pós-ADS: {formatBRL(item.lucroPosAds)}
                  </p>
                </div>
              </div>
            ))}
            {semRetorno.length === 0 && (
              <p className="px-5 py-10 text-center text-xs text-muted-foreground">
                Nenhum produto com ADS consumindo mais que o lucro no período — sinal bom.
              </p>
            )}
          </div>
        </Painel>
      </div>
    </div>
  );
}
