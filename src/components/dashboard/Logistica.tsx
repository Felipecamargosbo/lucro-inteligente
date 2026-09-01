import { Fragment, useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Truck, Warehouse } from "lucide-react";
import { usePeriodo } from "@/context/periodo";
import { periodoAnterior } from "@/lib/period";
import { useSelecaoContas } from "@/context/selecao-contas";
import { vendasService } from "@/services";
import { CANAIS } from "@/config/navegacao";
import { filtrarPorPeriodo, variacao } from "@/lib/finance";
import { formatBRL, formatBRLCompacto, formatNumero, formatPercentual } from "@/lib/format";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { cn } from "@/lib/utils";
import type { MarketplaceId, Pedido, TipoLogistica } from "@/types";

const ROTULO_LOGISTICA: Record<TipoLogistica, string> = {
  full: "Full",
  coleta: "Coleta",
};

const COR_LOGISTICA: Record<TipoLogistica, string> = {
  full: "var(--brand)",
  coleta: "var(--warning)",
};

interface ResumoLogistica {
  tipo: TipoLogistica;
  pedidos: number;
  unidades: number;
  faturamento: number;
  lucro: number;
  margem: number;
  faturamentoAnterior: number;
}

function resumirPorLogistica(atuais: Pedido[], anteriores: Pedido[]): ResumoLogistica[] {
  return (["full", "coleta"] as const).map((tipo) => {
    const doTipo = atuais.filter((p) => p.tipoLogistica === tipo && p.status !== "cancelado");
    const doTipoAnterior = anteriores.filter(
      (p) => p.tipoLogistica === tipo && p.status !== "cancelado",
    );
    const faturamento = doTipo.reduce((s, p) => s + p.faturamento, 0);
    const lucro = doTipo.reduce((s, p) => s + p.lucroLiquido, 0);
    return {
      tipo,
      pedidos: doTipo.length,
      unidades: doTipo.reduce((s, p) => s + p.quantidade, 0),
      faturamento,
      lucro,
      margem: faturamento ? lucro / faturamento : 0,
      faturamentoAnterior: doTipoAnterior.reduce((s, p) => s + p.faturamento, 0),
    };
  });
}

interface LinhaCanalLogistica {
  id: MarketplaceId;
  titulo: string;
  full: { pedidos: number; faturamento: number; lucro: number; margem: number };
  coleta: { pedidos: number; faturamento: number; lucro: number; margem: number };
}

function resumirPorCanalELogistica(pedidos: Pedido[]): LinhaCanalLogistica[] {
  return CANAIS.map((canal) => {
    const doCanal = pedidos.filter(
      (p) => p.marketplaceId === canal.id && p.status !== "cancelado",
    );

    const calcular = (tipo: TipoLogistica) => {
      const itens = doCanal.filter((p) => p.tipoLogistica === tipo);
      const faturamento = itens.reduce((s, p) => s + p.faturamento, 0);
      const lucro = itens.reduce((s, p) => s + p.lucroLiquido, 0);
      return {
        pedidos: itens.length,
        faturamento,
        lucro,
        margem: faturamento ? lucro / faturamento : 0,
      };
    };

    return {
      id: canal.id,
      titulo: canal.titulo,
      full: calcular("full"),
      coleta: calcular("coleta"),
    };
  }).filter((c) => c.full.pedidos > 0 || c.coleta.pedidos > 0);
}

