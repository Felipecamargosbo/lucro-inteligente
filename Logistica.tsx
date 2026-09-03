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
import { Truck, Warehouse, Zap } from "lucide-react";
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
import type { ContaMarketplace, MarketplaceId, Pedido, TipoLogistica } from "@/types";

const TIPOS_LOGISTICA: TipoLogistica[] = ["full", "flex", "padrao"];

const ROTULO_LOGISTICA: Record<TipoLogistica, string> = {
  full: "Full",
  flex: "Flex",
  padrao: "Padrão",
};

const COR_LOGISTICA: Record<TipoLogistica, string> = {
  full: "var(--brand)",
  flex: "var(--info)",
  padrao: "var(--warning)",
};

const PONTO_LOGISTICA: Record<TipoLogistica, string> = {
  full: "bg-brand",
  flex: "bg-info",
  padrao: "bg-warning",
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
  return TIPOS_LOGISTICA.map((tipo) => {
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

interface SplitLogistica {
  pedidos: number;
  faturamento: number;
  lucro: number;
  margem: number;
}

type SplitPorLogistica = Record<TipoLogistica, SplitLogistica>;

/** Calcula o resultado de Full, Flex e Padrão para um conjunto qualquer de
 * pedidos já filtrado (por canal ou por conta) — reaproveitado nos dois. */
function splitLogistica(itensDoEscopo: Pedido[]): SplitPorLogistica {
  const calcular = (tipo: TipoLogistica): SplitLogistica => {
    const itens = itensDoEscopo.filter((p) => p.tipoLogistica === tipo);
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
    full: calcular("full"),
    flex: calcular("flex"),
    padrao: calcular("padrao"),
  };
}

interface LinhaCanalLogistica {
  id: MarketplaceId;
  titulo: string;
  full: SplitLogistica;
  flex: SplitLogistica;
  padrao: SplitLogistica;
}

function resumirPorCanalELogistica(pedidos: Pedido[]): LinhaCanalLogistica[] {
  return CANAIS.map((canal) => {
    const doCanal = pedidos.filter(
      (p) => p.marketplaceId === canal.id && p.status !== "cancelado",
    );
    return { id: canal.id, titulo: canal.titulo, ...splitLogistica(doCanal) };
  }).filter((c) => c.full.pedidos > 0 || c.flex.pedidos > 0 || c.padrao.pedidos > 0);
}

interface LinhaContaLogistica {
  id: string;
  nome: string;
  full: SplitLogistica;
  flex: SplitLogistica;
  padrao: SplitLogistica;
}

/** Mesma quebra Full/Flex/Padrão, mas por CONTA — pra abrir o canal e ver o
 * resultado de cada loja individual, igual já é feito em Canais. */
function resumirPorContaELogistica(
  pedidos: Pedido[],
  contasDoCanal: ContaMarketplace[],
): LinhaContaLogistica[] {
  return contasDoCanal
    .map((conta) => {
      const daConta = pedidos.filter(
        (p) => p.contaId === conta.id && p.status !== "cancelado",
      );
      return { id: conta.id, nome: conta.nome, ...splitLogistica(daConta) };
    })
    .filter((c) => c.full.pedidos > 0 || c.flex.pedidos > 0 || c.padrao.pedidos > 0);
}

const PARTICIPACAO_LOGISTICA: {
  tipo: TipoLogistica;
  icone: typeof Warehouse;
  corIcone: string;
}[] = [
  { tipo: "full", icone: Warehouse, corIcone: "bg-brand-soft text-brand" },
  { tipo: "flex", icone: Zap, corIcone: "bg-info-soft text-info" },
  { tipo: "padrao", icone: Truck, corIcone: "bg-warning-soft text-foreground" },
];

export function Logistica() {
  const { periodo } = usePeriodo();
  const { filtrarPorSelecao } = useSelecaoContas();
  const { contas } = useConfiguracoes();
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

  // Contas por canal, só pra abrir o detalhe na tabela — mesmo padrão de Canais.
  const contasPorCanal = useMemo(() => {
    const mapa = new Map<MarketplaceId, LinhaContaLogistica[]>();
    for (const canal of CANAIS) {
      const doCanal = contas.filter((c) => c.marketplaceId === canal.id);
      mapa.set(canal.id, resumirPorContaELogistica(dados.atuais, doCanal));
    }
    return mapa;
  }, [dados.atuais, contas]);

  // Mesmas linhas da tabela "Full, Flex e Padrão por canal" — canal, modelo
  // e, quando tem mais de uma conta, cada loja individual — prontas pra exportar.
  const linhasExport = useMemo(() => {
    const linhas: Record<string, string | number>[] = [];
    for (const c of porCanal) {
      for (const tipo of TIPOS_LOGISTICA) {
        const d = c[tipo];
        linhas.push({
          Canal: c.titulo,
          Conta: "Total do canal",
          Modelo: ROTULO_LOGISTICA[tipo],
          Pedidos: d.pedidos,
          Faturamento: d.faturamento.toFixed(2),
          Lucro: d.lucro.toFixed(2),
          Margem: d.pedidos ? formatPercentual(d.margem) : "—",
        });
      }
      for (const conta of contasPorCanal.get(c.id) ?? []) {
        for (const tipo of TIPOS_LOGISTICA) {
          const d = conta[tipo];
          linhas.push({
            Canal: c.titulo,
            Conta: conta.nome,
            Modelo: ROTULO_LOGISTICA[tipo],
            Pedidos: d.pedidos,
            Faturamento: d.faturamento.toFixed(2),
            Lucro: d.lucro.toFixed(2),
            Margem: d.pedidos ? formatPercentual(d.margem) : "—",
          });
        }
      }
    }
    return linhas;
  }, [porCanal, contasPorCanal]);

  const full = resumo.find((r) => r.tipo === "full")!;
  const flex = resumo.find((r) => r.tipo === "flex")!;
  const padrao = resumo.find((r) => r.tipo === "padrao")!;
  const totalFaturamento = full.faturamento + flex.faturamento + padrao.faturamento;
  const totalPedidos = full.pedidos + flex.pedidos + padrao.pedidos;

  const dadosGrafico = TIPOS_LOGISTICA.map((tipo) => {
    const r = resumo.find((x) => x.tipo === tipo)!;
    return {
      tipo: ROTULO_LOGISTICA[tipo],
      chave: tipo,
      faturamento: r.faturamento,
      lucro: r.lucro,
    };
  });

  if (atuais.length === 0) {
    return (
      <Painel titulo="Logística" descricao="Full, Flex e Padrão — faturamento e margem">
        <div className="px-5 py-14 text-center text-sm text-muted-foreground">
          Nenhuma venda no período (ou nenhuma conta selecionada no filtro).
        </div>
      </Painel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportarDados nomeArquivo="logistica" linhas={linhasExport} />
      </div>

      <div className="rounded-xl bg-muted/40 px-4 py-2.5 text-[11px] text-muted-foreground">
        <strong>Full</strong> = estoque enviado com antecedência ao centro de distribuição do
        marketplace, que cuida da separação e do envio. <strong>Flex</strong> = o próprio seller
        entrega, geralmente no mesmo dia, usando a logística própria do marketplace.{" "}
        <strong>Padrão</strong> = o seller despacha via Correios ou transportadora comum. Cada
        modelo tem um custo diferente embutido nas taxas — por isso vale comparar a margem dos
        três separado.
      </div>

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <CardKpi
          titulo="Pedidos via Full"
          valor={formatNumero(full.pedidos)}
          detalhe={totalPedidos ? `${formatPercentual(full.pedidos / totalPedidos)} do total` : undefined}
        />
        <CardKpi
          titulo="Pedidos via Flex"
          valor={formatNumero(flex.pedidos)}
          detalhe={totalPedidos ? `${formatPercentual(flex.pedidos / totalPedidos)} do total` : undefined}
        />
        <CardKpi
          titulo="Pedidos via Padrão"
          valor={formatNumero(padrao.pedidos)}
          detalhe={totalPedidos ? `${formatPercentual(padrao.pedidos / totalPedidos)} do total` : undefined}
        />
        <CardKpi
          titulo="Margem Full"
          valor={formatPercentual(full.margem)}
          variacaoPercentual={variacao(full.faturamento, full.faturamentoAnterior)}
        />
        <CardKpi
          titulo="Margem Flex"
          valor={formatPercentual(flex.margem)}
          variacaoPercentual={variacao(flex.faturamento, flex.faturamentoAnterior)}
        />
        <CardKpi
          titulo="Margem Padrão"
          valor={formatPercentual(padrao.margem)}
          variacaoPercentual={variacao(padrao.faturamento, padrao.faturamentoAnterior)}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Painel
          className="lg:col-span-3"
          titulo="Faturamento e lucro por modelo"
          descricao="Full, Flex e Padrão no período selecionado"
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
          descricao="Full, Flex e Padrão"
        >
          <div className="flex flex-col justify-center gap-5 p-5">
            {PARTICIPACAO_LOGISTICA.map(({ tipo, icone: Icone, corIcone }) => {
              const d = resumo.find((r) => r.tipo === tipo)!;
              return (
                <div key={tipo} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full",
                      corIcone,
                    )}
                  >
                    <Icone className="size-4" />
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{ROTULO_LOGISTICA[tipo]}</span>
                      <span className="num font-semibold">{formatBRL(d.faturamento)}</span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn("h-full rounded-full", PONTO_LOGISTICA[tipo])}
                        style={{
                          width: `${totalFaturamento ? (d.faturamento / totalFaturamento) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <span className="num w-12 shrink-0 text-right text-[11px] text-muted-foreground">
                    {totalFaturamento ? formatPercentual(d.faturamento / totalFaturamento) : "—"}
                  </span>
                </div>
              );
            })}

            <p className="rounded-xl bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
              Ticket médio Full:{" "}
              <strong className="num text-foreground">
                {formatBRL(full.pedidos ? full.faturamento / full.pedidos : 0)}
              </strong>{" "}
              · Ticket médio Flex:{" "}
              <strong className="num text-foreground">
                {formatBRL(flex.pedidos ? flex.faturamento / flex.pedidos : 0)}
              </strong>{" "}
              · Ticket médio Padrão:{" "}
              <strong className="num text-foreground">
                {formatBRL(padrao.pedidos ? padrao.faturamento / padrao.pedidos : 0)}
              </strong>
            </p>
          </div>
        </Painel>
      </div>

      <Painel
        titulo="Full, Flex e Padrão por canal"
        descricao="Cada canal com o resultado dos três modelos lado a lado"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
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
              {porCanal.map((c) => {
                const contasDoCanal = contasPorCanal.get(c.id) ?? [];
                const temVariasContas = contasDoCanal.length > 1;
                return (
                  <Fragment key={c.id}>
                    {TIPOS_LOGISTICA.map((tipo, i) => {
                      const d = c[tipo];
                      return (
                        <tr
                          key={tipo}
                          className={cn(
                            "border-b last:border-0",
                            temVariasContas && "bg-muted/10",
                          )}
                        >
                          {i === 0 && (
                            <td className="px-5 py-3" rowSpan={TIPOS_LOGISTICA.length}>
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
                          )}
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
                              <span className={cn("size-2 rounded-full", PONTO_LOGISTICA[tipo])} />{" "}
                              {ROTULO_LOGISTICA[tipo]}
                            </span>
                          </td>
                          <td className="num px-3 py-3 text-right text-xs">
                            {formatNumero(d.pedidos)}
                          </td>
                          <td className="num px-3 py-3 text-right text-xs font-semibold">
                            {formatBRL(d.faturamento)}
                          </td>
                          <td
                            className={cn(
                              "num px-3 py-3 text-right text-xs font-bold",
                              d.lucro >= 0 ? "text-profit" : "text-loss",
                            )}
                          >
                            {formatBRL(d.lucro)}
                          </td>
                          <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                            {d.pedidos ? formatPercentual(d.margem) : "—"}
                          </td>
                        </tr>
                      );
                    })}

                    {temVariasContas &&
                      contasDoCanal.map((conta) => (
                        <Fragment key={conta.id}>
                          {TIPOS_LOGISTICA.map((tipo, i) => {
                            const d = conta[tipo];
                            return (
                              <tr key={tipo} className="border-b last:border-0">
                                {i === 0 && (
                                  <td className="py-2.5 pl-11 pr-5" rowSpan={TIPOS_LOGISTICA.length}>
                                    <span className="text-[11px] text-muted-foreground">
                                      {conta.nome}
                                    </span>
                                  </td>
                                )}
                                <td className="px-3 py-2.5">
                                  <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground">
                                    <span
                                      className={cn("size-1.5 rounded-full", PONTO_LOGISTICA[tipo])}
                                    />{" "}
                                    {ROTULO_LOGISTICA[tipo]}
                                  </span>
                                </td>
                                <td className="num px-3 py-2.5 text-right text-[11px] text-muted-foreground">
                                  {formatNumero(d.pedidos)}
                                </td>
                                <td className="num px-3 py-2.5 text-right text-[11px] text-muted-foreground">
                                  {formatBRL(d.faturamento)}
                                </td>
                                <td
                                  className={cn(
                                    "num px-3 py-2.5 text-right text-[11px]",
                                    d.lucro >= 0 ? "text-profit" : "text-loss",
                                  )}
                                >
                                  {formatBRL(d.lucro)}
                                </td>
                                <td className="num px-3 py-2.5 text-right text-[11px] text-muted-foreground">
                                  {d.pedidos ? formatPercentual(d.margem) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Painel>
    </div>
  );
}
