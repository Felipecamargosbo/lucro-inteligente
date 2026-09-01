import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { usePeriodo } from "@/context/periodo";
import { useSelecaoContas } from "@/context/selecao-contas";
import { vendasService } from "@/services";
import {
  agruparPorSku,
  anoMesDeHoje,
  filtrarPorPeriodo,
  periodoAnterior,
  periodoDoMes,
  resumir,
  seriePorDia,
  variacao,
  type ItemAgregadoSku,
} from "@/lib/finance";
import { formatBRL, formatBRLCompacto, formatData, formatNumero, formatPercentual } from "@/lib/format";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { cn } from "@/lib/utils";
import type { Periodo } from "@/types";

type Metrica = "faturamento" | "unidades" | "pedidos" | "lucro";

const METRICAS: { id: Metrica; rotulo: string }[] = [
  { id: "faturamento", rotulo: "Receita" },
  { id: "unidades", rotulo: "Unidades" },
  { id: "pedidos", rotulo: "Pedidos" },
  { id: "lucro", rotulo: "Lucro" },
];

function valorMetrica(r: { faturamento: number; unidades: number; pedidos: number; lucroLiquido: number }, m: Metrica) {
  if (m === "faturamento") return r.faturamento;
  if (m === "unidades") return r.unidades;
  if (m === "pedidos") return r.pedidos;
  return r.lucroLiquido;
}

function valorPonto(p: { faturamento: number; unidades: number; pedidos: number; lucro: number }, m: Metrica) {
  if (m === "faturamento") return p.faturamento;
  if (m === "unidades") return p.unidades;
  if (m === "pedidos") return p.pedidos;
  return p.lucro;
}

function formata(m: Metrica, v: number) {
  return m === "unidades" || m === "pedidos" ? formatNumero(v) : formatBRL(v);
}

