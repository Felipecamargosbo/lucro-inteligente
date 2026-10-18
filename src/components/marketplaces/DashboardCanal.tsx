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
import { vendasService } from "@/services";
import {
  filtrarPorPeriodo,
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
import type { ContaMarketplace } from "@/types";


interface ItemAbcPeriodo {
  sku: string;
  produto: string;
  unidades: number;
  faturamento: number;
  lucro: number;
  semCusto: boolean;
  participacao: number;
  classe: "A" | "B" | "C";
}

export function DashboardCanal({ conta }: { conta: ContaMarketplace }) {
  const { periodo } = usePeriodo();
  const dados = useMemo(() => {
    const pedidosCanal = vendasService
      .listar()
      .filter((p) => p.contaId === conta.id);
    const noPeriodo = filtrarPorPeriodo(pedidosCanal, periodo);

    // Tudo aqui é do PERÍODO selecionado, a partir das vendas — antes a
    // composição e a curva ABC usavam as vendas de toda a vida do anúncio
    // e não batiam com o faturamento do período.
    const validos = noPeriodo.filter((p) => p.status !== "cancelado");
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
    const porSku = new Map<string, ItemAbcPeriodo>();
    for (const p of validos) {
      acumulado.receita += p.faturamento;
      acumulado.comissao += p.comissao;
      acumulado.taxaFixa += p.taxaFixa;
      acumulado.frete += p.outrosCustos + (p.freteVendedor ?? 0);
      acumulado.midia += p.custoMidia;
      acumulado.impostos += p.impostos;
      if (p.semCmv) {
        acumulado.unidadesSemCusto += p.quantidade;
      } else {
        acumulado.cmv += p.cmv;
        acumulado.lucro += p.lucroLiquido - p.custoMidia;
      }
      const item = porSku.get(p.sku) ?? {
        sku: p.sku,
        produto: p.produto,
        unidades: 0,
        faturamento: 0,
        lucro: 0,
        semCusto: false,
        participacao: 0,
        classe: "C" as const,
      };
      item.unidades += p.quantidade;
      item.faturamento += p.faturamento;
      item.lucro += p.lucroLiquido - p.custoMidia;
      if (p.semCmv) item.semCusto = true;
      porSku.set(p.sku, item);
    }

    const total = acumulado.receita;
    let somaAcumulada = 0;
    const abc: ItemAbcPeriodo[] = [...porSku.values()]
      .sort((a, b) => b.faturamento - a.faturamento)
      .map((item) => {
        const participacao = total > 0 ? item.faturamento / total : 0;
        // A classe vem da fatia acumulada ANTES deste item: o primeiro item
        // é sempre A, mesmo quando sozinho passa de 80%.
        const antes = somaAcumulada;
        somaAcumulada += participacao;
        const classe: "A" | "B" | "C" = antes < 0.8 ? "A" : antes < 0.95 ? "B" : "C";
        return { ...item, participacao, classe };
      });

    return {
      resumo: resumir(noPeriodo),
      serie: seriePorDia(noPeriodo, periodo),
      abc,
      acumulado,
    };
  }, [conta, periodo]);

  const { resumo, serie, abc, acumulado } = dados;

  const composicao = [
    // Cada fatia leva a própria cor (antes a cor seguia a posição e mudava
    // quando alguma fatia zerada saía da lista).
    { nome: "CMV", valor: acumulado.cmv, cor: "var(--color-muted-foreground)" },
    { nome: "Comissão", valor: acumulado.comissao, cor: "var(--color-brand)" },
    { nome: "Taxa fixa", valor: acumulado.taxaFixa, cor: "var(--color-info)" },
    { nome: "Impostos", valor: acumulado.impostos, cor: "var(--color-chart-4)" },
    { nome: "Frete e outros custos", valor: acumulado.frete, cor: "var(--color-warning)" },
    { nome: "Mídia / ADS", valor: acumulado.midia, cor: "var(--color-loss)" },
    { nome: "Afiliados", valor: acumulado.afiliados, cor: "var(--color-primary)" },
    { nome: "Sobra", valor: Math.max(acumulado.lucro, 0), cor: "var(--color-profit)" },
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
          descricao="Composição da receita deste canal no período"
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
                        <Cell key={i} fill={composicao[i]!.cor} />
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
                {composicao.map((f) => (
                  <li key={f.nome} className="flex items-center gap-2 text-[11px]">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: f.cor }}
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
          descricao="Onde o faturamento do período se concentra"
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
                      title={`Classe ${classe}: ${itens.length} produtos`}
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
                      {formatNumero(classeA.length)} {classeA.length === 1 ? "produto" : "produtos"}
                    </strong>{" "}
                    ({formatPercentual(classeA.length / abc.length)} dos produtos vendidos) respondem
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
          descricao="Quem mais faturou no período — e quanto realmente sobra (depois de ADS)"
          className="xl:col-span-3"
        >
          <div className="w-full">
            <table className="w-full text-left">
              <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Produto</th>
                  <th className="px-2 py-2 text-center font-medium">ABC</th>
                  <th className="px-2 py-2 text-right font-medium">Un.</th>
                  <th className="px-2 py-2 text-right font-medium">Faturamento</th>
                  <th className="px-2 py-2 text-right font-medium">Lucro</th>
                </tr>
              </thead>
              <tbody>
                {topProdutos.map((item) => {
                  const lucroTotal = item.lucro;
                  return (
                    <tr key={item.sku} className="border-b last:border-0">
                      <td className="max-w-[240px] px-2 py-2.5">
                        <p className="truncate text-xs font-medium">{item.produto}</p>
                        <p className="num text-[10px] text-muted-foreground">
                          {item.sku}
                        </p>
                      </td>
                      <td className="px-2 py-2.5 text-center">
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
                      <td className="num px-2 py-2.5 text-right text-xs text-muted-foreground">
                        {formatNumero(item.unidades)}
                      </td>
                      <td className="num px-2 py-2.5 text-right text-xs font-semibold">
                        {formatBRL(item.faturamento)}
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        {item.semCusto ? (
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
                      className="px-2 py-10 text-center text-xs text-muted-foreground"
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
