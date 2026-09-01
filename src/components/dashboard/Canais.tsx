import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
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
import { filtrarPorPeriodo, variacao } from "@/lib/finance";
import { formatBRL, formatBRLCompacto, formatNumero, formatPercentual } from "@/lib/format";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { cn } from "@/lib/utils";
import type { MarketplaceId, Pedido } from "@/types";

type Metrica = "pedidos" | "faturamento";

const CORES_CANAL: Record<MarketplaceId, string> = {
  "mercado-livre": "#FFE600",
  shopee: "#EE4D2D",
  amazon: "#FF9900",
  magalu: "#0086FF",
  "tiktok-shop": "#25F4EE",
  shein: "#000000",
};

interface ResumoCanal {
  id: MarketplaceId;
  titulo: string;
  pedidos: number;
  unidades: number;
  faturamento: number;
  lucro: number;
  margem: number;
  faturamentoAnterior: number;
}

function resumirPorCanal(atuais: Pedido[], anteriores: Pedido[]): ResumoCanal[] {
  return CANAIS.map((canal) => {
    const doCanal = atuais.filter(
      (p) => p.marketplaceId === canal.id && p.status !== "cancelado",
    );
    const doCanalAnterior = anteriores.filter(
      (p) => p.marketplaceId === canal.id && p.status !== "cancelado",
    );
    const faturamento = doCanal.reduce((s, p) => s + p.faturamento, 0);
    const lucro = doCanal.reduce((s, p) => s + p.lucroLiquido, 0);
    return {
      id: canal.id,
      titulo: canal.titulo,
      pedidos: doCanal.length,
      unidades: doCanal.reduce((s, p) => s + p.quantidade, 0),
      faturamento,
      lucro,
      margem: faturamento ? lucro / faturamento : 0,
      faturamentoAnterior: doCanalAnterior.reduce((s, p) => s + p.faturamento, 0),
    };
  }).filter((c) => c.pedidos > 0 || c.faturamentoAnterior > 0);
}

