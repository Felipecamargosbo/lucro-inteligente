import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePeriodo } from "@/context/periodo";
import { useSelecaoContas } from "@/context/selecao-contas";
import { useConfiguracoes } from "@/context/configuracoes";
import { vendasService } from "@/services";
import {
  filtrarPorPeriodo,
  projetarMes,
  resumir,
  serieSaudeMargem,
  seriePorDia,
  variacao,
  type PontoDia,
  type PontoSaudeMargem,
} from "@/lib/finance";
import { periodoAnterior } from "@/lib/period";
import {
  formatBRL,
  formatBRLCompacto,
  formatData,
  formatNumero,
  formatPercentual,
} from "@/lib/format";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";

/* ------------------------------------------------------------------ */
/* Tooltips                                                            */
/* ------------------------------------------------------------------ */

function LinhaTooltip({
  cor,
  rotulo,
  valor,
}: {
  cor?: string;
  rotulo: string;
  valor: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 text-[11px]">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {cor && <span className="size-2 rounded-full" style={{ background: cor }} />}
        {rotulo}
      </span>
      <span className="num font-semibold">{valor}</span>
    </div>
  );
}

/** Tooltip do Resumo de receitas: além das linhas do gráfico, mostra ticket
 * médio, vendas e unidades daquele dia — números de escala bem diferente,
 * que ficariam ilegíveis se virassem linha no mesmo eixo. */
function TooltipReceitas(props: {
  active?: boolean;
  payload?: { payload?: PontoDia }[];
}) {
  const ponto = props.payload?.[0]?.payload;
  if (!props.active || !ponto) return null;

  return (
    <div className="min-w-52 rounded-xl border bg-card p-3 shadow-float">
      <p className="mb-2 text-[11px] font-bold">{ponto.dia}</p>
      <div className="space-y-1">
        <LinhaTooltip
          cor="var(--brand)"
          rotulo="Faturamento"
          valor={formatBRL(ponto.faturamento)}
        />
        <LinhaTooltip
          cor="var(--info)"
          rotulo="Líq. do marketplace"
          valor={formatBRL(ponto.liquidoMarketplace)}
        />
        <LinhaTooltip cor="var(--profit)" rotulo="Lucro" valor={formatBRL(ponto.lucro)} />
        <div className="mt-2 space-y-1 border-t pt-2">
          <LinhaTooltip rotulo="Ticket médio" valor={formatBRL(ponto.ticketMedio)} />
          <LinhaTooltip rotulo="Vendas" valor={formatNumero(ponto.pedidos)} />
          <LinhaTooltip rotulo="Unidades vendidas" valor={formatNumero(ponto.unidades)} />
        </div>
      </div>
    </div>
  );
}

function TooltipSaude(props: {
  active?: boolean;
  payload?: { payload?: PontoSaudeMargem }[];
}) {
  const ponto = props.payload?.[0]?.payload;
  if (!props.active || !ponto) return null;

  const detalhe = (percentual: number, qtd: number, valor: number) =>
    `${percentual.toFixed(1)}%  ·  ${formatNumero(qtd)} ped.  ·  ${formatBRL(valor)}`;

  return (
    <div className="min-w-60 rounded-xl border bg-card p-3 shadow-float">
      <p className="mb-2 text-[11px] font-bold">{ponto.dia}</p>
      <div className="space-y-1">
        <LinhaTooltip
          cor="var(--profit)"
          rotulo="Excelente"
          valor={detalhe(ponto.excelente, ponto.qtdExcelente, ponto.valorExcelente)}
        />
        <LinhaTooltip
          cor="var(--warning)"
          rotulo="Saudável"
          valor={detalhe(ponto.saudavel, ponto.qtdSaudavel, ponto.valorSaudavel)}
        />
        <LinhaTooltip
          cor="var(--loss)"
          rotulo="Crítica"
          valor={detalhe(ponto.critica, ponto.qtdCritica, ponto.valorCritica)}
        />
      </div>
    </div>
  );
}

function LegendaFaixa({ cor, texto }: { cor: string; texto: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className="size-2 rounded-full" style={{ background: cor }} />
      {texto}
    </span>
  );
}

/* ------------------------------------------------------------------ */

