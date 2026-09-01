import { Fragment, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePeriodo } from "@/context/periodo";
import { useSelecaoContas } from "@/context/selecao-contas";
import { useConfiguracoes } from "@/context/configuracoes";
import { vendasService } from "@/services";
import { CANAIS } from "@/config/navegacao";
import {
  filtrarPorPeriodo,
  projetarMes,
  resumir,
  seriePorDia,
  variacao,
} from "@/lib/finance";
import { periodoAnterior } from "@/lib/period";
import {
  formatBRL,
  formatBRLCompacto,
  formatData,
  formatNumero,
  formatPercentual,
} from "@/lib/format";
import { CardKpi, Painel, SeloMarketplace, SeloMargem } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { MetaFaturamento } from "@/components/dashboard/MetaFaturamento";
import { cn } from "@/lib/utils";
import type { ContaMarketplace, MarketplaceId, Pedido } from "@/types";

interface ResumoCanalVisaoGeral {
  id: MarketplaceId;
  titulo: string;
  pedidos: number;
  faturamento: number;
  lucro: number;
  margem: number;
}

/** Mesma lógica usada em Canais.tsx — reaproveitada aqui pra dar uma visão
 * por canal já na Visão Geral, sem precisar trocar de aba. */
function resumirPorCanalVisaoGeral(atuais: Pedido[]): ResumoCanalVisaoGeral[] {
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

interface ResumoContaVisaoGeral {
  id: string;
  nome: string;
  pedidos: number;
  faturamento: number;
  lucro: number;
  margem: number;
}

/** Mesma quebra por canal, mas por CONTA — pra abrir o canal e ver o
 * resultado de cada loja individual, igual em Canais. */
function resumirPorContaVisaoGeral(
  atuais: Pedido[],
  contasDoCanal: ContaMarketplace[],
): ResumoContaVisaoGeral[] {
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

export function VisaoGeral() {
  const { periodo, preset } = usePeriodo();
  const { filtrarPorSelecao } = useSelecaoContas();
  const { metaFaturamentoMensal, salvarMetaFaturamento, contas } = useConfiguracoes();

  const pedidos = filtrarPorSelecao(vendasService.listar());

  // "Projeção" só faz sentido enquanto o mês está em andamento. Pra qualquer
  // outro período, mostrar uma projeção seria inventar um número — mostramos
  // o que de fato aconteceu ali (fechamento) ou a média diária real.
  const ehMesEmAndamento = preset === "este-mes" || preset === "hoje";
  const ehMesFechado = preset === "mes-passado";

  const dados = useMemo(() => {
    const atuais = filtrarPorPeriodo(pedidos, periodo);
    const anteriores = filtrarPorPeriodo(pedidos, periodoAnterior(periodo));
    return {
      atuais,
      resumo: resumir(atuais),
      resumoAnterior: resumir(anteriores),
      serie: seriePorDia(atuais, periodo),
      projecao: projetarMes(pedidos),
    };
  }, [pedidos, periodo]);

  const { resumo, resumoAnterior, serie, projecao } = dados;

  const porCanal = useMemo(
    () =>
      resumirPorCanalVisaoGeral(dados.atuais).sort((a, b) => b.faturamento - a.faturamento),
    [dados.atuais],
  );

  // Contas por canal, só pra abrir o detalhe na tabela — mesmo padrão de Canais.
  const contasPorCanal = useMemo(() => {
    const mapa = new Map<MarketplaceId, ResumoContaVisaoGeral[]>();
    for (const canal of CANAIS) {
      const doCanal = contas.filter((c) => c.marketplaceId === canal.id);
      mapa.set(canal.id, resumirPorContaVisaoGeral(dados.atuais, doCanal));
    }
    return mapa;
  }, [dados.atuais, contas]);

  const cardTerciario = ehMesEmAndamento
    ? {
        titulo: "Projeção do mês",
        valor: formatBRL(projecao.projetadoFinalMes),
        detalhe: `Média de ${formatBRL(projecao.mediaDiaria)}/dia em ${projecao.diasDecorridos} dias decorridos`,
      }
    : ehMesFechado
      ? {
          titulo: "Fechamento do mês",
          valor: formatBRL(resumo.faturamento),
          detalhe: "Mês encerrado — valor final, sem projeção",
        }
      : {
          titulo: "Média diária do período",
          valor: formatBRL(serie.length ? resumo.faturamento / serie.length : 0),
          detalhe: `No período selecionado (${serie.length} dias)`,
        };

  const drenagem = [
    { rotulo: "CMV (custo do produto)", valor: resumo.cmv },
    { rotulo: "Comissões do marketplace", valor: resumo.comissoes },
    { rotulo: "Impostos", valor: resumo.impostos },
    { rotulo: "Taxas, fretes e descontos", valor: resumo.outrosCustos },
  ];

  const evolucao = [
    {
      rotulo: "Faturamento",
      atual: resumo.faturamento,
      anterior: resumoAnterior.faturamento,
      formato: formatBRL,
    },
    {
      rotulo: "Lucro líquido",
      atual: resumo.lucroLiquido,
      anterior: resumoAnterior.lucroLiquido,
      formato: formatBRL,
    },
    {
      rotulo: "Margem líquida",
      atual: resumo.margem,
      anterior: resumoAnterior.margem,
      formato: (v: number) => formatPercentual(v),
    },
  ];

  const ultimas = dados.atuais.slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Período analisado: <strong>{formatData(periodo.inicio)}</strong> até{" "}
          <strong>{formatData(periodo.fim)}</strong> · dados fictícios de demonstração
        </p>
        <ExportarDados
          nomeArquivo="resumo-dashboard"
          linhas={[
            {
              Faturamento: resumo.faturamento.toFixed(2),
              Pedidos: resumo.pedidos,
              Unidades: resumo.unidades,
              "SKUs distintos": resumo.skusDistintos,
              "Ticket médio": resumo.ticketMedio.toFixed(2),
              CMV: resumo.cmv.toFixed(2),
              Impostos: resumo.impostos.toFixed(2),
              Comissões: resumo.comissoes.toFixed(2),
              "Lucro líquido": resumo.lucroLiquido.toFixed(2),
              Margem: formatPercentual(resumo.margem),
            },
          ]}
        />
      </div>

      <MetaFaturamento
        meta={metaFaturamentoMensal}
        realizado={projecao.realizado}
        onSalvarMeta={salvarMetaFaturamento}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <CardKpi
          titulo="Faturamento"
          valor={formatBRL(resumo.faturamento)}
          variacaoPercentual={variacao(resumo.faturamento, resumoAnterior.faturamento)}
          dica="Soma do valor de todos os pedidos válidos no período."
        />
        <CardKpi
          titulo="Pedidos"
          valor={formatNumero(resumo.pedidos)}
          variacaoPercentual={variacao(resumo.pedidos, resumoAnterior.pedidos)}
        />
        <CardKpi
          titulo="Produtos"
          valor={formatNumero(resumo.unidades)}
          detalhe={`${formatNumero(resumo.skusDistintos)} SKUs distintos`}
          dica="Unidades vendidas no período. Abaixo, quantos produtos diferentes tiveram ao menos 1 venda."
        />
        <CardKpi
          titulo="Ticket médio"
          valor={formatBRL(resumo.ticketMedio)}
          variacaoPercentual={variacao(resumo.ticketMedio, resumoAnterior.ticketMedio)}
        />
        <CardKpi
          titulo="Lucro líquido"
          valor={formatBRL(resumo.lucroLiquido)}
          detalhe={`Margem: ${formatPercentual(resumo.margem)} · Pós-ADS: ${formatBRL(resumo.lucroLiquido - resumo.custoMidia)}`}
          variacaoPercentual={variacao(resumo.lucroLiquido, resumoAnterior.lucroLiquido)}
          destaque
          dica="O que sobra depois de CMV, comissões, taxas, impostos e outros custos. 'Pós-ADS' desconta também o investimento em mídia — veja o detalhe na aba ADS."
        />
        <CardKpi
          titulo={cardTerciario.titulo}
          valor={cardTerciario.valor}
          detalhe={cardTerciario.detalhe}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <CardKpi titulo="CMV" valor={formatBRL(resumo.cmv)} />
        <CardKpi titulo="Impostos" valor={formatBRL(resumo.impostos)} />
        <CardKpi titulo="Comissões" valor={formatBRL(resumo.comissoes)} />
        <CardKpi titulo="Outros custos" valor={formatBRL(resumo.outrosCustos)} />
        <CardKpi titulo="Pedidos cancelados" valor={formatNumero(resumo.pedidosCancelados)} />
        <CardKpi
          titulo="Vendas canceladas"
          valor={formatBRL(resumo.valorCancelado)}
          detalhe="Veja em Recuperação de vendas"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {ehMesEmAndamento ? (
          <Painel
            className="lg:col-span-2"
            titulo="Projeção do mês"
            descricao="Estimativa do faturamento final com base no ritmo de vendas já realizado"
          >
            <div className="h-72 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={projecao.serie}>
                  <defs>
                    <linearGradient id="grad-realizado" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="var(--muted-foreground)"
                    tickFormatter={(v) => formatBRLCompacto(Number(v))}
                  />
                  <ChartTooltip
                    formatter={(v: number | string) => formatBRL(Number(v))}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="realizado"
                    name="Faturamento realizado"
                    stroke="var(--brand)"
                    strokeWidth={2}
                    fill="url(#grad-realizado)"
                  />
                  <Line
                    type="monotone"
                    dataKey="projetado"
                    name="Projeção"
                    stroke="var(--profit)"
                    strokeDasharray="6 6"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-between gap-3 border-t bg-muted/40 px-5 py-3 text-xs">
              <span>
                Realizado até hoje:{" "}
                <strong className="num">{formatBRL(projecao.realizado)}</strong>
              </span>
              <span>
                Projeção no fim do mês:{" "}
                <strong className="num text-profit">
                  {formatBRL(projecao.projetadoFinalMes)}
                </strong>
              </span>
            </div>
          </Painel>
        ) : (
          <Painel
            className="lg:col-span-2"
            titulo="Faturamento no período"
            descricao={
              ehMesFechado
                ? "Dia a dia do mês já encerrado — sem projeção, é o resultado final"
                : "Dia a dia do período selecionado"
            }
          >
            <div className="h-72 p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={serie}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    stroke="var(--muted-foreground)"
                    tickFormatter={(v) => formatBRLCompacto(Number(v))}
                  />
                  <ChartTooltip
                    formatter={(v: number | string) => formatBRL(Number(v))}
                    contentStyle={{ fontSize: 12, borderRadius: 12 }}
                  />
                  <Bar
                    dataKey="faturamento"
                    name="Faturamento"
                    fill="var(--brand)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Painel>
        )}

        <Painel titulo="Para onde vai o seu dinheiro" descricao="Do faturamento até o lucro">
          <div className="space-y-4 p-5">
            <div>
              <div className="mb-2 flex justify-between text-xs">
                <span className="text-muted-foreground">Faturamento bruto</span>
                <span className="num font-semibold">{formatBRL(resumo.faturamento)}</span>
              </div>
              <div className="h-2 w-full rounded-full bg-brand" />
            </div>
            <div className="space-y-2 border-l-2 pl-4">
              {drenagem.map((d) => (
                <div key={d.rotulo} className="flex justify-between text-[11px]">
                  <span className="text-muted-foreground">− {d.rotulo}</span>
                  <span className="num text-loss">{formatBRL(d.valor)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-dashed pt-3 text-sm">
              <span className="font-bold text-profit">Lucro líquido</span>
              <span className="num font-bold text-profit">{formatBRL(resumo.lucroLiquido)}</span>
            </div>
            <p className="rounded-xl bg-brand-soft p-3 text-[11px] leading-relaxed text-muted-foreground">
              De cada R$ 100 vendidos, sobram{" "}
              <strong className="text-brand">{formatBRL(resumo.margem * 100)}</strong> de lucro
              líquido.
            </p>
          </div>
        </Painel>
      </div>

      <Painel
        titulo="Faturamento e lucro por canal"
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

      <div className="grid gap-6 lg:grid-cols-3">
        <Painel
          className="lg:col-span-2"
          titulo="Evolução de rentabilidade"
          descricao="Faturamento e lucro dia a dia no período selecionado"
        >
          <div className="h-64 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={serie}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatBRLCompacto(Number(v))}
                />
                <ChartTooltip
                  formatter={(v: number | string) => formatBRL(Number(v))}
                  contentStyle={{ fontSize: 12, borderRadius: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="faturamento" name="Faturamento" fill="var(--brand)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="lucro" name="Lucro líquido" fill="var(--profit)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        <Painel titulo="Comparativo" descricao="Período atual x período anterior">
          <div className="divide-y">
            {evolucao.map((e) => {
              const v = variacao(e.atual, e.anterior);
              return (
                <div key={e.rotulo} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-xs font-semibold">{e.rotulo}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Anterior: <span className="num">{e.formato(e.anterior)}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="num text-sm font-bold">{e.formato(e.atual)}</p>
                    <p className={`num text-[11px] font-bold ${v >= 0 ? "text-profit" : "text-loss"}`}>
                      {v >= 0 ? "+" : "−"}
                      {formatPercentual(Math.abs(v))}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Painel>
      </div>

      <Painel
        titulo="Últimas vendas"
        descricao="As vendas mais recentes do período"
        acoes={
          <Link
            to="/vendas"
            className="text-xs font-semibold text-brand transition-opacity hover:opacity-70"
          >
            Ver todas
          </Link>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-5 py-3 font-bold">Data / Pedido</th>
                <th className="px-5 py-3 font-bold">Marketplace</th>
                <th className="px-5 py-3 font-bold">Produto</th>
                <th className="px-5 py-3 text-right font-bold">Venda</th>
                <th className="px-5 py-3 text-right font-bold">Lucro</th>
                <th className="px-5 py-3 text-center font-bold">Margem</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ultimas.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-5 py-3">
                    <p className="text-xs font-medium">{formatData(p.data)}</p>
                    <p className="num text-[10px] text-muted-foreground">#{p.id}</p>
                  </td>
                  <td className="px-5 py-3">
                    <SeloMarketplace id={p.marketplaceId} />
                  </td>
                  <td className="max-w-[280px] px-5 py-3">
                    <p className="truncate text-xs font-medium">{p.produto}</p>
                    <p className="num text-[10px] text-muted-foreground">SKU: {p.sku}</p>
                  </td>
                  <td className="num px-5 py-3 text-right text-xs font-semibold">
                    {formatBRL(p.faturamento)}
                  </td>
                  <td
                    className={`num px-5 py-3 text-right text-xs font-bold ${
                      p.lucroLiquido >= 0 ? "text-profit" : "text-loss"
                    }`}
                  >
                    {formatBRL(p.lucroLiquido)}
                  </td>
                  <td className="px-5 py-3 text-center">
                    <SeloMargem margem={p.margem} />
                  </td>
                </tr>
              ))}
              {ultimas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-xs text-muted-foreground">
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
