import { useMemo, useState } from "react";
import { RefreshCw, Search, TriangleAlert } from "lucide-react";
import { anunciosService } from "@/services";
import { useConfiguracoes } from "@/context/configuracoes";
import { raioXAnuncio, calcularCobertura, type RaioXAnuncio } from "@/lib/finance";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { Painel } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Anuncio, FaixaSaudeMargem, ContaMarketplace, MetasMargem } from "@/types";

/* ------------------------------------------------------------------ */
/* Faixas de saúde — sempre relativas às metas do canal               */
/* ------------------------------------------------------------------ */

const FAIXAS: Record<
  FaixaSaudeMargem,
  { rotulo: string; ponto: string; texto: string; fundo: string }
> = {
  prejuizo: {
    rotulo: "Prejuízo",
    ponto: "bg-loss",
    texto: "text-loss",
    fundo: "bg-loss-soft",
  },
  "abaixo-da-minima": {
    rotulo: "Abaixo da mínima",
    ponto: "bg-warning",
    texto: "text-foreground",
    fundo: "bg-warning-soft",
  },
  "entre-minima-e-ideal": {
    rotulo: "Entre mínima e ideal",
    ponto: "bg-info",
    texto: "text-info",
    fundo: "bg-info-soft",
  },
  saudavel: {
    rotulo: "Saudável",
    ponto: "bg-profit",
    texto: "text-profit",
    fundo: "bg-profit-soft",
  },
  "sem-meta": {
    rotulo: "Sem meta definida",
    ponto: "bg-muted-foreground/50",
    texto: "text-muted-foreground",
    fundo: "bg-muted",
  },
  "sem-custo": {
    rotulo: "Sem cálculo",
    ponto: "bg-muted-foreground/50",
    texto: "text-muted-foreground",
    fundo: "bg-muted",
  },
};

const ORDEM_FAIXAS: FaixaSaudeMargem[] = [
  "prejuizo",
  "abaixo-da-minima",
  "entre-minima-e-ideal",
  "saudavel",
  "sem-meta",
  "sem-custo",
];

/* ------------------------------------------------------------------ */
/* Barra de composição: para onde vai cada real do preço              */
/* ------------------------------------------------------------------ */

