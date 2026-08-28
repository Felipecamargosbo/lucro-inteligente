import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePeriodo } from "@/context/periodo";
import { vendasService, anunciosService } from "@/services";
import {
  curvaABC,
  filtrarPorPeriodo,
  raioXAnuncio,
  resumir,
  seriePorDia,
} from "@/lib/finance";
import {
  formatBRL,
  formatBRLCompacto,
  formatNumero,
  formatPercentual,
} from "@/lib/format";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { cn } from "@/lib/utils";
import type { Marketplace } from "@/types";

/** Cores das fatias da composição — seguem os tokens do tema. */
const CORES_FATIA = [
  "var(--color-muted-foreground)", // CMV
  "var(--color-brand)", // comissão
  "var(--color-info)", // taxa fixa
  "var(--color-warning)", // frete
  "var(--color-loss)", // mídia
  "var(--color-primary)", // afiliados
  "var(--color-profit)", // lucro
];

export function DashboardCanal({ marketplace }: { marketplace: Marketplace }) {
  const { periodo } = usePeriodo();

  const dados = useMemo(() => {
    const pedidosCanal = vendasService
      .listar()
      .filter((p) => p.marketplaceId === marketplace.id);
    const noPeriodo = filtrarPorPeriodo(pedidosCanal, periodo);

    const anuncios = anunciosService
      .listar()
      .filter((a) => a.marketplaceId === marketplace.id);

    // Composição das taxas somando o raio-X de cada anúncio pelas unidades
    // vendidas. Anúncio sem custo entra nas taxas, mas não no CMV nem no lucro.
    const acumulado = {
      cmv: 0,
      comissao: 0,
      taxaFixa: 0,
      frete: 0,
      midia: 0,
      afiliados: 0,
      impostos: 0,
      lucro: 0,
      receita: 0,
      unidadesSemCusto: 0,
    };

    for (const a of anuncios) {
      const un = a.unidadesVendidas;
      if (un <= 0) continue;
      const r = raioXAnuncio(a, marketplace.metas);
      acumulado.receita += r.precoVenda * un;
      acumulado.comissao += r.comissao * un;
      acumulado.taxaFixa += r.taxaFixa * un;
      acumulado.frete += r.frete * un;
      acumulado.midia += r.midia * un;
      acumulado.afiliados += r.afiliados * un;
      acumulado.impostos += r.impostos * un;
      if (r.semCusto) {
        acumulado.unidadesSemCusto += un;
      } else {
        acumulado.cmv += r.cmv * un;
        acumulado.lucro += r.lucroLiquido * un;
      }
    }

    return {
      resumo: resumir(noPeriodo),
      serie: seriePorDia(noPeriodo, periodo),
      abc: curvaABC(anuncios),
      acumulado,
      anuncios,
    };
  }, [marketplace, periodo]);

  const { resumo, serie, abc, acumulado } = dados;

  const composicao = [
    { nome: "CMV", valor: acumulado.cmv },
    { nome: "Comissão", valor: acumulado.comissao },
    { nome: "Taxa fixa", valor: acumulado.taxaFixa },
    { nome: "Frete", valor: acumulado.frete },
    { nome: "Mídia / ADS", valor: acumulado.midia },
    { nome: "Afiliados", valor: acumulado.afiliados },
    { nome: "Sobra", valor: Math.max(acumulado.lucro, 0) },
  ].filter((f) => f.valor > 0);

  const classeA = abc.filter((i) => i.classe === "A");
  const topProdutos = abc.slice(0, 8);

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <CardKpi
          titulo="Faturamento"
          valor={formatBRL(resumo.faturamento)}
          detalhe={`${formatNumero(resumo.pedidos)} pedidos no período`}
        />
        <CardKpi titulo="Ticket médio" valor={formatBRL(resumo.ticketMedio)} />
        <CardKpi
          titulo="Lucro líquido"
          valor={formatBRL(resumo.lucroLiquido)}
          detalhe={`Margem de ${formatPercentual(resumo.margem)}`}
        />
        <CardKpi
          titulo="Taxas do canal"
          valor={formatBRL(
            acumulado.comissao + acumulado.taxaFixa + acumulado.frete + acumulado.afiliados,
          )}
          detalhe={
            acumulado.receita > 0
              ? `${formatPercentual(
                  (acumulado.comissao +
                    acumulado.taxaFixa +
                    acumulado.frete +
                    acumulado.afiliados) /
                    acumulado.receita,
                )} da receita`
              : undefined
          }
        />
        <CardKpi
          titulo="Mídia / ADS"
          valor={formatBRL(acumulado.midia)}
          detalhe={
            acumulado.receita > 0
              ? `${formatPercentual(acumulado.midia / acumulado.receita)} da receita`
              : undefined
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        {/* Vendas por dia */}
        <Painel
          titulo="Vendas por dia"
          descricao="Faturamento e pedidos ao longo do período"
          className="xl:col-span-3"
        >
          <div className="h-64 p-5">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="dia"
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-muted-foreground)"
                />
                <YAxis
                  yAxisId="esq"
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-muted-foreground)"
                  tickFormatter={(v) => formatBRLCompacto(v)}
                />
                <YAxis
                  yAxisId="dir"
                  orientation="right"
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-muted-foreground)"
                />
                <ChartTooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                  formatter={(v: number, nome) =>
                    nome === "Pedidos" ? formatNumero(v) : formatBRL(v)
                  }
                />
                <Bar
                  yAxisId="esq"
                  dataKey="faturamento"
                  name="Faturamento"
                  fill="var(--color-brand)"
                  radius={[3, 3, 0, 0]}
                />
                <Line
                  yAxisId="dir"
                  type="monotone"
                  dataKey="pedidos"
                  name="Pedidos"
                  stroke="var(--color-warning)"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        {/* Composição das taxas */}
        <Painel
          titulo="Para onde vai o dinheiro"
          descricao="Composição da receita deste canal"
          className="xl:col-span-2"
        >
          {composicao.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-muted-foreground">
              Sem vendas registradas neste canal.
            </p>
          ) : (
            <div className="p-5">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={composicao}
                      dataKey="valor"
                      nameKey="nome"
                      innerRadius="58%"
                      outerRadius="88%"
                      paddingAngle={2}
                      stroke="none"
                    >
                      {composicao.map((_, i) => (
                        <Cell key={i} fill={CORES_FATIA[i % CORES_FATIA.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      formatter={(v: number) => formatBRL(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ul className="mt-4 space-y-1.5">
                {composicao.map((f, i) => (
                  <li key={f.nome} className="flex items-center gap-2 text-[11px]">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: CORES_FATIA[i % CORES_FATIA.length] }}
                    />
                    <span className="flex-1 truncate text-muted-foreground">{f.nome}</span>
                    <span className="num font-medium">{formatBRL(f.valor)}</span>
                    {acumulado.receita > 0 && (
                      <span className="num w-12 text-right text-muted-foreground">
                        {formatPercentual(f.valor / acumulado.receita)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>

              {acumulado.unidadesSemCusto > 0 && (
                <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-[10px] leading-relaxed">
                  {formatNumero(acumulado.unidadesSemCusto)} unidades vendidas são de anúncios sem
                  custo cadastrado. As taxas delas estão somadas acima, mas o CMV e a sobra não —
                  o lucro real deste canal é menor que o exibido.
                </p>
              )}
            </div>
          )}
        </Painel>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        {/* Curva ABC */}
        <Painel
          titulo="Curva ABC"
          descricao="Onde o faturamento se concentra"
          className="xl:col-span-2"
        >
          {abc.length === 0 ? (
            <p className="px-5 py-10 text-center text-xs text-muted-foreground">
              Sem vendas para classificar.
            </p>
          ) : (
            <div className="p-5">
              <div className="flex overflow-hidden rounded-full">
                {(["A", "B", "C"] as const).map((classe) => {
                  const itens = abc.filter((i) => i.classe === classe);
                  const parte = itens.reduce((s, i) => s + i.participacao, 0);
                  if (parte <= 0) return null;
                  const cor =
                    classe === "A"
                      ? "bg-profit"
                      : classe === "B"
                        ? "bg-warning"
                        : "bg-muted-foreground/40";
                  return (
                    <div
                      key={classe}
                      className={cn("h-2.5", cor)}
                      style={{ width: `${parte * 100}%` }}
                      title={`Classe ${classe}: ${itens.length} anúncios`}
                    />
                  );
                })}
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                {(["A", "B", "C"] as const).map((classe) => {
                  const itens = abc.filter((i) => i.classe === classe);
                  const parte = itens.reduce((s, i) => s + i.participacao, 0);
                  return (
                    <div key={classe} className="rounded-lg bg-muted/50 py-2">
                      <p className="num text-sm font-bold">{formatNumero(itens.length)}</p>
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Classe {classe}
                      </p>
                      <p className="num text-[10px] text-muted-foreground">
                        {formatPercentual(parte)} do faturamento
                      </p>
                    </div>
                  );
                })}
              </div>

              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                {classeA.length > 0 ? (
                  <>
                    <strong className="text-foreground">
                      {formatNumero(classeA.length)} anúncios
                    </strong>{" "}
                    ({formatPercentual(classeA.length / abc.length)} do catálogo ativo) respondem
                    por 80% do faturamento deste canal. É neles que um ajuste de preço muda o
                    resultado.
                  </>
                ) : (
                  "Faturamento muito distribuído para destacar uma classe A."
                )}
              </p>
            </div>
          )}
        </Painel>

        {/* Top produtos */}
        <Painel
          titulo="Top produtos do canal"
          descricao="Quem mais fatura — e quanto realmente sobra"
          className="xl:col-span-3"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Produto</th>
                  <th className="px-4 py-2 text-center font-medium">ABC</th>
                  <th className="px-4 py-2 text-right font-medium">Un.</th>
                  <th className="px-4 py-2 text-right font-medium">Faturamento</th>
                  <th className="px-4 py-2 text-right font-medium">Lucro</th>
                </tr>
              </thead>
              <tbody>
                {topProdutos.map((item) => {
                  const r = raioXAnuncio(item.anuncio, marketplace.metas);
                  const lucroTotal = r.lucroLiquido * item.anuncio.unidadesVendidas;
                  return (
                    <tr key={item.anuncio.id} className="border-b last:border-0">
                      <td className="max-w-[240px] px-4 py-2.5">
                        <p className="truncate text-xs font-medium">{item.anuncio.produto}</p>
                        <p className="num text-[10px] text-muted-foreground">
                          {item.anuncio.sku}
                        </p>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span
                          className={cn(
                            "inline-flex size-5 items-center justify-center rounded text-[10px] font-bold",
                            item.classe === "A"
                              ? "bg-profit-soft text-profit"
                              : item.classe === "B"
                                ? "bg-warning-soft text-foreground"
                                : "bg-muted text-muted-foreground",
                          )}
                        >
                          {item.classe}
                        </span>
                      </td>
                      <td className="num px-4 py-2.5 text-right text-xs text-muted-foreground">
                        {formatNumero(item.anuncio.unidadesVendidas)}
                      </td>
                      <td className="num px-4 py-2.5 text-right text-xs font-semibold">
                        {formatBRL(item.faturamento)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {r.semCusto ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            sem custo
                          </span>
                        ) : (
                          <span
                            className={cn(
                              "num text-xs font-bold",
                              lucroTotal >= 0 ? "text-profit" : "text-loss",
                            )}
                          >
                            {formatBRL(lucroTotal)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {topProdutos.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-xs text-muted-foreground"
                    >
                      Nenhuma venda registrada neste canal.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Painel>
      </div>
    </div>
  );
}
