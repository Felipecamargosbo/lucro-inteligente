import { useMemo } from "react";
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
import { CANAIS } from "@/config/navegacao";
import { filtrarPorPeriodo, periodoDaCompetencia, rotuloCompetencia } from "@/lib/finance";
import { formatBRL, formatBRLCompacto, formatData, formatNumero, formatPercentual } from "@/lib/format";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { ExportarDados } from "@/components/comum/ExportarDados";
import type { ContaMarketplace, Empresa, MarketplaceId, Pedido } from "@/types";

const MS_POR_DIA = 86400000;

type FaixaId = "recebido" | "7" | "15" | "30" | "30+";

const FAIXAS: { id: FaixaId; rotulo: string; teste: (dias: number) => boolean }[] = [
  { id: "recebido", rotulo: "Já recebido", teste: (d) => d <= 0 },
  { id: "7", rotulo: "Próx. 7 dias", teste: (d) => d > 0 && d <= 7 },
  { id: "15", rotulo: "8–15 dias", teste: (d) => d > 7 && d <= 15 },
  { id: "30", rotulo: "16–30 dias", teste: (d) => d > 15 && d <= 30 },
  { id: "30+", rotulo: "Mais de 30 dias", teste: (d) => d > 30 },
];

const COR_FAIXA: Record<FaixaId, string> = {
  recebido: "var(--profit)",
  "7": "var(--brand)",
  "15": "var(--brand)",
  "30": "var(--warning)",
  "30+": "var(--loss)",
};

interface ResumoEscopo {
  prazoMedioDias: number;
  recebido: number;
  pendente: number;
  valorDevolvido: number;
  pedidosDevolvidos: number;
  faturamento: number;
}

/** Resume recebíveis/devoluções de um conjunto de pedidos já filtrado. Olha
 * PARCELA a parcela (não pedido a pedido): uma venda parcelada no Magalu
 * pode ter metade já recebida e metade ainda por vir. */
function resumirEscopo(pedidosDoEscopo: Pedido[], hoje: Date): ResumoEscopo {
  if (pedidosDoEscopo.length === 0) {
    return {
      prazoMedioDias: 0,
      recebido: 0,
      pendente: 0,
      valorDevolvido: 0,
      pedidosDevolvidos: 0,
      faturamento: 0,
    };
  }

  let recebido = 0;
  let pendente = 0;
  let prazoPonderado = 0;
  let valorComRepasse = 0;

  for (const p of pedidosDoEscopo) {
    const dataVenda = new Date(p.data).getTime();
    for (const r of p.repasses) {
      const dataRepasse = new Date(r.data).getTime();
      const diasDaVenda = Math.round((dataRepasse - dataVenda) / MS_POR_DIA);
      prazoPonderado += diasDaVenda * r.valor;
      valorComRepasse += r.valor;

      const diasAteHoje = Math.ceil((dataRepasse - hoje.getTime()) / MS_POR_DIA);
      if (diasAteHoje <= 0) recebido += r.valor;
      else pendente += r.valor;
    }
  }

  const devolvidosDoEscopo = pedidosDoEscopo.filter((p) => p.valorDevolvido > 0);
  return {
    prazoMedioDias: valorComRepasse > 0 ? Math.round(prazoPonderado / valorComRepasse) : 0,
    recebido,
    pendente,
    valorDevolvido: devolvidosDoEscopo.reduce((s, p) => s + p.valorDevolvido, 0),
    pedidosDevolvidos: devolvidosDoEscopo.length,
    faturamento: pedidosDoEscopo.reduce((s, p) => s + p.faturamento, 0),
  };
}

interface ResumoCanalFinanceiro extends ResumoEscopo {
  id: MarketplaceId;
  titulo: string;
}

interface RecebiveisProps {
  pedidos: Pedido[];
  contas: ContaMarketplace[];
  empresa: Empresa;
  competencia: string;
}