function BarraComposicao({ r }: { r: RaioXAnuncio }) {
  if (r.precoVenda <= 0) return null;

  const partes = [
    { rotulo: "CMV", valor: r.semCusto ? 0 : r.cmv, cor: "bg-muted-foreground" },
    { rotulo: "Imposto", valor: r.impostos, cor: "bg-muted-foreground/50" },
    { rotulo: "Comissão", valor: r.comissao, cor: "bg-brand" },
    { rotulo: "Taxa fixa", valor: r.taxaFixa, cor: "bg-brand/60" },
    { rotulo: "Frete", valor: r.frete, cor: "bg-info" },
    { rotulo: "Mídia", valor: r.midia, cor: "bg-warning" },
    { rotulo: "Afiliados", valor: r.afiliados, cor: "bg-primary" },
    { rotulo: "Custos op.", valor: r.custosOperacionais, cor: "bg-muted-foreground/70" },
    {
      rotulo: "Sobra",
      valor: r.semCusto ? 0 : Math.max(r.lucroLiquido, 0),
      cor: "bg-profit",
    },
  ].filter((p) => p.valor > 0);

  return (
    <div
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
      title={partes
        .map((p) => `${p.rotulo}: ${formatBRL(p.valor)}`)
        .join(" · ")}
    >
      {partes.map((p) => (
        <div
          key={p.rotulo}
          className={p.cor}
          style={{ width: `${(p.valor / r.precoVenda) * 100}%` }}
        />
      ))}
      {r.lucroLiquido < 0 && !r.semCusto && (
        <div className="flex-1 bg-loss/30" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Linha da tabela                                                    */
/* ------------------------------------------------------------------ */

function LinhaAnuncio({
  anuncio,
  conta,
  metas,
}: {
  anuncio: Anuncio;
  conta: ContaMarketplace;
  metas: MetasMargem | null;
}) {
  const { fiscal, custoOperacionalDetalhado } = useConfiguracoes();
  const [precoSimulado, setPrecoSimulado] = useState<number | null>(null);
  const precoEmUso = precoSimulado ?? anuncio.precoAtual;

  const opcoes = (preco: number) => ({
    aliquotaImposto: fiscal.aliquota,
    custosOperacionais: custoOperacionalDetalhado(preco),
  });

  const atual = raioXAnuncio(anuncio, metas, anuncio.precoAtual, opcoes(anuncio.precoAtual));
  const r = raioXAnuncio(anuncio, metas, precoEmUso, opcoes(precoEmUso));
  const simulando = precoSimulado !== null && precoSimulado !== anuncio.precoAtual;
  const deltaLucro = r.lucroLiquido - atual.lucroLiquido;

  const faixa = FAIXAS[r.faixa];

  const celulaCusto = "num px-3 py-3 text-right text-[11px] text-muted-foreground whitespace-nowrap";

  return (
    <>
      <tr className={cn("border-t transition-colors hover:bg-muted/30", simulando && "bg-brand-soft/30")}>
        {/* Produto */}
        <td className="max-w-[230px] px-4 py-3">
          <p className="truncate text-xs font-medium">{anuncio.produto}</p>
          <p className="num text-[10px] text-muted-foreground">{anuncio.sku}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {anuncio.emPromocao && (
              <span className="rounded bg-brand-soft px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand">
                Promo
              </span>
            )}
            {!anuncio.produtoVinculado && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                sem vínculo
              </span>
            )}
            {anuncio.origemTaxas === "estimado" && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                taxa estimada
              </span>
            )}
          </div>
        </td>

        {/* Preço */}
        <td className="num px-3 py-3 text-right text-xs font-semibold whitespace-nowrap">
          {formatBRL(r.precoVenda)}
          {r.precoCheio && (
            <span className="block text-[10px] font-normal text-muted-foreground line-through">
              {formatBRL(r.precoCheio)}
            </span>
          )}
        </td>

        {/* CMV */}
        <td className={celulaCusto}>
          {r.semCusto ? (
            <span className="inline-flex items-center gap-1 rounded bg-warning-soft px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
              <TriangleAlert className="size-3" />
              não cadastrado
            </span>
          ) : (
            `− ${formatBRL(r.cmv)}`
          )}
        </td>

        {/* Imposto */}
        <td className={celulaCusto}>
          − {formatBRL(r.impostos)}
          <span className="block text-[9px]">{formatPercentual(fiscal.aliquota)}</span>
        </td>

        {/* Comissão */}
        <td className={celulaCusto}>
          − {formatBRL(r.comissao)}
          <span className="block text-[9px]">
            {formatPercentual(anuncio.comissaoPercentual)}
          </span>
        </td>

        {/* Taxa fixa */}
        <td className={celulaCusto}>− {formatBRL(r.taxaFixa)}</td>

        {/* Frete */}
        <td className={celulaCusto}>
          {r.frete > 0 ? `− ${formatBRL(r.frete)}` : "—"}
        </td>

        {/* Mídia */}
        <td className={celulaCusto}>
          {r.midia > 0 ? `− ${formatBRL(r.midia)}` : "—"}
        </td>

        {/* Afiliados */}
        <td className={celulaCusto}>
          {r.afiliados > 0 ? `− ${formatBRL(r.afiliados)}` : "—"}
        </td>

        {/* Custos operacionais do seller */}
        <td className={celulaCusto}>
          {r.custosOperacionais > 0 ? (
            <>
              − {formatBRL(r.custosOperacionais)}
              <span className="block text-[9px] leading-tight">
                {r.custosOperacionaisDetalhe
                  .slice(0, 3)
                  .map((c) => `${c.nome} ${c.valor.toFixed(2)}`)
                  .join(" · ")}
                {r.custosOperacionaisDetalhe.length > 3 &&
                  ` · +${r.custosOperacionaisDetalhe.length - 3}`}
              </span>
            </>
          ) : (
            "—"
          )}
        </td>

        {/* Total de descontos */}
        <td className="num whitespace-nowrap px-3 py-3 text-right text-[11px] font-semibold text-loss">
          − {formatBRL(r.totalDescontos)}
        </td>

        {/* Lucro e margem */}
        <td className="whitespace-nowrap px-3 py-3 text-right">
          {r.semCusto ? (
            <span className="rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
              sem cálculo
            </span>
          ) : (
            <div className={cn("inline-flex flex-col rounded-lg px-2 py-1", faixa.fundo)}>
              <span className={cn("num text-xs font-bold", faixa.texto)}>
                {formatBRL(r.lucroLiquido)}
              </span>
              <span className={cn("num text-[10px] font-semibold", faixa.texto)}>
                {formatPercentual(r.margem)}
              </span>
            </div>
          )}
          {simulando && !r.semCusto && (
            <span
              className={cn(
                "num mt-1 block text-[10px] font-semibold",
                deltaLucro >= 0 ? "text-profit" : "text-loss",
              )}
            >
              {deltaLucro >= 0 ? "+" : "−"}
              {formatBRL(Math.abs(deltaLucro))} vs. atual
            </span>
          )}
        </td>

        {/* Simulador inline */}
        <td className="whitespace-nowrap px-3 py-3">
          <div className="flex items-center gap-1">
            <Input
              type="number"
              step="0.01"
              value={precoEmUso}
              onChange={(e) => setPrecoSimulado(Number(e.target.value) || 0)}
              className="num h-7 w-[86px] px-2 text-[11px]"
              aria-label={`Simular preço de ${anuncio.produto}`}
            />
            {simulando && (
              <button
                onClick={() => setPrecoSimulado(null)}
                title="Voltar ao preço atual"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <RefreshCw className="size-3.5" />
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Barra de composição: leitura do preço num relance */}
      <tr className="bg-muted/10">
        <td colSpan={13} className="px-4 pb-3">
          <BarraComposicao r={r} />
        </td>
      </tr>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Tabela                                                             */
/* ------------------------------------------------------------------ */

export function RaioXAnuncios({ conta }: { conta: ContaMarketplace }) {
  const { metasPorConta, fiscal, custoOperacionalDetalhado } = useConfiguracoes();
  const metas = metasPorConta[conta.id] ?? null;
  const [busca, setBusca] = useState("");
  const [faixaFiltro, setFaixaFiltro] = useState<FaixaSaudeMargem | "todos">("todos");

  const anuncios = useMemo(
    () => anunciosService.listar().filter((a) => a.contaId === conta.id),
    [conta.id],
  );

  const cobertura = calcularCobertura(anuncios);

  const contagemPorFaixa = useMemo(() => {
    const mapa = new Map<FaixaSaudeMargem, number>();
    for (const a of anuncios) {
      const f = raioXAnuncio(a, metas, a.precoAtual, {
        aliquotaImposto: fiscal.aliquota,
        custosOperacionais: custoOperacionalDetalhado(a.precoAtual),
      }).faixa;
      mapa.set(f, (mapa.get(f) ?? 0) + 1);
    }
    return mapa;
  }, [anuncios, metas, fiscal, custoOperacionalDetalhado]);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return anuncios.filter((a) => {
      const casaBusca =
        !termo ||
        a.produto.toLowerCase().includes(termo) ||
        a.sku.toLowerCase().includes(termo);
      const casaFaixa =
        faixaFiltro === "todos" ||
        raioXAnuncio(a, metas, a.precoAtual, {
          aliquotaImposto: fiscal.aliquota,
          custosOperacionais: custoOperacionalDetalhado(a.precoAtual),
        }).faixa === faixaFiltro;
      return casaBusca && casaFaixa;
    });
  }, [anuncios, busca, faixaFiltro, metas, fiscal, custoOperacionalDetalhado]);

  const colunas = [
    "Produto / Anúncio",
    "Preço",
    "CMV",
    "Imposto",
    "Comissão",
    "Taxa fixa",
    "Frete",
    "Mídia / ADS",
    "Afiliados",
    "Custos operacionais",
    "Total descontos",
    "Sobra no bolso",
    "Simular",
  ];

  return (
    <div className="space-y-4">
      {/* Aviso de cobertura — o número só vale se o dado existir */}
      {cobertura.semCusto > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p className="text-[11px] leading-relaxed">
            <strong>{formatNumero(cobertura.semCusto)}</strong> de{" "}
            {formatNumero(cobertura.total)} anúncios não têm custo cadastrado. Para eles o sistema
            não exibe lucro — mostrar um número aqui seria inventar. A margem é calculável em{" "}
            <strong>{formatPercentual(cobertura.percentualCalculavel)}</strong> deste catálogo.
          </p>
        </div>
      )}

      {/* Filtros por faixa */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por produto ou SKU"
            className="h-8 w-60 pl-8 text-xs"
          />
        </div>

        <button
          onClick={() => setFaixaFiltro("todos")}
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
            faixaFiltro === "todos"
              ? "border-brand bg-brand-soft text-brand"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          Todos ({formatNumero(anuncios.length)})
        </button>

        {ORDEM_FAIXAS.map((f) => {
          const qtd = contagemPorFaixa.get(f) ?? 0;
          if (qtd === 0) return null;
          const meta = FAIXAS[f];
          return (
            <button
              key={f}
              onClick={() => setFaixaFiltro(f)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                faixaFiltro === f
                  ? "border-brand bg-brand-soft text-brand"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <span className={cn("size-1.5 rounded-full", meta.ponto)} />
              {meta.rotulo} ({formatNumero(qtd)})
            </button>
          );
        })}
      </div>

      <Painel
        titulo="Raio-X de Anúncios"
        descricao="Cada taxa exposta na linha — sem gaveta, sem clique escondido"
        acoes={
          <ExportarDados
            nomeArquivo={`raio-x-${conta.id}`}
            linhas={filtrados.map((a) => {
              const r = raioXAnuncio(a, metas, a.precoAtual, {
                aliquotaImposto: fiscal.aliquota,
                custosOperacionais: custoOperacionalDetalhado(a.precoAtual),
              });
              return {
                SKU: a.sku,
                Produto: a.produto,
                Preço: r.precoVenda.toFixed(2),
                CMV: r.semCusto ? "não cadastrado" : r.cmv.toFixed(2),
                Imposto: r.impostos.toFixed(2),
                Comissão: r.comissao.toFixed(2),
                "Taxa fixa": r.taxaFixa.toFixed(2),
                Frete: r.frete.toFixed(2),
                "Mídia/ADS": r.midia.toFixed(2),
                Afiliados: r.afiliados.toFixed(2),
                "Custos operacionais": r.custosOperacionais.toFixed(2),
                "Total descontos": r.totalDescontos.toFixed(2),
                "Sobra no bolso": r.semCusto ? "sem cálculo" : r.lucroLiquido.toFixed(2),
                Margem: r.semCusto ? "sem cálculo" : formatPercentual(r.margem),
                Situação: FAIXAS[r.faixa].rotulo,
                Taxas: r.origemTaxas,
              };
            })}
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] text-left">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                {colunas.map((c, i) => (
                  <th
                    key={c}
                    className={cn(
                      "px-3 py-2 font-medium",
                      i === 0 && "px-4",
                      i > 0 && i < 12 && "text-right",
                    )}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrados.map((a) => (
                <LinhaAnuncio key={a.id} anuncio={a} conta={conta} metas={metas} />
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={13} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    Nenhum anúncio encontrado com esses filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Painel>

      {!metas && (
        <p className="text-[11px] text-muted-foreground">
          Sem meta de margem para este canal, só o prejuízo é sinalizado. Defina a margem mínima e
          a ideal para que o sistema classifique o que está apenas apertado.
        </p>
      )}
    </div>
  );
}