export function Comparativos() {
  const { filtrarPorSelecao } = useSelecaoContas();
  const { periodo } = usePeriodo();
  const pedidos = filtrarPorSelecao(vendasService.listar());

  const [modo, setModo] = useState<"livre" | "mes-fechado">("livre");
  const [metrica, setMetrica] = useState<Metrica>("faturamento");
  const [mesAtual, setMesAtual] = useState(anoMesDeHoje());
  const [mesComparado, setMesComparado] = useState(anoMesDeHoje(-1));

  const periodoAtual: Periodo = modo === "mes-fechado" ? periodoDoMes(mesAtual) : periodo;
  const periodoComparado: Periodo =
    modo === "mes-fechado" ? periodoDoMes(mesComparado) : periodoAnterior(periodo);

  const dados = useMemo(() => {
    const atuais = filtrarPorPeriodo(pedidos, periodoAtual);
    const comparados = filtrarPorPeriodo(pedidos, periodoComparado);
    return {
      atuais,
      resumoAtual: resumir(atuais),
      resumoComparado: resumir(comparados),
      serieAtual: seriePorDia(atuais, periodoAtual),
      serieComparada: seriePorDia(comparados, periodoComparado),
    };
    // periodoAtual/periodoComparado são objetos novos a cada render quando vêm
    // de periodoDoMes()/periodoAnterior() — usamos os valores primitivos que
    // realmente os definem como dependência, pra não recalcular à toa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidos, modo, mesAtual, mesComparado, periodo]);

  const { resumoAtual, resumoComparado } = dados;

  // Alinha os dois períodos por número de dias decorridos (dia 1 com dia 1),
  // não por data — é o que permite comparar Agosto (31 dias) com Fevereiro
  // (28) sem o gráfico ficar torto no final.
  const serieGrafico = useMemo(() => {
    const max = Math.max(dados.serieAtual.length, dados.serieComparada.length);
    return Array.from({ length: max }, (_, i) => ({
      indice: `Dia ${i + 1}`,
      atual: dados.serieAtual[i] ? valorPonto(dados.serieAtual[i]!, metrica) : null,
      comparado: dados.serieComparada[i] ? valorPonto(dados.serieComparada[i]!, metrica) : null,
    }));
  }, [dados, metrica]);

  const vAtual = valorMetrica(resumoAtual, metrica);
  const vComparado = valorMetrica(resumoComparado, metrica);
  const variacaoMetrica = variacao(vAtual, vComparado);
  const variacaoMargem = variacao(resumoAtual.margem, resumoComparado.margem);

  const porSku = useMemo(() => agruparPorSku(dados.atuais), [dados.atuais]);
  const top5 = useMemo(
    () => [...porSku].sort((a, b) => b.lucro - a.lucro).slice(0, 5),
    [porSku],
  );
  const piores5 = useMemo(
    () => [...porSku].sort((a, b) => a.lucro - b.lucro).slice(0, 5),
    [porSku],
  );

  return (
    <div className="space-y-6">
      {/* Controles */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Modo de comparação
          </p>
          <div className="flex overflow-hidden rounded-lg border">
            <button
              onClick={() => setModo("livre")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                modo === "livre" ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              Período livre
            </button>
            <button
              onClick={() => setModo("mes-fechado")}
              className={cn(
                "px-3 py-1.5 text-xs font-medium transition-colors",
                modo === "mes-fechado" ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              Mês fechado
            </button>
          </div>
        </div>

        {modo === "livre" ? (
          <p className="max-w-sm text-[11px] text-muted-foreground">
            Usa o período escolhido lá no topo da página e compara com o intervalo imediatamente
            anterior, do mesmo tamanho.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Mês atual
              </p>
              <input
                type="month"
                value={mesAtual}
                onChange={(e) => setMesAtual(e.target.value)}
                className="h-8 rounded-lg border bg-background px-2 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Comparar com
              </p>
              <input
                type="month"
                value={mesComparado}
                onChange={(e) => setMesComparado(e.target.value)}
                className="h-8 rounded-lg border bg-background px-2 text-xs"
              />
            </div>
            <p className="max-w-xs text-[11px] text-muted-foreground">
              Nesse modo, o período lá de cima não é usado — só os dois meses escolhidos aqui.
            </p>
          </>
        )}

        <div className="ml-auto space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Métrica do gráfico
          </p>
          <div className="flex overflow-hidden rounded-lg border">
            {METRICAS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMetrica(m.id)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  metrica === m.id
                    ? "bg-brand text-brand-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {m.rotulo}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPIs do comparativo */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Atual"
          valor={formata(metrica, vAtual)}
          detalhe={`${formatData(periodoAtual.inicio)} a ${formatData(periodoAtual.fim)}`}
        />
        <CardKpi
          titulo="Período anterior"
          valor={formata(metrica, vComparado)}
          detalhe={`${formatData(periodoComparado.inicio)} a ${formatData(periodoComparado.fim)}`}
        />
        <CardKpi
          titulo="Variação"
          valor={`${variacaoMetrica >= 0 ? "+" : "−"}${formatPercentual(Math.abs(variacaoMetrica))}`}
          detalhe={METRICAS.find((m) => m.id === metrica)?.rotulo}
          destaque={variacaoMetrica >= 0}
        />
        <CardKpi
          titulo="Margem média"
          valor={formatPercentual(resumoAtual.margem)}
          detalhe={`${variacaoMargem >= 0 ? "+" : "−"}${formatPercentual(Math.abs(variacaoMargem))} vs. anterior`}
        />
      </div>

      {/* Gráfico sobreposto */}
      <Painel
        titulo="Evolução vs período anterior"
        descricao="Compara o que você vendeu neste período com o período imediatamente anterior, do mesmo tamanho — alinhado por dia decorrido, não por data"
      >
        <div className="h-72 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={serieGrafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="indice" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <YAxis
                tick={{ fontSize: 10 }}
                stroke="var(--muted-foreground)"
                tickFormatter={(v) =>
                  metrica === "unidades" || metrica === "pedidos"
                    ? formatNumero(Number(v))
                    : formatBRLCompacto(Number(v))
                }
              />
              <ChartTooltip
                formatter={(v: number | string) => formata(metrica, Number(v))}
                contentStyle={{ fontSize: 12, borderRadius: 12 }}
              />
              <Line
                type="monotone"
                dataKey="comparado"
                name="Período anterior"
                stroke="var(--muted-foreground)"
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="atual"
                name="Atual"
                stroke="var(--brand)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Painel>

      {/* Top 5 e piores 5 */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ListaProdutos
          titulo="Top 5 por lucro"
          descricao="Quem mais paga suas contas no período atual"
          itens={top5}
          corValor="text-profit"
        />
        <ListaProdutos
          titulo="5 que mais destroem margem"
          descricao="Maiores prejuízos (ou menores lucros) do período atual"
          itens={piores5}
          corValor="text-loss"
        />
      </div>
    </div>
  );
}

function ListaProdutos({
  titulo,
  descricao,
  itens,
  corValor,
}: {
  titulo: string;
  descricao: string;
  itens: ItemAgregadoSku[];
  corValor: string;
}) {
  return (
    <Painel titulo={titulo} descricao={descricao}>
      <div className="divide-y">
        {itens.map((item) => (
          <div key={item.sku} className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-medium">{item.produto}</p>
              <p className="num text-[10px] text-muted-foreground">
                {item.sku} · {formatNumero(item.unidades)} un · {formatBRL(item.faturamento)} fat.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className={cn("num text-sm font-bold", corValor)}>{formatBRL(item.lucro)}</p>
              <p className={cn("num text-[10px] font-medium", corValor)}>
                {formatPercentual(item.margem)}
              </p>
            </div>
          </div>
        ))}
        {itens.length === 0 && (
          <p className="px-5 py-10 text-center text-xs text-muted-foreground">
            Nenhuma venda no período pra mostrar.
          </p>
        )}
      </div>
    </Painel>
  );
}
