import { Fragment, useMemo, useState } from "react";
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
import { useConfiguracoes } from "@/context/configuracoes";
import { vendasService } from "@/services";
import { CANAIS } from "@/config/navegacao";
import { filtrarPorPeriodo, variacao } from "@/lib/finance";
import { formatBRL, formatBRLCompacto, formatNumero, formatPercentual } from "@/lib/format";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { cn } from "@/lib/utils";
import type { ContaMarketplace, MarketplaceId, Pedido } from "@/types";

type Regiao = "Norte" | "Nordeste" | "Centro-Oeste" | "Sudeste" | "Sul";

const REGIAO_POR_UF: Record<string, Regiao> = {
  AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste",
  PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul",
};

const COR_REGIAO: Record<Regiao, string> = {
  Sudeste: "var(--brand)",
  Sul: "var(--info)",
  Nordeste: "var(--warning)",
  "Centro-Oeste": "var(--profit)",
  Norte: "var(--loss)",
};

type Metrica = "faturamento" | "pedidos";

interface ResumoEstado {
  uf: string;
  regiao: Regiao;
  pedidos: number;
  unidades: number;
  faturamento: number;
  lucro: number;
  margem: number;
  faturamentoAnterior: number;
}

function resumirPorEstado(atuais: Pedido[], anteriores: Pedido[]): ResumoEstado[] {
  const mapa = new Map<string, ResumoEstado>();

  for (const p of atuais) {
    if (p.status === "cancelado") continue;
    const atual = mapa.get(p.estado) ?? {
      uf: p.estado,
      regiao: REGIAO_POR_UF[p.estado] ?? "Sudeste",
      pedidos: 0,
      unidades: 0,
      faturamento: 0,
      lucro: 0,
      margem: 0,
      faturamentoAnterior: 0,
    };
    atual.pedidos += 1;
    atual.unidades += p.quantidade;
    atual.faturamento += p.faturamento;
    atual.lucro += p.lucroLiquido;
    mapa.set(p.estado, atual);
  }

  for (const p of anteriores) {
    if (p.status === "cancelado") continue;
    const atual = mapa.get(p.estado);
    if (atual) atual.faturamentoAnterior += p.faturamento;
  }

  for (const item of mapa.values()) {
    item.margem = item.faturamento ? item.lucro / item.faturamento : 0;
  }

  return [...mapa.values()];
}

interface ResumoCanalGeografia {
  id: MarketplaceId;
  titulo: string;
  pedidos: number;
  faturamento: number;
  lucro: number;
  margem: number;
}

/** Mesma lógica usada em Canais.tsx — reaproveitada aqui pra dar uma visão
 * por canal também na aba Geografia, além da quebra por estado. */
function resumirPorCanalGeografia(atuais: Pedido[]): ResumoCanalGeografia[] {
  return CANAIS.map((canal) => {
    const doCanal = atuais.filter(
      (p) => p.marketplaceId === canal.id && p.status !== "cancelado",
    );
    const faturamento = doCanal.reduce((s, p) => s + p.faturamento, 0);
    const lucro = doCanal.reduce((s, p) => s + p.lucroLiquido, 0);
    return {
      id: canal.id,
      titulo: canal.titulo,
      pedidos: doCanal.length,
      faturamento,
      lucro,
      margem: faturamento ? lucro / faturamento : 0,
    };
  }).filter((c) => c.pedidos > 0);
}

interface ResumoContaGeografia {
  id: string;
  nome: string;
  pedidos: number;
  faturamento: number;
  lucro: number;
  margem: number;
}

/** Mesma quebra por canal, mas por CONTA — pra abrir o canal e ver o
 * resultado de cada loja individual, igual em Canais. */
function resumirPorContaGeografia(
  atuais: Pedido[],
  contasDoCanal: ContaMarketplace[],
): ResumoContaGeografia[] {
  return contasDoCanal
    .map((conta) => {
      const daConta = atuais.filter(
        (p) => p.contaId === conta.id && p.status !== "cancelado",
      );
      const faturamento = daConta.reduce((s, p) => s + p.faturamento, 0);
      const lucro = daConta.reduce((s, p) => s + p.lucroLiquido, 0);
      return {
        id: conta.id,
        nome: conta.nome,
        pedidos: daConta.length,
        faturamento,
        lucro,
        margem: faturamento ? lucro / faturamento : 0,
      };
    })
    .filter((c) => c.pedidos > 0);
}