export function Canais() {
  const { periodo } = usePeriodo();
  const { filtrarPorSelecao } = useSelecaoContas();
  const [metrica, setMetrica] = useState<Metrica>("faturamento");

  const pedidos = filtrarPorSelecao(vendasService.listar());

  const resumoCanais = useMemo(() => {
    const atuais = filtrarPorPeriodo(pedidos, periodo);
    const anteriores = filtrarPorPeriodo(pedidos, periodoAnterior(periodo));
    return resumirPorCanal(atuais, anteriores).sort((a, b) => b.faturamento - a.faturamento);
  }, [pedidos, periodo]);

  const totalFaturamento = resumoCanais.reduce((s, c) => s + c.faturamento, 0);
  const totalPedidos = resumoCanais.reduce((s, c) => s + c.pedidos, 0);
  const canalTopo = resumoCanais[0];

  const dadosPizza = resumoCanais.map((c) => ({
    nome: c.titulo,
    valor: c.faturamento,
    cor: CORES_CANAL[c.id],
  }));

  if (resumoCanais.length === 0) {
    return (
      <Painel titulo="Canais" descricao="Pedidos e faturamento por canal de venda">
        <div className="px-5 py-14 text-center text-sm text-muted-foreground">
          Nenhuma venda no período (ou nenhuma conta selecionada no filtro).
        </div>
      </Painel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <CardKpi
          titulo="Canais com venda"
          valor={formatNumero(resumoCanais.length)}
          detalhe={`de ${CANAIS.length} conectados`}
        />
        <CardKpi
          titulo="Canal líder"
          valor={canalTopo?.titulo ?? "—"}
          detalhe={canalTopo ? formatBRL(canalTopo.faturamento) : undefined}
        />
        <CardKpi
          titulo="Concentração do líder"
          valor={
            totalFaturamento > 0 && canalTopo
              ? formatPercentual(canalTopo.faturamento / totalFaturamento)
              : "—"
          }
          detalhe="Do faturamento total no período"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Painel
          className="lg:col-span-3"
          titulo="Vendas por canal"
          descricao="Compare pedidos ou faturamento entre os canais conectados"
          acoes={
            <div className="flex overflow-hidden rounded-lg border">
              {(["faturamento", "pedidos"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetrica(m)}
                  className={cn(
                    "px-3 py-1.5 text-xs font-medium transition-colors",
                    metrica === m
                      ? "bg-brand text-brand-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {m === "faturamento" ? "Faturamento" : "Pedidos"}
                </button>
              ))}
            </div>
          }
        >
          <div className="h-80 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={resumoCanais} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10 }}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) =>
                    metrica === "faturamento" ? formatBRLCompacto(Number(v)) : formatNumero(Number(v))
                  }
                />
                <YAxis
                  type="category"
                  dataKey="titulo"
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  width={90}
                />
                <ChartTooltip
                  formatter={(v: number | string) =>
                    metrica === "faturamento" ? formatBRL(Number(v)) : formatNumero(Number(v))
                  }
                  contentStyle={{ fontSize: 12, borderRadius: 12 }}
                />
                <Bar dataKey={metrica} radius={[0, 6, 6, 0]}>
                  {resumoCanais.map((c) => (
                    <Cell key={c.id} fill={CORES_CANAL[c.id]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        <Painel
          className="lg:col-span-2"
          titulo="Divisão do faturamento"
          descricao="Participação de cada canal no total"
        >
          <div className="p-5">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dadosPizza}
                    dataKey="valor"
                    nameKey="nome"
                    innerRadius="55%"
                    outerRadius="90%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {dadosPizza.map((d) => (
                      <Cell key={d.nome} fill={d.cor} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    formatter={(v: number) => formatBRL(v)}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-3 space-y-1.5">
              {resumoCanais.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ background: CORES_CANAL[c.id] }}
                  />
                  <span className="flex-1 truncate text-muted-foreground">{c.titulo}</span>
                  <span className="num font-medium">{formatBRL(c.faturamento)}</span>
                  <span className="num w-12 text-right text-muted-foreground">
                    {totalFaturamento ? formatPercentual(c.faturamento / totalFaturamento) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Painel>
      </div>

      <Painel
        titulo="Comparação por canal"
        descricao="Cada canal, com a variação de faturamento vs. o período anterior"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Canal</th>
                <th className="px-3 py-2.5 text-right font-medium">Pedidos</th>
                <th className="px-3 py-2.5 text-right font-medium">Unidades</th>
                <th className="px-3 py-2.5 text-right font-medium">Faturamento</th>
                <th className="px-3 py-2.5 text-right font-medium">Lucro</th>
                <th className="px-3 py-2.5 text-right font-medium">Margem</th>
                <th className="px-3 py-2.5 text-right font-medium">Vs. anterior</th>
              </tr>
            </thead>
            <tbody>
              {resumoCanais.map((c) => {
                const v = variacao(c.faturamento, c.faturamentoAnterior);
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <LogoMarketplace id={c.id} tamanho="xs" />
                        <span className="text-xs font-medium">{c.titulo}</span>
                      </div>
                    </td>
                    <td className="num px-3 py-3 text-right text-xs">{formatNumero(c.pedidos)}</td>
                    <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                      {formatNumero(c.unidades)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs font-semibold">
                      {formatBRL(c.faturamento)}
                    </td>
                    <td
                      className={cn(
                        "num px-3 py-3 text-right text-xs font-bold",
                        c.lucro >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {formatBRL(c.lucro)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                      {formatPercentual(c.margem)}
                    </td>
                    <td
                      className={cn(
                        "num px-3 py-3 text-right text-xs font-bold",
                        v >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {v >= 0 ? "+" : "−"}
                      {formatPercentual(Math.abs(v))}
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-muted/20 font-semibold">
                <td className="px-5 py-3 text-xs">Total</td>
                <td className="num px-3 py-3 text-right text-xs">{formatNumero(totalPedidos)}</td>
                <td className="px-3 py-3" />
                <td className="num px-3 py-3 text-right text-xs">{formatBRL(totalFaturamento)}</td>
                <td className="px-3 py-3" colSpan={3} />
              </tr>
            </tbody>
          </table>
        </div>
      </Painel>
    </div>
  );
}