export function Recebiveis({ pedidos, contas, empresa, competencia }: RecebiveisProps) {
  const dados = useMemo(() => {
    const hoje = new Date();
    const contasDaEmpresa = contas.filter((c) => c.empresaId === empresa.id);
    const idsDaEmpresa = new Set(contasDaEmpresa.map((c) => c.id));
    const periodo = periodoDaCompetencia(competencia);

    const atuais = filtrarPorPeriodo(
      pedidos.filter((p) => idsDaEmpresa.has(p.contaId) && p.status !== "cancelado"),
      periodo,
    );

    const porFaixa = FAIXAS.map((faixa) => ({ ...faixa, valor: 0 }));
    for (const p of atuais) {
      for (const r of p.repasses) {
        const dias = Math.ceil((new Date(r.data).getTime() - hoje.getTime()) / MS_POR_DIA);
        const faixa = porFaixa.find((f) => f.teste(dias));
        if (faixa) faixa.valor += r.valor;
      }
    }

    const { recebido, pendente, valorDevolvido, pedidosDevolvidos, faturamento: faturamentoBruto } =
      resumirEscopo(atuais, hoje);

    const porCanal: ResumoCanalFinanceiro[] = CANAIS.map((canal) => {
      const doCanal = atuais.filter((p) => p.marketplaceId === canal.id);
      return { id: canal.id, titulo: canal.titulo, ...resumirEscopo(doCanal, hoje) };
    }).filter((c) => c.faturamento > 0);

    const devolvidos = atuais.filter((p) => p.valorDevolvido > 0);
    const recentes = devolvidos
      .slice()
      .sort((a, b) => +new Date(b.dataDevolucao ?? b.data) - +new Date(a.dataDevolucao ?? a.data))
      .slice(0, 8);

    return {
      atuais,
      porFaixa,
      recebido,
      pendente,
      faturamentoBruto,
      valorDevolvido,
      pedidosDevolvidos,
      porCanal,
      recentes,
    };
  }, [pedidos, contas, empresa.id, competencia]);

  const {
    atuais,
    porFaixa,
    recebido,
    pendente,
    faturamentoBruto,
    valorDevolvido,
    pedidosDevolvidos,
    porCanal,
    recentes,
  } = dados;

  const linhasExport = useMemo(
    () =>
      porCanal.map((c) => ({
        Canal: c.titulo,
        "Prazo médio (dias)": c.prazoMedioDias,
        Recebido: c.recebido.toFixed(2),
        "A receber": c.pendente.toFixed(2),
        "Pedidos devolvidos": c.pedidosDevolvidos,
        "Valor devolvido": c.valorDevolvido.toFixed(2),
        "% devolução do canal": c.faturamento
          ? formatPercentual(c.valorDevolvido / c.faturamento)
          : "—",
      })),
    [porCanal],
  );

  const proximos7 = porFaixa.find((f) => f.id === "7")?.valor ?? 0;
  const mais30 = porFaixa.find((f) => f.id === "30+")?.valor ?? 0;
  const percentualDevolucao = faturamentoBruto ? valorDevolvido / faturamentoBruto : 0;
  const faturamentoLiquido = faturamentoBruto - valorDevolvido;

  if (atuais.length === 0) {
    return (
      <Painel titulo="Recebíveis" descricao="Quanto do faturamento do mês já caiu na conta e quanto ainda está para vir">
        <div className="px-5 py-14 text-center text-sm text-muted-foreground">
          Nenhuma venda desta empresa em {rotuloCompetencia(competencia)}.
        </div>
      </Painel>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <ExportarDados nomeArquivo="recebiveis" linhas={linhasExport} />
      </div>

      <div className="rounded-xl bg-muted/40 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        Prazo de repasse e devoluções das vendas de <strong>{rotuloCompetencia(competencia)}</strong>{" "}
        de {empresa.nomeFantasia} — <strong>dados fictícios de demonstração</strong>. Repare que o
        DRE fecha pela data da venda e este quadro mostra quando o dinheiro realmente cai na conta:
        os dois números nunca vão bater exatamente com o extrato do banco, e isso é esperado, não é
        erro. Quando as APIs dos marketplaces forem conectadas, a data de repasse e a devolução virão
        direto do canal, em vez de estimadas.
      </div>

      <Painel
        titulo="Recebíveis"
        descricao="Quanto do faturamento do mês já caiu na conta e quanto ainda está para vir"
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <CardKpi
            titulo="Já recebido"
            valor={formatBRL(recebido)}
            detalhe={faturamentoBruto ? `${formatPercentual(recebido / faturamentoBruto)} do faturamento` : undefined}
            destaque
          />
          <CardKpi
            titulo="A receber"
            valor={formatBRL(pendente)}
            detalhe={faturamentoBruto ? `${formatPercentual(pendente / faturamentoBruto)} do faturamento` : undefined}
          />
          <CardKpi titulo="Previsto em até 7 dias" valor={formatBRL(proximos7)} />
          <CardKpi titulo="Previsto após 30 dias" valor={formatBRL(mais30)} />
        </div>
      </Painel>

      <div className="grid gap-6 lg:grid-cols-5">
        <Painel
          className="lg:col-span-3"
          titulo="Calendário de repasses"
          descricao="Faturamento do mês, agrupado por quando o marketplace repassa o valor"
        >
          <div className="h-72 p-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porFaixa} margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="rotulo" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                <YAxis
                  tick={{ fontSize: 10 }}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v) => formatBRLCompacto(Number(v))}
                />
                <ChartTooltip
                  formatter={(v: number | string) => formatBRL(Number(v))}
                  contentStyle={{ fontSize: 12, borderRadius: 12 }}
                />
                <Bar dataKey="valor" name="Valor" radius={[6, 6, 0, 0]}>
                  {porFaixa.map((f) => (
                    <Cell key={f.id} fill={COR_FAIXA[f.id]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Painel>

        <Painel
          className="lg:col-span-2"
          titulo="Recebíveis por canal"
          descricao="Prazo médio de repasse e quanto já entrou vs. falta entrar"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Canal</th>
                  <th className="px-3 py-2.5 text-right font-medium">Prazo médio</th>
                  <th className="px-3 py-2.5 text-right font-medium">Recebido</th>
                  <th className="px-3 py-2.5 text-right font-medium">A receber</th>
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
                    <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                      D+{c.prazoMedioDias}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs font-semibold text-profit">
                      {formatBRL(c.recebido)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs font-semibold">
                      {formatBRL(c.pendente)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      </div>

      <Painel titulo="Impacto de devoluções" descricao="Vendas já entregues que voltaram depois — diferente de um pedido cancelado">
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <CardKpi
            titulo="Valor devolvido"
            valor={formatBRL(valorDevolvido)}
            detalhe={`${formatNumero(pedidosDevolvidos)} pedido${pedidosDevolvidos === 1 ? "" : "s"}`}
          />
          <CardKpi titulo="% do faturamento" valor={formatPercentual(percentualDevolucao)} />
          <CardKpi titulo="Faturamento bruto" valor={formatBRL(faturamentoBruto)} />
          <CardKpi
            titulo="Faturamento líquido"
            valor={formatBRL(faturamentoLiquido)}
            detalhe="Já descontando devoluções"
            destaque
          />
        </div>
      </Painel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Painel titulo="Devoluções por canal" descricao="Onde as devoluções mais pesam no faturamento">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left">
              <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 font-medium">Canal</th>
                  <th className="px-3 py-2.5 text-right font-medium">Pedidos</th>
                  <th className="px-3 py-2.5 text-right font-medium">Valor devolvido</th>
                  <th className="px-3 py-2.5 text-right font-medium">% do canal</th>
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
                    <td className="num px-3 py-3 text-right text-xs">
                      {formatNumero(c.pedidosDevolvidos)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs font-semibold text-loss">
                      {c.valorDevolvido > 0 ? formatBRL(c.valorDevolvido) : "—"}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                      {c.faturamento ? formatPercentual(c.valorDevolvido / c.faturamento) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>

        <Painel titulo="Devoluções recentes" descricao="As últimas vendas devolvidas neste mês">
          <div className="divide-y">
            {recentes.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">{p.produto}</p>
                  <p className="num text-[10px] text-muted-foreground">
                    #{p.id} · {p.motivoDevolucao} ·{" "}
                    {p.dataDevolucao ? formatData(p.dataDevolucao) : "—"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-sm font-bold text-loss">− {formatBRL(p.valorDevolvido)}</p>
                  <p className="num text-[10px] text-muted-foreground">de {formatBRL(p.faturamento)}</p>
                </div>
              </div>
            ))}
            {recentes.length === 0 && (
              <p className="px-5 py-10 text-center text-xs text-muted-foreground">
                Nenhuma devolução registrada neste mês — sinal bom.
              </p>
            )}
          </div>
        </Painel>
      </div>
    </div>
  );
}