export function Geografia() {
  const { periodo } = usePeriodo();
  const { filtrarPorSelecao } = useSelecaoContas();
  const { contas } = useConfiguracoes();
  const pedidos = filtrarPorSelecao(vendasService.listar());
  const [metrica, setMetrica] = useState<Metrica>("faturamento");

  const dados = useMemo(() => {
    const atuais = filtrarPorPeriodo(pedidos, periodo);
    const anteriores = filtrarPorPeriodo(pedidos, periodoAnterior(periodo));
    const porEstado = resumirPorEstado(atuais, anteriores).sort(
      (a, b) => b.faturamento - a.faturamento,
    );

    const porRegiao = new Map<Regiao, number>();
    for (const e of porEstado) {
      porRegiao.set(e.regiao, (porRegiao.get(e.regiao) ?? 0) + e.faturamento);
    }

    return { atuais, porEstado, porRegiao };
  }, [pedidos, periodo]);

  const { atuais, porEstado, porRegiao } = dados;

  const totalFaturamento = porEstado.reduce((s, e) => s + e.faturamento, 0);
  const totalPedidos = porEstado.reduce((s, e) => s + e.pedidos, 0);
  const estadoLider = porEstado[0];

  const dadosPizzaRegiao = (["Sudeste", "Sul", "Nordeste", "Centro-Oeste", "Norte"] as const)
    .map((r) => ({ regiao: r, valor: porRegiao.get(r) ?? 0 }))
    .filter((r) => r.valor > 0);

  const top10 = porEstado
    .slice()
    .sort((a, b) => (metrica === "faturamento" ? b.faturamento - a.faturamento : b.pedidos - a.pedidos))
    .slice(0, 10);

  const porCanal = useMemo(
    () =>
      resumirPorCanalGeografia(atuais).sort((a, b) => b.faturamento - a.faturamento),
    [atuais],
  );

  // Contas por canal, só pra abrir o detalhe na tabela — mesmo padrão de Canais.
  const contasPorCanal = useMemo(() => {
    const mapa = new Map<MarketplaceId, ResumoContaGeografia[]>();
    for (const canal of CANAIS) {
      const doCanal = contas.filter((c) => c.marketplaceId === canal.id);
      mapa.set(canal.id, resumirPorContaGeografia(atuais, doCanal));
    }
    return mapa;
  }, [atuais, contas]);

  // Mesmas linhas do "Ranking completo por estado" — prontas pra exportar.
  const linhasExport = useMemo(
    () =>
      porEstado.map((e) => ({
        Estado: e.uf,
        Região: e.regiao,
        Pedidos: e.pedidos,
        Faturamento: e.faturamento.toFixed(2),
        Lucro: e.lucro.toFixed(2),
        Margem: formatPercentual(e.margem),
        "% do total": totalFaturamento ? formatPercentual(e.faturamento / totalFaturamento) : "—",
      })),
    [porEstado, totalFaturamento],
  );

  if (atuais.length === 0) {
    return (
      <Painel titulo="Geografia" descricao="Faturamento e pedidos por estado">
        <div className="px-5 py-14 text-center text-sm text-muted-foreground">
          Nenhuma venda no período (ou nenhuma conta selecionada no filtro).
        </div>
      </Painel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportarDados nomeArquivo="geografia" linhas={linhasExport} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Estados com venda"
          valor={formatNumero(porEstado.length)}
          detalhe="de 27 UFs"
        />
        <CardKpi
          titulo="Estado líder"
          valor={estadoLider?.uf ?? "—"}
          detalhe={estadoLider ? formatBRL(estadoLider.faturamento) : undefined}
        />
        <CardKpi
          titulo="Concentração do líder"
          valor={
            totalFaturamento > 0 && estadoLider
              ? formatPercentual(estadoLider.faturamento / totalFaturamento)
              : "—"
          }
          detalhe="Do faturamento total no período"
        />
        <CardKpi
          titulo="Variação do líder"
          valor={
            estadoLider
              ? formatPercentual(Math.abs(variacao(estadoLider.faturamento, estadoLider.faturamentoAnterior)))
              : "—"
          }
          detalhe="Vs. período anterior"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Painel
          className="lg:col-span-3"
          titulo="Top 10 estados"
          descricao="Os estados com mais resultado no período"
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
          <div className="h-96 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10} layout="vertical" margin={{ left: 8 }}>
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
                  dataKey="uf"
                  tick={{ fontSize: 11 }}
                  stroke="var(--muted-foreground)"
                  width={36}
                />
                <ChartTooltip
                  formatter={(v: number | string) =>
                    metrica === "faturamento" ? formatBRL(Number(v)) : formatNumero(Number(v))
                  }
                  contentStyle={{ fontSize: 12, borderRadius: 12 }}
                />
                <Bar dataKey={metrica} radius={[0, 6, 6, 0]}>
                  {top10.map((e) => (
                    <Cell key={e.uf} fill={COR_REGIAO[e.regiao]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        <Painel
          className="lg:col-span-2"
          titulo="Divisão por região"
          descricao="Participação de cada região no faturamento"
        >
          <div className="p-5">
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={dadosPizzaRegiao}
                    dataKey="valor"
                    nameKey="regiao"
                    innerRadius="55%"
                    outerRadius="90%"
                    paddingAngle={2}
                    stroke="none"
                  >
                    {dadosPizzaRegiao.map((d) => (
                      <Cell key={d.regiao} fill={COR_REGIAO[d.regiao]} />
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
              {dadosPizzaRegiao.map((r) => (
                <li key={r.regiao} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="size-2.5 shrink-0 rounded-full ring-1 ring-black/10"
                    style={{ background: COR_REGIAO[r.regiao] }}
                  />
                  <span className="flex-1 truncate text-muted-foreground">{r.regiao}</span>
                  <span className="num font-medium">{formatBRL(r.valor)}</span>
                  <span className="num w-12 text-right text-muted-foreground">
                    {totalFaturamento ? formatPercentual(r.valor / totalFaturamento) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Painel>
      </div>

      <Painel
        titulo="Ranking completo por estado"
        descricao="Todos os estados com venda no período, ordenados por faturamento"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Estado</th>
                <th className="px-3 py-2.5 font-medium">Região</th>
                <th className="px-3 py-2.5 text-right font-medium">Pedidos</th>
                <th className="px-3 py-2.5 text-right font-medium">Faturamento</th>
                <th className="px-3 py-2.5 text-right font-medium">Lucro</th>
                <th className="px-3 py-2.5 text-right font-medium">Margem</th>
                <th className="px-3 py-2.5 text-right font-medium">% do total</th>
              </tr>
            </thead>
            <tbody>
              {porEstado.map((e) => (
                <tr key={e.uf} className="border-b last:border-0">
                  <td className="px-5 py-3">
                    <span className="text-xs font-medium">{e.uf}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                    >
                      <span
                        className="size-2 rounded-full"
                        style={{ background: COR_REGIAO[e.regiao] }}
                      />
                      {e.regiao}
                    </span>
                  </td>
                  <td className="num px-3 py-3 text-right text-xs">{formatNumero(e.pedidos)}</td>
                  <td className="num px-3 py-3 text-right text-xs font-semibold">
                    {formatBRL(e.faturamento)}
                  </td>
                  <td
                    className={cn(
                      "num px-3 py-3 text-right text-xs font-bold",
                      e.lucro >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {formatBRL(e.lucro)}
                  </td>
                  <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                    {formatPercentual(e.margem)}
                  </td>
                  <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                    {totalFaturamento ? formatPercentual(e.faturamento / totalFaturamento) : "—"}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/20 font-semibold">
                <td className="px-5 py-3 text-xs" colSpan={2}>
                  Total
                </td>
                <td className="num px-3 py-3 text-right text-xs">{formatNumero(totalPedidos)}</td>
                <td className="num px-3 py-3 text-right text-xs">{formatBRL(totalFaturamento)}</td>
                <td className="px-3 py-3" colSpan={2} />
              </tr>
            </tbody>
          </table>
        </div>
      </Painel>

      <Painel
        titulo="Faturamento por canal"
        descricao="Cada canal com o total, e quando tem mais de uma conta, o valor individual de cada loja logo abaixo"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Canal</th>
                <th className="px-3 py-2.5 text-right font-medium">Pedidos</th>
                <th className="px-3 py-2.5 text-right font-medium">Faturamento</th>
                <th className="px-3 py-2.5 text-right font-medium">Lucro</th>
                <th className="px-3 py-2.5 text-right font-medium">Margem</th>
              </tr>
            </thead>
            <tbody>
              {porCanal.map((c) => {
                const contasDoCanal = contasPorCanal.get(c.id) ?? [];
                const temVariasContas = contasDoCanal.length > 1;
                return (
                  <Fragment key={c.id}>
                    <tr className={cn("border-b", temVariasContas && "bg-muted/10")}>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <LogoMarketplace id={c.id} tamanho="xs" />
                          <span className="text-xs font-medium">{c.titulo}</span>
                          {temVariasContas && (
                            <span className="text-[10px] text-muted-foreground">
                              ({contasDoCanal.length} contas)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="num px-3 py-3 text-right text-xs">{formatNumero(c.pedidos)}</td>
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
                    </tr>

                    {temVariasContas &&
                      contasDoCanal.map((conta) => (
                        <tr key={conta.id} className="border-b last:border-0">
                          <td className="py-2.5 pl-11 pr-5">
                            <span className="text-[11px] text-muted-foreground">{conta.nome}</span>
                          </td>
                          <td className="num px-3 py-2.5 text-right text-[11px] text-muted-foreground">
                            {formatNumero(conta.pedidos)}
                          </td>
                          <td className="num px-3 py-2.5 text-right text-[11px] text-muted-foreground">
                            {formatBRL(conta.faturamento)}
                          </td>
                          <td
                            className={cn(
                              "num px-3 py-2.5 text-right text-[11px]",
                              conta.lucro >= 0 ? "text-profit" : "text-loss",
                            )}
                          >
                            {formatBRL(conta.lucro)}
                          </td>
                          <td className="num px-3 py-2.5 text-right text-[11px] text-muted-foreground">
                            {formatPercentual(conta.margem)}
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
              {porCanal.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-xs text-muted-foreground">
                    Nenhuma venda no período (ou nenhuma conta selecionada no filtro).
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
