import { Fragment, useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePeriodo } from "@/context/periodo";
import { inicioDoDia, listarDias, periodoAnterior } from "@/lib/period";
import { useSelecaoContas } from "@/context/selecao-contas";
import { useConfiguracoes } from "@/context/configuracoes";
import { vendasService } from "@/services";
import { CANAIS } from "@/config/navegacao";
import { agruparPorSkuComAds, filtrarPorPeriodo, resumir, variacao } from "@/lib/finance";
import { formatBRL, formatBRLCompacto, formatNumero, formatPercentual } from "@/lib/format";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { cn } from "@/lib/utils";
import type { ContaMarketplace, MarketplaceId, Pedido, Periodo } from "@/types";

/**
 * O sistema ainda não tem a conexão com a API de anúncios de cada
 * marketplace — por isso não sabemos impressões e cliques de verdade.
 * Estimamos os dois a partir de taxas de mercado plausíveis, aplicadas aos
 * pedidos que realmente vieram de ADS (custoMidia > 0). Quando a API entrar,
 * essas duas contas somem e entram os números reais no lugar.
 */
const TAXA_CONVERSAO_ASSUMIDA = 0.06; // cliques → pedido
const CTR_ASSUMIDO = 0.02; // impressões → clique

interface PontoFunil {
  dia: string;
  faturamento: number;
  investimento: number;
  pedidosAds: number;
  faturamentoAds: number;
  cliques: number;
  impressoes: number;
}

function serieFunilAds(pedidos: Pedido[], periodo: Periodo): PontoFunil[] {
  const mapa = new Map<string, Omit<PontoFunil, "cliques" | "impressoes">>();
  for (const dia of listarDias(periodo)) {
    mapa.set(inicioDoDia(dia).toDateString(), {
      dia: dia.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      faturamento: 0,
      investimento: 0,
      pedidosAds: 0,
      faturamentoAds: 0,
    });
  }
  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    const ponto = mapa.get(inicioDoDia(new Date(p.data)).toDateString());
    if (!ponto) continue;
    ponto.faturamento += p.faturamento;
    ponto.investimento += p.custoMidia;
    if (p.custoMidia > 0) {
      ponto.pedidosAds += 1;
      ponto.faturamentoAds += p.faturamento;
    }
  }
  return [...mapa.values()].map((p) => {
    const cliques = p.pedidosAds > 0 ? Math.round(p.pedidosAds / TAXA_CONVERSAO_ASSUMIDA) : 0;
    return { ...p, cliques, impressoes: Math.round(cliques / CTR_ASSUMIDO) };
  });
}

interface ResumoContaAds {
  id: string;
  nome: string;
  gasto: number;
  faturamento: number;
  roas: number;
  tacos: number;
}

/** Mesma lógica do resumo por canal, mas por CONTA — pra abrir o canal e ver
 * o gasto de ADS de cada loja individual, igual já é feito em Canais. */
function resumirContasAds(
  pedidos: Pedido[],
  contasDoCanal: ContaMarketplace[],
): ResumoContaAds[] {
  return contasDoCanal
    .map((conta) => {
      const daConta = pedidos.filter((p) => p.contaId === conta.id && p.status !== "cancelado");
      const gasto = daConta.reduce((s, p) => s + p.custoMidia, 0);
      const daContaAds = daConta.filter((p) => p.custoMidia > 0);
      const fatAds = daContaAds.reduce((s, p) => s + p.faturamento, 0);
      const faturamento = daConta.reduce((s, p) => s + p.faturamento, 0);
      return {
        id: conta.id,
        nome: conta.nome,
        gasto,
        faturamento,
        roas: gasto > 0 ? fatAds / gasto : 0,
        tacos: faturamento ? gasto / faturamento : 0,
      };
    })
    .filter((c) => c.gasto > 0 || c.faturamento > 0);
}