export function Logistica() {
  const { periodo } = usePeriodo();
  const { filtrarPorSelecao } = useSelecaoContas();
  const pedidos = filtrarPorSelecao(vendasService.listar());

  const dados = useMemo(() => {
    const atuais = filtrarPorPeriodo(pedidos, periodo);
    const anteriores = filtrarPorPeriodo(pedidos, periodoAnterior(periodo));
    return {
      atuais,
      resumo: resumirPorLogistica(atuais, anteriores),
      porCanal: resumirPorCanalELogistica(atuais),
    };
  }, [pedidos, periodo]);

  const { atuais, resumo, porCanal } = dados;
  const full = resumo.find((r) => r.tipo === "full")!;
  const coleta = resumo.find((r) => r.tipo === "coleta")!;
  const totalFaturamento = full.faturamento + coleta.faturamento;
  const totalPedidos = full.pedidos + coleta.pedidos;

  const dadosGrafico = [
    {
      tipo: ROTULO_LOGISTICA.full,
      chave: "full" as const,
      faturamento: full.faturamento,
      lucro: full.lucro,
    },
    {
      tipo: ROTULO_LOGISTICA.coleta,
      chave: "coleta" as const,
      faturamento: coleta.faturamento,
      lucro: coleta.lucro,
    },
  ];

  if (atuais.length === 0) {
    return (
      <Painel titulo="Logística" descricao="Full vs coleta — faturamento e margem">
        <div className="px-5 py-14 text-center text-sm text-muted-foreground">
          Nenhuma venda no período (ou nenhuma conta selecionada no filtro).
        </div>
      </Painel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl bg-muted/40 px-4 py-2.5 text-[11px] text-muted-foreground">
        <strong>Full</strong> = estoque enviado com antecedência ao centro de distribuição do
        marketplace, que cuida da separação e do envio. <strong>Coleta</strong> = o próprio seller
        despacha cada pedido (Correios, transportadora ou coleta agendada). Cada modelo tem um
        custo diferente embutido nas taxas — por isso vale comparar a margem dos dois separado.
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Pedidos via Full"
          valor={formatNumero(full.pedidos)}
          detalhe={totalPedidos ? `${formatPercentual(full.pedidos / totalPedidos)} do total` : undefined}
        />
        <CardKpi
          titulo="Pedidos via Coleta"
          valor={formatNumero(coleta.pedidos)}
          detalhe={totalPedidos ? `${formatPercentual(coleta.pedidos / totalPedidos)} do total` : undefined}
        />
        <CardKpi
          titulo="Margem Full"
          valor={formatPercentual(full.margem)}
          variacaoPercentual={variacao(full.faturamento, full.faturamentoAnterior)}
        />
        <CardKpi
          titulo="Margem Coleta"
          valor={formatPercentual(coleta.margem)}
          variacaoPercentual={variacao(coleta.faturamento, coleta.faturamentoAnterior)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Painel
          className="lg:col-span-3"
          titulo="Faturamento e lucro por modelo"
          descricao="Full vs Coleta no período selecionado"
        >
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosGrafico} margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="tipo" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatBRLCompacto(Number(v))}
                />
                <ChartTooltip
                  formatter={(v: number | string) => formatBRL(Number(v))}
                  contentStyle={{ fontSize: 12, borderRadius: 12 }}
                />
                <Bar dataKey="faturamento" name="Faturamento" radius={[6, 6, 0, 0]}>
                  {dadosGrafico.map((d) => (
                    <Cell key={d.chave} fill={COR_LOGISTICA[d.chave]} />
                  ))}
                </Bar>
                <Bar dataKey="lucro" name="Lucro líquido" fill="var(--profit)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        <Painel
          className="lg:col-span-2"
          titulo="Participação no faturamento"
          descricao="Full vs Coleta"
        >
          <div className="flex flex-col justify-center gap-5 p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-brand-soft text-brand">
                <Warehouse className="size-4" />
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">Full</span>
                  <span className="num font-semibold">{formatBRL(full.faturamento)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-brand"
                    style={{
                      width: `${totalFaturamento ? (full.faturamento / totalFaturamento) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <span className="num w-12 shrink-0 text-right text-[11px] text-muted-foreground">
                {totalFaturamento ? formatPercentual(full.faturamento / totalFaturamento) : "—"}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-full bg-warning-soft text-foreground">
                <Truck className="size-4" />
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">Coleta</span>
                  <span className="num font-semibold">{formatBRL(coleta.faturamento)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-warning"
                    style={{
                      width: `${totalFaturamento ? (coleta.faturamento / totalFaturamento) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <span className="num w-12 shrink-0 text-right text-[11px] text-muted-foreground">
                {totalFaturamento ? formatPercentual(coleta.faturamento / totalFaturamento) : "—"}
              </span>
            </div>

            <p className="rounded-xl bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
              Ticket médio Full:{" "}
              <strong className="num text-foreground">
                {formatBRL(full.pedidos ? full.faturamento / full.pedidos : 0)}
              </strong>{" "}
              · Ticket médio Coleta:{" "}
              <strong className="num text-foreground">
                {formatBRL(coleta.pedidos ? coleta.faturamento / coleta.pedidos : 0)}
              </strong>
            </p>
          </div>
        </Painel>
      </div>

      <Painel
        titulo="Full vs Coleta por canal"
        descricao="Cada canal com o resultado dos dois modelos lado a lado"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Canal</th>
                <th className="px-3 py-2.5 font-medium">Modelo</th>
                <th className="px-3 py-2.5 text-right font-medium">Pedidos</th>
                <th className="px-3 py-2.5 text-right font-medium">Faturamento</th>
                <th className="px-3 py-2.5 text-right font-medium">Lucro</th>
                <th className="px-3 py-2.5 text-right font-medium">Margem</th>
              </tr>
            </thead>
            <tbody>
              {porCanal.map((c) => (
                <Fragment key={c.id}>
                  <tr className="border-b">
                    <td className="px-5 py-3" rowSpan={2}>
                      <div className="flex items-center gap-2">
                        <LogoMarketplace id={c.id} tamanho="xs" />
                        <span className="text-xs font-medium">{c.titulo}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
                        <span className="size-2 rounded-full bg-brand" /> Full
                      </span>
                    </td>
                    <td className="num px-3 py-3 text-right text-xs">
                      {formatNumero(c.full.pedidos)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs font-semibold">
                      {formatBRL(c.full.faturamento)}
                    </td>
                    <td
                      className={cn(
                        "num px-3 py-3 text-right text-xs font-bold",
                        c.full.lucro >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {formatBRL(c.full.lucro)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                      {c.full.pedidos ? formatPercentual(c.full.margem) : "—"}
                    </td>
                  </tr>
                  <tr className="border-b last:border-0">
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
                        <span className="size-2 rounded-full bg-warning" /> Coleta
                      </span>
                    </td>
                    <td className="num px-3 py-3 text-right text-xs">
                      {formatNumero(c.coleta.pedidos)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs font-semibold">
                      {formatBRL(c.coleta.faturamento)}
                    </td>
                    <td
                      className={cn(
                        "num px-3 py-3 text-right text-xs font-bold",
                        c.coleta.lucro >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {formatBRL(c.coleta.lucro)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                      {c.coleta.pedidos ? formatPercentual(c.coleta.margem) : "—"}
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Painel>
    </div>
  );
}
