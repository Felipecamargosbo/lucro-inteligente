import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { campanhasService, vendasService } from "@/services";
import {
  campanhasDoProduto,
  historicoDoProduto,
  lucroIncremental,
  produtosDaCampanha,
  resultadoDaCampanha,
  resumoDoProduto,
} from "@/lib/campanhas";
import { formatBRL, formatData, formatPercentual } from "@/lib/format";
import { CardKpi, Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Campanha } from "@/types";

type FiltroStatus = "todas" | "ativa" | "encerrada";

const FILTROS: { id: FiltroStatus; rotulo: string }[] = [
  { id: "todas", rotulo: "Todas" },
  { id: "ativa", rotulo: "Ativas" },
  { id: "encerrada", rotulo: "Encerradas" },
];

const ROTULO_TIPO: Record<Campanha["tipo"], string> = {
  oferta: "Oferta",
  "oferta-inteligente": "Oferta inteligente",
  cupom: "Cupom",
  "equiparacao-preco": "Equiparação de preço",
};

export function ResultadosPromocoes() {
  const [filtro, setFiltro] = useState<FiltroStatus>("todas");
  const [aberta, setAberta] = useState<Campanha | null>(null);

  const pedidos = vendasService.listar();
  const campanhas = campanhasService.listar();

  const linhas = useMemo(
    () =>
      campanhas.map((campanha) => ({
        campanha,
        resultado: resultadoDaCampanha(campanha, pedidos),
        incremental: lucroIncremental(campanha, pedidos),
      })),
    [campanhas, pedidos],
  );

  const visiveis = useMemo(
    () =>
      (filtro === "todas" ? linhas : linhas.filter((l) => l.campanha.status === filtro)).sort(
        (a, b) => b.resultado.receita - a.resultado.receita,
      ),
    [linhas, filtro],
  );

  const totais = useMemo(() => {
    const emPromocao = pedidos.filter((p) => p.campanhaId && p.status !== "cancelado");
    const receita = emPromocao.reduce((s, p) => s + p.faturamento, 0);
    const lucro = emPromocao.reduce((s, p) => s + p.lucroLiquido, 0);

    // Mesmos SKUs e mesmos canais das campanhas, mas vendidos a preço cheio.
    // É a única comparação de margem que não engana.
    const paresEmCampanha = new Set(
      campanhas.flatMap((c) => c.skus.map((sku) => `${c.marketplaceId}|${sku}`)),
    );
    const fora = pedidos.filter(
      (p) =>
        !p.campanhaId &&
        p.status !== "cancelado" &&
        paresEmCampanha.has(`${p.marketplaceId}|${p.sku}`),
    );
    const receitaFora = fora.reduce((s, p) => s + p.faturamento, 0);
    const lucroFora = fora.reduce((s, p) => s + p.lucroLiquido, 0);

    // Só soma o incremental das campanhas com base de comparação suficiente.
    // Somar as inconclusivas junto daria um número bonito e sem sentido.
    const confiaveis = linhas.filter((l) => !l.incremental.poucosDados);
    const inconclusivas = linhas.length - confiaveis.length;

    return {
      receita,
      margem: receita ? lucro / receita : 0,
      margemFora: receitaFora ? lucroFora / receitaFora : 0,
      incremental: confiaveis.reduce((s, l) => s + l.incremental.valor, 0),
      inconclusivas,
      comVenda: linhas.filter((l) => l.resultado.pedidos > 0).length,
    };
  }, [pedidos, campanhas, linhas]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Receita em promoção"
          valor={formatBRL(totais.receita)}
          detalhe={`${totais.comVenda} campanha${totais.comVenda === 1 ? "" : "s"} com venda`}
        />
        <CardKpi
          titulo="Margem em promoção"
          valor={formatPercentual(totais.margem)}
          detalhe={`Fora da promoção, os mesmos produtos dão ${formatPercentual(totais.margemFora)}`}
          dica="Comparação com os mesmos SKUs, nos mesmos canais, vendidos a preço cheio."
        />
        <CardKpi
          titulo="Lucro incremental"
          valor={formatBRL(totais.incremental)}
          destaque={totais.incremental >= 0}
          detalhe={
            totais.inconclusivas > 0
              ? `${totais.inconclusivas} campanha${totais.inconclusivas === 1 ? "" : "s"} sem base suficiente ficou de fora da conta`
              : "Todas as campanhas tinham base de comparação suficiente"
          }
          dica="Lucro que as campanhas somaram além do que os mesmos produtos já rendiam antes delas. Negativo significa que o desconto saiu mais caro que a venda extra."
        />
        <CardKpi
          titulo="Desconto concedido"
          valor={formatBRL(linhas.reduce((s, l) => s + l.resultado.descontos, 0))}
          detalhe="Total abatido do preço cheio nas vendas em campanha"
        />
      </div>

      <Painel
        titulo="Campanhas"
        descricao="O que cada promoção entregou de verdade · clique para ver os produtos"
      >
        <div className="flex flex-wrap gap-1.5 border-b p-4">
          {FILTROS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFiltro(f.id)}
              className={cn(
                "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
                filtro === f.id
                  ? "border-brand bg-brand text-brand-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {f.rotulo}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Campanha</th>
                <th className="px-4 py-2 text-left font-semibold">Período</th>
                <th className="px-4 py-2 text-right font-semibold">Pedidos</th>
                <th className="px-4 py-2 text-right font-semibold">Unidades</th>
                <th className="px-4 py-2 text-right font-semibold">Receita</th>
                <th className="px-4 py-2 text-right font-semibold">Margem</th>
                <th className="px-4 py-2 text-right font-semibold">Lucro incremental</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visiveis.map(({ campanha, resultado, incremental }) => (
                <tr
                  key={campanha.id}
                  onClick={() => setAberta(campanha)}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <SeloMarketplace id={campanha.marketplaceId} />
                      <span className="text-xs font-medium">
                        {campanha.nome ?? <span className="num">{campanha.id}</span>}
                      </span>
                      <SeloStatusCampanha status={campanha.status} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">
                        {ROTULO_TIPO[campanha.tipo]}
                      </span>
                      {campanha.origem === "externa" && (
                        <span className="rounded bg-warning-soft px-1 py-px text-[9px] font-medium text-foreground">
                          Entrou sem análise
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-muted-foreground">
                    {formatData(campanha.inicio)} a {formatData(campanha.fim)}
                  </td>
                  <td className="num px-4 py-3 text-right">{resultado.pedidos}</td>
                  <td className="num px-4 py-3 text-right">{resultado.unidades}</td>
                  <td className="num px-4 py-3 text-right font-semibold">
                    {formatBRL(resultado.receita)}
                  </td>
                  <td
                    className={cn(
                      "num px-4 py-3 text-right font-semibold",
                      resultado.margem >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {resultado.pedidos ? formatPercentual(resultado.margem) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ValorIncremental incremental={incremental} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="border-t px-5 py-3 text-[10px] leading-relaxed text-muted-foreground">
          <strong>Margem</strong> é o resultado das vendas que saíram pela campanha.{" "}
          <strong>Lucro incremental</strong> é outra pergunta: compara o que os mesmos produtos
          renderam durante a campanha com o que já rendiam no mesmo tanto de dias antes dela. Uma
          campanha pode vender muito e ainda assim ter incremental negativo — é quando o desconto
          foi dado para quem compraria de qualquer jeito.
        </p>
      </Painel>

      {aberta && <DetalheCampanha campanha={aberta} aoFechar={() => setAberta(null)} />}
    </div>
  );
}

function SeloStatusCampanha({ status }: { status: Campanha["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
        status === "ativa" ? "bg-profit-soft text-profit" : "bg-muted text-muted-foreground",
      )}
    >
      {status === "ativa" ? "Ativa" : "Encerrada"}
    </span>
  );
}

function ValorIncremental({
  incremental,
}: {
  incremental: ReturnType<typeof lucroIncremental>;
}) {
  if (incremental.poucosDados) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
        <AlertTriangle className="size-3" />
        Sem base suficiente
      </span>
    );
  }
  const positivo = incremental.valor >= 0;
  return (
    <span
      className={cn(
        "num inline-flex items-center gap-1 font-semibold",
        positivo ? "text-profit" : "text-loss",
      )}
    >
      {positivo ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {formatBRL(incremental.valor)}
    </span>
  );
}

function DetalheCampanha({
  campanha,
  aoFechar,
}: {
  campanha: Campanha;
  aoFechar: () => void;
}) {
  const [produtoAberto, setProdutoAberto] = useState<{ sku: string; nome: string } | null>(null);
  const pedidos = vendasService.listar();
  const resultado = resultadoDaCampanha(campanha, pedidos);
  const incremental = lucroIncremental(campanha, pedidos);
  const produtos = produtosDaCampanha(campanha, pedidos);

  if (produtoAberto) {
    return (
      <DetalheProduto
        sku={produtoAberto.sku}
        nome={produtoAberto.nome}
        campanha={campanha}
        aoVoltar={() => setProdutoAberto(null)}
        aoFechar={aoFechar}
      />
    );
  }

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <SeloMarketplace id={campanha.marketplaceId} />
            <DialogTitle>{campanha.nome ?? campanha.id}</DialogTitle>
            <SeloStatusCampanha status={campanha.status} />
          </div>
          <DialogDescription>
            {ROTULO_TIPO[campanha.tipo]} · {formatData(campanha.inicio)} a{" "}
            {formatData(campanha.fim)} · desconto de{" "}
            {formatPercentual(campanha.descontoPercentual)}
            {campanha.origem === "externa" &&
              " · entrou direto no canal, sem passar pela análise de margem"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Bloco rotulo="Receita" valor={formatBRL(resultado.receita)} />
            <Bloco
              rotulo="Lucro"
              valor={formatBRL(resultado.lucro)}
              cor={resultado.lucro >= 0 ? "text-profit" : "text-loss"}
            />
            <Bloco
              rotulo="Margem"
              valor={resultado.pedidos ? formatPercentual(resultado.margem) : "—"}
            />
            <Bloco rotulo="Desconto dado" valor={formatBRL(resultado.descontos)} />
          </div>

          <div
            className={cn(
              "rounded-xl border p-4",
              incremental.poucosDados
                ? "bg-muted/40"
                : incremental.valor >= 0
                  ? "bg-profit-soft"
                  : "bg-loss-soft",
            )}
          >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Valeu a pena?
            </p>
            {incremental.poucosDados ? (
              <>
                <p className="mt-1 text-sm font-semibold">Não dá para afirmar</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  A base de comparação tem só {incremental.pedidosBase} pedido
                  {incremental.pedidosBase === 1 ? "" : "s"} ({formatData(incremental.inicioBase)} a{" "}
                  {formatData(incremental.fimBase)}). Com esse volume, a variação normal de um
                  período para outro é maior que o efeito da campanha — o número daria uma
                  conclusão que pode estar invertida.
                </p>
              </>
            ) : (
              <>
                <p
                  className={cn(
                    "num mt-1 text-xl font-bold",
                    incremental.valor >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {formatBRL(incremental.valor)}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {incremental.valor >= 0
                    ? "Lucro que a campanha somou além do que estes produtos já rendiam."
                    : "A campanha rendeu menos do que estes produtos já rendiam sozinhos — o desconto custou mais que a venda extra."}{" "}
                  Saíram de {incremental.unidadesDiaAntes.toFixed(1)} para{" "}
                  {incremental.unidadesDiaDurante.toFixed(1)} unidades por dia, comparando com{" "}
                  {formatData(incremental.inicioBase)} a {formatData(incremental.fimBase)}.
                </p>
              </>
            )}
          </div>

          <div className="rounded-xl border">
            <div className="border-b px-4 py-2.5">
              <p className="text-xs font-semibold">Produtos nesta campanha</p>
              <p className="text-[10px] text-muted-foreground">
                Clique em um produto para ver o histórico dele
              </p>
            </div>
            {produtos.length === 0 ? (
              <p className="px-4 py-6 text-center text-[11px] text-muted-foreground">
                Nenhuma venda registrada nesta campanha.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/40 text-[9px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold">Produto</th>
                      <th className="px-4 py-2 text-right font-semibold">Unidades</th>
                      <th className="px-4 py-2 text-right font-semibold">Receita</th>
                      <th className="px-4 py-2 text-right font-semibold">Lucro</th>
                      <th className="px-4 py-2 text-right font-semibold">Margem</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {produtos.map((p) => (
                      <tr
                        key={p.sku}
                        onClick={() => setProdutoAberto({ sku: p.sku, nome: p.produto })}
                        className="cursor-pointer transition-colors hover:bg-muted/40"
                      >
                        <td className="max-w-[240px] px-4 py-2.5">
                          <p className="truncate font-medium">{p.produto}</p>
                          <p className="num text-[10px] text-muted-foreground">{p.sku}</p>
                        </td>
                        <td className="num px-4 py-2.5 text-right">{p.unidades}</td>
                        <td className="num px-4 py-2.5 text-right">{formatBRL(p.receita)}</td>
                        <td
                          className={cn(
                            "num px-4 py-2.5 text-right font-semibold",
                            p.lucro >= 0 ? "text-profit" : "text-loss",
                          )}
                        >
                          {formatBRL(p.lucro)}
                        </td>
                        <td
                          className={cn(
                            "num px-4 py-2.5 text-right font-semibold",
                            p.margem >= 0 ? "text-profit" : "text-loss",
                          )}
                        >
                          {formatPercentual(p.margem)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Detalhe de um produto                                              */
/* ------------------------------------------------------------------ */

/**
 * Duas séries, e elas não são categorias iguais: "em promoção" é o que se quer
 * estudar, "preço cheio" é a referência. Por isso uma cor da marca e um neutro,
 * e não duas cores concorrendo por atenção.
 *
 * O neutro é quente de propósito: o cinza-azulado do app fica perto demais do
 * roxo da marca para quem tem daltonismo tritan (separação 7,4, abaixo do piso
 * de 8). Este passa em protan, deutan e tritan. A identidade também não depende
 * só da cor — tem legenda fixa, tooltip por barra e a tabela de campanhas logo
 * abaixo com os mesmos números.
 */
const COR_PROMOCAO = "var(--brand)";
const COR_PRECO_CHEIO = "#6b6560";

function DetalheProduto({
  sku,
  nome,
  campanha,
  aoVoltar,
  aoFechar,
}: {
  sku: string;
  nome: string;
  campanha: Campanha;
  aoVoltar: () => void;
  aoFechar: () => void;
}) {
  const pedidos = vendasService.listar();
  const campanhas = campanhasService.listar();

  const historico = useMemo(
    () => historicoDoProduto(sku, campanha.marketplaceId, pedidos),
    [sku, campanha.marketplaceId, pedidos],
  );
  const resumo = useMemo(
    () => resumoDoProduto(sku, campanha.marketplaceId, pedidos),
    [sku, campanha.marketplaceId, pedidos],
  );
  const historicoCampanhas = useMemo(
    () => campanhasDoProduto(sku, campanha.marketplaceId, campanhas, pedidos),
    [sku, campanha.marketplaceId, campanhas, pedidos],
  );

  const dadosGrafico = historico.map((d) => ({
    ...d,
    rotulo: formatData(d.dia),
  }));
  const temVenda = historico.some((d) => d.precoCheio > 0 || d.emPromocao > 0);

  const melhor = historicoCampanhas[0];
  const pior = historicoCampanhas.length > 1 ? historicoCampanhas.at(-1) : undefined;

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <button
            type="button"
            onClick={aoVoltar}
            className="mb-1 inline-flex w-fit items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Voltar para {campanha.nome ?? campanha.id}
          </button>
          <DialogTitle className="text-left">{nome}</DialogTitle>
          <DialogDescription>
            <span className="num">{sku}</span> · histórico neste canal nos últimos 60 dias
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Bloco rotulo="Unidades em promoção" valor={String(resumo.promocao.unidades)} />
            <Bloco rotulo="Unidades a preço cheio" valor={String(resumo.precoCheio.unidades)} />
            <Bloco
              rotulo="Margem em promoção"
              valor={
                resumo.promocao.receita ? formatPercentual(resumo.promocao.margem) : "—"
              }
              cor={resumo.promocao.margem >= 0 ? "text-profit" : "text-loss"}
            />
            <Bloco
              rotulo="Margem a preço cheio"
              valor={
                resumo.precoCheio.receita ? formatPercentual(resumo.precoCheio.margem) : "—"
              }
              cor={resumo.precoCheio.margem >= 0 ? "text-profit" : "text-loss"}
            />
          </div>

          <div className="rounded-xl border p-4">
            <p className="text-xs font-semibold">Unidades vendidas por dia</p>
            <p className="mb-3 text-[10px] text-muted-foreground">
              Barras mais altas durante a promoção significam venda nova; altura parecida
              significa que o desconto só trocou venda cheia por venda com desconto.
            </p>
            {temVenda ? (
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dadosGrafico} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis
                      dataKey="rotulo"
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={{ stroke: "var(--border)" }}
                      interval={Math.max(0, Math.floor(dadosGrafico.length / 6) - 1)}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 9, fill: "var(--muted-foreground)" }}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                    />
                    <ChartTooltip
                      cursor={{ fill: "var(--muted)" }}
                      contentStyle={{
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "var(--card)",
                        fontSize: 11,
                      }}
                      formatter={(valor: number, nomeSerie: string) => [
                        `${valor} un.`,
                        nomeSerie,
                      ]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      height={24}
                      iconType="circle"
                      wrapperStyle={{ fontSize: 10 }}
                    />
                    <Bar
                      dataKey="precoCheio"
                      name="A preço cheio"
                      stackId="un"
                      fill={COR_PRECO_CHEIO}
                    />
                    <Bar
                      dataKey="emPromocao"
                      name="Em promoção"
                      stackId="un"
                      fill={COR_PROMOCAO}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-8 text-center text-[11px] text-muted-foreground">
                Sem vendas deste produto neste canal no período.
              </p>
            )}
          </div>

          <div className="rounded-xl border">
            <div className="border-b px-4 py-2.5">
              <p className="text-xs font-semibold">Campanhas deste produto</p>
              <p className="text-[10px] text-muted-foreground">
                Em qual delas ele rendeu mais — da melhor margem para a pior
              </p>
            </div>
            {historicoCampanhas.length === 0 ? (
              <p className="px-4 py-6 text-center text-[11px] text-muted-foreground">
                Este produto ainda não vendeu em nenhuma campanha.
              </p>
            ) : (
              <>
                {melhor && historicoCampanhas.length > 1 && (
                  <div className="grid gap-2 border-b p-3 sm:grid-cols-2">
                    <div className="rounded-lg bg-profit-soft p-2.5">
                      <p className="text-[9px] font-semibold uppercase tracking-wide text-profit">
                        Melhor margem
                      </p>
                      <p className="text-[11px] font-medium">
                        {melhor.campanha.nome ?? melhor.campanha.id}
                      </p>
                      <p className="num text-[10px] text-muted-foreground">
                        {formatPercentual(melhor.margem)} · {melhor.unidades} un.
                      </p>
                    </div>
                    {pior && (
                      <div className="rounded-lg bg-loss-soft p-2.5">
                        <p className="text-[9px] font-semibold uppercase tracking-wide text-loss">
                          Pior margem
                        </p>
                        <p className="text-[11px] font-medium">
                          {pior.campanha.nome ?? pior.campanha.id}
                        </p>
                        <p className="num text-[10px] text-muted-foreground">
                          {formatPercentual(pior.margem)} · {pior.unidades} un.
                        </p>
                      </div>
                    )}
                  </div>
                )}
                <div className="max-h-52 overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted/40 text-[9px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">Campanha</th>
                        <th className="px-4 py-2 text-right font-semibold">Unidades</th>
                        <th className="px-4 py-2 text-right font-semibold">Receita</th>
                        <th className="px-4 py-2 text-right font-semibold">Margem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {historicoCampanhas.map((h) => (
                        <tr
                          key={h.campanha.id}
                          className={cn(h.campanha.id === campanha.id && "bg-brand-soft/40")}
                        >
                          <td className="px-4 py-2.5">
                            <span className="font-medium">
                              {h.campanha.nome ?? <span className="num">{h.campanha.id}</span>}
                            </span>
                            {h.campanha.id === campanha.id && (
                              <span className="ml-1.5 text-[9px] text-muted-foreground">
                                (a que você está vendo)
                              </span>
                            )}
                          </td>
                          <td className="num px-4 py-2.5 text-right">{h.unidades}</td>
                          <td className="num px-4 py-2.5 text-right">{formatBRL(h.receita)}</td>
                          <td
                            className={cn(
                              "num px-4 py-2.5 text-right font-semibold",
                              h.margem >= 0 ? "text-profit" : "text-loss",
                            )}
                          >
                            {formatPercentual(h.margem)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Bloco({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-xl border p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </p>
      <p className={cn("num mt-0.5 text-sm font-bold", cor)}>{valor}</p>
    </div>
  );
}