export function Ads() {
  const { periodo } = usePeriodo();
  const { filtrarPorSelecao } = useSelecaoContas();
  const { contas } = useConfiguracoes();
  const pedidos = filtrarPorSelecao(vendasService.listar());

  const dados = useMemo(() => {
    const atuais = filtrarPorPeriodo(pedidos, periodo);
    const anteriores = filtrarPorPeriodo(pedidos, periodoAnterior(periodo));
    const pedidosAds = atuais.filter((p) => p.custoMidia > 0 && p.status !== "cancelado");
    const pedidosAdsAnterior = anteriores.filter(
      (p) => p.custoMidia > 0 && p.status !== "cancelado",
    );
    return {
      atuais,
      resumo: resumir(atuais),
      resumoAnterior: resumir(anteriores),
      pedidosAds,
      faturamentoAds: pedidosAds.reduce((s, p) => s + p.faturamento, 0),
      faturamentoAdsAnterior: pedidosAdsAnterior.reduce((s, p) => s + p.faturamento, 0),
      funil: serieFunilAds(atuais, periodo),
    };
  }, [pedidos, periodo]);

  const { resumo, resumoAnterior, atuais, pedidosAds, faturamentoAds, faturamentoAdsAnterior, funil } =
    dados;

  const investimento = resumo.custoMidia;
  const investimentoAnterior = resumoAnterior.custoMidia;
  const qtdPedidosAds = pedidosAds.length;
  const totalCliques = funil.reduce((s, d) => s + d.cliques, 0);
  const totalImpressoes = funil.reduce((s, d) => s + d.impressoes, 0);

  const roas = investimento > 0 ? faturamentoAds / investimento : 0;
  const roasAnterior = investimentoAnterior > 0 ? faturamentoAdsAnterior / investimentoAnterior : 0;
  const acos = faturamentoAds > 0 ? investimento / faturamentoAds : 0;
  const tacos = resumo.faturamento ? investimento / resumo.faturamento : 0;
  const cpc = totalCliques > 0 ? investimento / totalCliques : 0;
  const cpm = totalImpressoes > 0 ? (investimento / totalImpressoes) * 1000 : 0;
  const ctr = totalImpressoes > 0 ? totalCliques / totalImpressoes : 0;
  const taxaConversao = totalCliques > 0 ? qtdPedidosAds / totalCliques : 0;
  const ticketMedioAds = qtdPedidosAds > 0 ? faturamentoAds / qtdPedidosAds : 0;
  const lucroPosAds = resumo.lucroLiquido - investimento;

  const porCanal = useMemo(() => {
    return CANAIS.map((canal) => {
      const doCanal = atuais.filter(
        (p) => p.marketplaceId === canal.id && p.status !== "cancelado",
      );
      const gasto = doCanal.reduce((s, p) => s + p.custoMidia, 0);
      const doCanalAds = doCanal.filter((p) => p.custoMidia > 0);
      const fatAds = doCanalAds.reduce((s, p) => s + p.faturamento, 0);
      return {
        id: canal.id,
        titulo: canal.titulo,
        gasto,
        faturamento: doCanal.reduce((s, p) => s + p.faturamento, 0),
        roas: gasto > 0 ? fatAds / gasto : 0,
        tacos: doCanal.length ? gasto / doCanal.reduce((s, p) => s + p.faturamento, 0) : 0,
      };
    }).filter((c) => c.gasto > 0 || c.faturamento > 0);
  }, [atuais]);

  // Contas por canal, só pra abrir o detalhe na tabela — mesmo padrão da aba
  // Canais: uma conta desmarcada no filtro global simplesmente não aparece.
  const contasPorCanal = useMemo(() => {
    const mapa = new Map<MarketplaceId, ResumoContaAds[]>();
    for (const canal of CANAIS) {
      const doCanal = contas.filter((c) => c.marketplaceId === canal.id);
      mapa.set(canal.id, resumirContasAds(atuais, doCanal));
    }
    return mapa;
  }, [atuais, contas]);

  const semRetorno = useMemo(
    () =>
      agruparPorSkuComAds(atuais)
        .filter((i) => i.semRetorno)
        .sort((a, b) => b.custoMidia - a.custoMidia)
        .slice(0, 8),
    [atuais],
  );

  // Mesmas linhas da tabela "ADS por canal" — canal e, quando tem mais de
  // uma conta, cada loja individual logo abaixo — prontas pra exportar.
  const linhasExport = useMemo(() => {
    const linhas: Record<string, string | number>[] = [];
    for (const c of porCanal) {
      linhas.push({
        Canal: c.titulo,
        Conta: "Total do canal",
        Investimento: c.gasto.toFixed(2),
        ROAS: `${c.roas.toFixed(2)}x`,
        TACOS: formatPercentual(c.tacos),
      });
      for (const conta of contasPorCanal.get(c.id) ?? []) {
        linhas.push({
          Canal: c.titulo,
          Conta: conta.nome,
          Investimento: conta.gasto.toFixed(2),
          ROAS: `${conta.roas.toFixed(2)}x`,
          TACOS: formatPercentual(conta.tacos),
        });
      }
    }
    return linhas;
  }, [porCanal, contasPorCanal]);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportarDados nomeArquivo="ads" linhas={linhasExport} />
      </div>

      <div className="rounded-xl bg-muted/40 px-4 py-2.5 text-[11px] text-muted-foreground">
        <strong>Cliques e impressões são estimados</strong> (conversão de {formatPercentual(TAXA_CONVERSAO_ASSUMIDA)} e
        CTR de {formatPercentual(CTR_ASSUMIDO)} assumidos) — ainda não temos a conexão com a API de
        anúncios de cada marketplace. Os demais números são calculados de verdade a partir dos seus pedidos.
      </div>

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <CardKpi
          titulo="Faturamento total"
          valor={formatBRL(resumo.faturamento)}
          variacaoPercentual={variacao(resumo.faturamento, resumoAnterior.faturamento)}
        />
        <CardKpi
          titulo="Investimento total"
          valor={formatBRL(investimento)}
          variacaoPercentual={variacao(investimento, investimentoAnterior)}
        />
        <CardKpi
          titulo="ROAS"
          valor={`${roas.toFixed(2)}x`}
          detalhe={`${roas >= roasAnterior ? "+" : "−"}${Math.abs(roas - roasAnterior).toFixed(2)}x vs. anterior`}
          dica="Faturamento vindo de ADS dividido pelo investimento. Quanto maior, melhor: 5x significa R$5 de venda pra cada R$1 investido."
        />
        <CardKpi
          titulo="ACOS"
          valor={formatPercentual(acos)}
          dica="Investimento dividido pelo faturamento vindo de ADS (não o faturamento total — isso é o TACOS). Quanto menor, melhor."
        />
        <CardKpi titulo="Pedidos via ADS" valor={formatNumero(qtdPedidosAds)} />
        <CardKpi
          titulo="Cliques (estimado)"
          valor={formatNumero(totalCliques)}
          detalhe={`${formatNumero(totalImpressoes)} impressões`}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
        <CardKpi titulo="Impressões (estimado)" valor={formatNumero(totalImpressoes)} />
        <CardKpi titulo="CPC (estimado)" valor={formatBRL(cpc)} dica="Investimento ÷ cliques estimados." />
        <CardKpi titulo="CTR (assumido)" valor={formatPercentual(ctr)} />
        <CardKpi
          titulo="Conversão"
          valor={formatPercentual(taxaConversao)}
          dica="Pedidos via ADS ÷ cliques estimados."
        />
        <CardKpi titulo="Ticket médio via ADS" valor={formatBRL(ticketMedioAds)} />
        <CardKpi titulo="CPM (estimado)" valor={formatBRL(cpm)} dica="Investimento a cada 1.000 impressões." />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CardKpi
          titulo="TACOS"
          valor={formatPercentual(tacos)}
          dica="Investimento ÷ faturamento TOTAL (não só o de ADS). É o termômetro de quanto a mídia pesa no seu resultado geral."
        />
        <CardKpi
          titulo="Lucro pós-ADS"
          valor={formatBRL(lucroPosAds)}
          detalhe={`Lucro antes de ADS: ${formatBRL(resumo.lucroLiquido)}`}
          destaque
        />
      </div>

      <Painel
        titulo="Faturamento x investimento"
        descricao="Linha: faturamento total do dia · Barra: investimento em ADS do dia"
      >
        <div className="h-72 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={funil}>
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
                tickFormatter={(v) => formatBRLCompacto(Number(v))}
              />
              <ChartTooltip
                formatter={(v: number | string) => formatBRL(Number(v))}
                contentStyle={{ fontSize: 12, borderRadius: 12 }}
              />
              <Bar yAxisId="dir" dataKey="investimento" name="Investimento" fill="var(--warning)" radius={[6, 6, 0, 0]} />
              <Line
                yAxisId="esq"
                type="monotone"
                dataKey="faturamento"
                name="Faturamento"
                stroke="var(--brand)"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Painel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Painel
          titulo="Impressões x cliques (estimado)"
          descricao="Funil estimado a partir dos pedidos vindos de ADS"
        >
          <div className="h-60 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={funil}>
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
                  tickFormatter={(v) => formatBRLCompacto(Number(v))}
                />
                <ChartTooltip
                  formatter={(v: number | string) => formatNumero(Number(v))}
                  contentStyle={{ fontSize: 12, borderRadius: 12 }}
                />
                <Line
                  yAxisId="esq"
                  type="monotone"
                  dataKey="impressoes"
                  name="Impressões"
                  stroke="var(--brand)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  yAxisId="dir"
                  type="monotone"
                  dataKey="cliques"
                  name="Cliques"
                  stroke="var(--warning)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        <Painel titulo="Pedidos via ADS por dia" descricao="Vendas atribuídas a anúncios patrocinados">
          <div className="h-60 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={funil}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" allowDecimals={false} />
                <ChartTooltip
                  formatter={(v: number | string) => formatNumero(Number(v))}
                  contentStyle={{ fontSize: 12, borderRadius: 12 }}
                />
                <Bar dataKey="pedidosAds" name="Pedidos via ADS" fill="var(--brand)" radius={[6, 6, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Painel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Painel titulo="ADS por canal" descricao="Investimento, ROAS e TACOS de cada canal">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-left">
              <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Canal</th>
                  <th className="px-3 py-2.5 text-right font-medium">Investimento</th>
                  <th className="px-3 py-2.5 text-right font-medium">ROAS</th>
                  <th className="px-3 py-2.5 text-right font-medium">TACOS</th>
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
                        <td className="num px-3 py-3 text-right text-xs font-semibold">
                          {formatBRL(c.gasto)}
                        </td>
                        <td className="num px-3 py-3 text-right text-xs font-bold text-profit">
                          {c.roas.toFixed(2)}x
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

                      {temVariasContas &&
                        contasDoCanal.map((conta) => (
                          <tr key={conta.id} className="border-b last:border-0">
                            <td className="py-2.5 pl-11 pr-5">
                              <span className="text-[11px] text-muted-foreground">
                                {conta.nome}
                              </span>
                            </td>
                            <td className="num px-3 py-2.5 text-right text-[11px] text-muted-foreground">
                              {formatBRL(conta.gasto)}
                            </td>
                            <td className="num px-3 py-2.5 text-right text-[11px] text-muted-foreground">
                              {conta.roas.toFixed(2)}x
                            </td>
                            <td className="num px-3 py-2.5 text-right text-[11px] text-muted-foreground">
                              {formatPercentual(conta.tacos)}
                            </td>
                          </tr>
                        ))}
                    </Fragment>
                  );
                })}
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
            {semRetorno.map((item) => {
              const precoMedio = item.quantidade > 0 ? item.faturamento / item.quantidade : 0;
              return (
                <div key={item.sku} className="space-y-1.5 px-5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-xs font-medium">{item.produto}</p>
                    <p className="num shrink-0 text-[10px] text-muted-foreground">{item.sku}</p>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-muted-foreground">
                      Vendeu {formatNumero(item.quantidade)}x × {formatBRL(precoMedio)}
                    </span>
                    <span className="num font-semibold">= {formatBRL(item.faturamento)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3 text-[11px]">
                    <span className="text-muted-foreground">Gasto com ADS</span>
                    <span className="num font-semibold text-loss">− {formatBRL(item.custoMidia)}</span>
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t pt-1.5 text-[11px]">
                    <span className="text-muted-foreground">
                      {item.lucroPosAds < 0 ? "Ficou no vermelho" : "Sobrou de lucro"}
                    </span>
                    <span
                      className={cn(
                        "num text-sm font-bold",
                        item.lucroPosAds < 0 ? "text-loss" : "text-profit",
                      )}
                    >
                      {formatBRL(item.lucroPosAds)}
                    </span>
                  </div>
                </div>
              );
            })}
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