export function VisaoGeral() {
  const { periodo, preset } = usePeriodo();
  const { filtrarPorSelecao } = useSelecaoContas();
  const { metasPorConta } = useConfiguracoes();

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
      saude: serieSaudeMargem(atuais, periodo, metasPorConta),
      projecao: projetarMes(pedidos),
    };
  }, [pedidos, periodo, metasPorConta]);

  const { resumo, resumoAnterior, serie, saude, projecao } = dados;

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

  const mediaDiariaPeriodo = serie.length ? resumo.faturamento / serie.length : 0;

  const percentualLiquido = resumo.faturamento
    ? resumo.liquidoMarketplace / resumo.faturamento
    : 0;

  // Linha única com TODOS os indicadores gerais, coluna por coluna.
  const linhasResumoExport = useMemo(
    () => [
      {
        Faturamento: formatBRL(resumo.faturamento),
        "Líquido do marketplace": formatBRL(resumo.liquidoMarketplace),
        Pedidos: resumo.pedidos,
        Unidades: resumo.unidades,
        "SKUs distintos": resumo.skusDistintos,
        "Ticket médio": formatBRL(resumo.ticketMedio),
        "Média diária do período": formatBRL(mediaDiariaPeriodo),
        CMV: formatBRL(resumo.cmv),
        Impostos: formatBRL(resumo.impostos),
        Comissões: formatBRL(resumo.comissoes),
        "Outros custos": formatBRL(resumo.outrosCustos),
        "Pedidos cancelados": resumo.pedidosCancelados,
        "Vendas canceladas": formatBRL(resumo.valorCancelado),
        "Lucro líquido": formatBRL(resumo.lucroLiquido),
        Margem: formatPercentual(resumo.margem),
      },
    ],
    [resumo, mediaDiariaPeriodo],
  );

  const linhasDiaExport = useMemo(
    () =>
      serie.map((d) => ({
        Dia: d.dia,
        Faturamento: formatBRL(d.faturamento),
        "Líquido do marketplace": formatBRL(d.liquidoMarketplace),
        Lucro: formatBRL(d.lucro),
        "Ticket médio": formatBRL(d.ticketMedio),
        Vendas: d.pedidos,
        Unidades: d.unidades,
      })),
    [serie],
  );

  const secoesExport = useMemo(
    () => [
      { titulo: "Resumo geral", linhas: linhasResumoExport },
      { titulo: "Resumo de receitas (dia a dia)", linhas: linhasDiaExport },
    ],
    [linhasResumoExport, linhasDiaExport],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Período analisado: <strong>{formatData(periodo.inicio)}</strong> até{" "}
          <strong>{formatData(periodo.fim)}</strong> · dados fictícios de demonstração
        </p>
        <ExportarDados nomeArquivo="resumo-dashboard" secoes={secoesExport} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Faturamento"
          valor={formatBRL(resumo.faturamento)}
          variacaoPercentual={variacao(resumo.faturamento, resumoAnterior.faturamento)}
          dica="Soma do valor de todos os pedidos válidos no período."
        />
        <CardKpi
          titulo="Líq. do marketplace"
          valor={formatBRL(resumo.liquidoMarketplace)}
          detalhe={`${formatPercentual(percentualLiquido)} do faturamento`}
          variacaoPercentual={variacao(
            resumo.liquidoMarketplace,
            resumoAnterior.liquidoMarketplace,
          )}
          dica="O que o canal realmente repassa: faturamento menos comissão e taxa fixa. Ainda saem daqui o custo do produto e os impostos."
        />
        <CardKpi
          titulo="Lucro líquido"
          valor={formatBRL(resumo.lucroLiquido)}
          detalhe="Depois de CMV, comissões, taxas e impostos"
          variacaoPercentual={variacao(resumo.lucroLiquido, resumoAnterior.lucroLiquido)}
          destaque
        />
        <CardKpi
          titulo="Margem líquida"
          valor={formatPercentual(resumo.margem)}
          detalhe={`De cada R$ 100 vendidos, sobram ${formatBRL(resumo.margem * 100)}`}
          variacaoPercentual={variacao(resumo.margem, resumoAnterior.margem)}
        />
        <CardKpi
          titulo="Nº de vendas"
          valor={formatNumero(resumo.pedidos)}
          variacaoPercentual={variacao(resumo.pedidos, resumoAnterior.pedidos)}
        />
        <CardKpi
          titulo="Unidades vendidas"
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

      <Painel
        titulo="Resumo de receitas"
        descricao="Faturamento, o que o canal repassa e o que sobra de lucro, dia a dia"
        acoes={
          <div className="flex flex-wrap items-center gap-3">
            <LegendaFaixa cor="var(--brand)" texto="Faturamento" />
            <LegendaFaixa cor="var(--info)" texto="Líq. do marketplace" />
            <LegendaFaixa cor="var(--profit)" texto="Lucro" />
          </div>
        }
      >
        <div className="h-80 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serie}>
              <defs>
                <linearGradient id="grad-faturamento" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-liquido" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--info)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="var(--info)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="grad-lucro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--profit)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--profit)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
                tickFormatter={(v) => formatBRLCompacto(Number(v))}
              />
              <ChartTooltip content={<TooltipReceitas />} />
              <Area
                type="monotone"
                dataKey="faturamento"
                name="Faturamento"
                stroke="var(--brand)"
                strokeWidth={2}
                fill="url(#grad-faturamento)"
              />
              <Area
                type="monotone"
                dataKey="liquidoMarketplace"
                name="Líq. do marketplace"
                stroke="var(--info)"
                strokeWidth={2}
                fill="url(#grad-liquido)"
              />
              <Area
                type="monotone"
                dataKey="lucro"
                name="Lucro"
                stroke="var(--profit)"
                strokeWidth={2}
                fill="url(#grad-lucro)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Painel>

      <Painel
        titulo="Saúde de margem"
        descricao="Quantos % dos pedidos de cada dia ficaram em cada faixa de margem, segundo as metas das suas contas"
        acoes={
          <div className="flex flex-wrap items-center gap-3">
            <LegendaFaixa cor="var(--profit)" texto="Excelente" />
            <LegendaFaixa cor="var(--warning)" texto="Saudável" />
            <LegendaFaixa cor="var(--loss)" texto="Crítica" />
          </div>
        }
      >
        <div className="h-72 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={saude}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
                tickFormatter={(v) => `${Number(v)}%`}
              />
              <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<TooltipSaude />} />
              <Bar dataKey="critica" name="Crítica" stackId="saude" fill="var(--loss)" />
              <Bar dataKey="saudavel" name="Saudável" stackId="saude" fill="var(--warning)" />
              <Bar
                dataKey="excelente"
                name="Excelente"
                stackId="saude"
                fill="var(--profit)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="border-t bg-muted/40 px-5 py-3 text-[11px] text-muted-foreground">
          As faixas seguem a meta de margem de cada conta (Configurações → Metas de margem por
          conta). Contas sem meta cadastrada usam 10% como mínimo e 20% como ideal.
        </p>
      </Painel>
    </div>
  );
}
