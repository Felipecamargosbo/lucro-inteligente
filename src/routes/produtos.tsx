import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Link2, Package, Pencil, RefreshCw } from "lucide-react";
import { anunciosService, contasService, produtosService } from "@/services";
import { useConfiguracoes } from "@/context/configuracoes";
import { formatBRL, formatNumero } from "@/lib/format";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { DialogVincularProduto } from "@/components/comum/DialogVincularProduto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Anuncio, MarketplaceId, Produto } from "@/types";

export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Catálogo | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "O CMV de cada produto, cadastrado uma vez só e válido em todo marketplace vinculado.",
      },
      { property: "og:title", content: "Catálogo | NEXO Rentabilidade" },
      {
        property: "og:description",
        content: "Custo do produto cadastrado uma vez, refletido em todo anúncio vinculado.",
      },
    ],
  }),
  component: Produtos,
});

function Produtos() {
  const { atualizarConta } = useConfiguracoes();
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [canalFiltro, setCanalFiltro] = useState<MarketplaceId | "todos">("todos");
  const [buscaPendentes, setBuscaPendentes] = useState("");
  const [emVinculo, setEmVinculo] = useState<Anuncio | null>(null);
  // O catálogo e os anúncios vivem fora do React (src/data/mock.ts); este
  // contador força a releitura depois de cada sincronização/edição/vínculo.
  const [tick, setTick] = useState(0);

  const anuncios = useMemo(() => anunciosService.listar(), [tick]);

  const produtos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtosService
      .listar()
      .filter(
        (p) =>
          !termo ||
          p.sku.toLowerCase().includes(termo) ||
          p.nome.toLowerCase().includes(termo) ||
          (p.ean ?? "").includes(termo),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, tick]);

  const vinculosDoProduto = (produtoId: string) => {
    const vinculados = anuncios.filter((a) => a.produtoId === produtoId);
    const marketplaces = [...new Set(vinculados.map((a) => a.marketplaceId))];
    return { totalAnuncios: vinculados.length, marketplaces };
  };

  const totalAnuncios = anuncios.length;
  const pendentes = useMemo(() => anuncios.filter((a) => !a.produtoId), [anuncios]);
  const semVinculo = pendentes.length;

  const contagemPorCanal = useMemo(() => {
    const mapa = new Map<MarketplaceId, number>();
    for (const a of pendentes) mapa.set(a.marketplaceId, (mapa.get(a.marketplaceId) ?? 0) + 1);
    return mapa;
  }, [pendentes]);

  const pendentesFiltrados = useMemo(() => {
    const termo = buscaPendentes.trim().toLowerCase();
    return pendentes
      .filter((a) => canalFiltro === "todos" || a.marketplaceId === canalFiltro)
      .filter(
        (a) =>
          !termo || a.produto.toLowerCase().includes(termo) || a.sku.toLowerCase().includes(termo),
      )
      // Faturamento perdido primeiro: resolver o que mais vende rende mais
      .sort((a, b) => b.precoAtual * b.unidadesVendidas - a.precoAtual * a.unidadesVendidas);
  }, [pendentes, canalFiltro, buscaPendentes]);

  const iniciarEdicao = (produto: Produto) => {
    setEditando(produto.id);
    setValorEdicao(produto.cmv.toFixed(2));
  };

  const salvarCmv = (produto: Produto) => {
    const novoCmv = Number(valorEdicao.replace(",", ".")) || 0;
    produtosService.atualizarCmv(produto.id, novoCmv);
    setEditando(null);
    setTick((n) => n + 1);
    const { totalAnuncios: qtd } = vinculosDoProduto(produto.id);
    toast.success(
      qtd > 0
        ? `CMV de "${produto.nome}" atualizado — refletido em ${qtd} anúncio(s) vinculado(s).`
        : `CMV de "${produto.nome}" atualizado.`,
    );
  };

  const sincronizarTodos = async () => {
    setSincronizando(true);
    // Fictício: simula puxar o feed de LISTAGENS de cada marketplace de uma
    // vez, sem precisar entrar conta por conta. Quando a API real conectar,
    // isso vira uma chamada por conta ativa, em paralelo.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const contasAtivas = contasService.ativas();
    let vinculadosAuto = 0;
    for (const conta of contasAtivas) {
      const novo = anunciosService.puxarNovoAnuncio(conta);
      if (novo.produtoId) vinculadosAuto++;
      atualizarConta(conta.id, { ultimaSincronizacao: new Date().toISOString() });
    }
    setTick((n) => n + 1);
    setSincronizando(false);
    toast.success(
      `${formatNumero(contasAtivas.length)} conta(s) sincronizada(s) — ${formatNumero(contasAtivas.length)} anúncio(s) novo(s) encontrado(s)` +
        (vinculadosAuto > 0
          ? `, ${formatNumero(vinculadosAuto)} já vinculado(s) automaticamente pelo SKU.`
          : "."),
    );
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <Painel
        titulo="Catálogo"
        descricao="O CMV mora aqui — uma vez só. Mudar o custo de um produto atualiza na hora todo anúncio vinculado a ele, em qualquer marketplace"
        acoes={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={sincronizando} onClick={sincronizarTodos}>
              <RefreshCw className={cn("size-3.5", sincronizando && "animate-spin")} />
              {sincronizando ? "Sincronizando..." : "Sincronizar todos os marketplaces"}
            </Button>
            <ExportarDados
              nomeArquivo="catalogo"
              linhas={produtos.map((p) => {
                const { totalAnuncios: qtd, marketplaces } = vinculosDoProduto(p.id);
                return {
                  SKU: p.sku,
                  EAN: p.ean ?? "—",
                  Produto: p.nome,
                  CMV: p.cmv.toFixed(2),
                  "Anúncios vinculados": qtd,
                  Marketplaces: marketplaces.join(", ") || "—",
                };
              })}
            />
          </div>
        }
      >
        <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Produtos no catálogo
            </p>
            <p className="num text-lg font-bold">{formatNumero(produtosService.listar().length)}</p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Anúncios vinculados a um produto
            </p>
            <p className="num text-lg font-bold">
              {formatNumero(totalAnuncios - semVinculo)} de {formatNumero(totalAnuncios)}
            </p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Anúncios sem vínculo
            </p>
            <p className={`num text-lg font-bold ${semVinculo > 0 ? "text-loss" : ""}`}>
              {formatNumero(semVinculo)}
            </p>
          </div>
        </div>

        <div className="border-b p-4">
          <Input
            placeholder="Buscar por SKU, EAN ou nome do produto"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-md"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-bold">Produto</th>
                <th className="px-4 py-3 font-bold">SKU</th>
                <th className="px-4 py-3 font-bold">EAN</th>
                <th className="px-4 py-3 text-right font-bold">CMV</th>
                <th className="px-4 py-3 font-bold">Vinculado em</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {produtos.map((p) => {
                const { totalAnuncios: qtd, marketplaces } = vinculosDoProduto(p.id);
                const emEdicao = editando === p.id;
                return (
                  <tr key={p.id} className="transition-colors hover:bg-muted/40">
                    <td className="max-w-[260px] px-4 py-3">
                      <p className="truncate text-xs font-medium">{p.nome}</p>
                    </td>
                    <td className="num px-4 py-3 text-xs text-muted-foreground">{p.sku}</td>
                    <td className="num px-4 py-3 text-xs text-muted-foreground">
                      {p.ean ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {emEdicao ? (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            autoFocus
                            inputMode="decimal"
                            value={valorEdicao}
                            onChange={(e) => setValorEdicao(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && salvarCmv(p)}
                            className="num h-7 w-24 px-2 text-right text-xs"
                          />
                          <button
                            onClick={() => salvarCmv(p)}
                            title="Salvar CMV"
                            className="text-profit transition-colors hover:text-profit/80"
                          >
                            <Check className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => iniciarEdicao(p)}
                          className="num inline-flex items-center gap-1.5 text-xs font-semibold transition-colors hover:text-brand"
                        >
                          {formatBRL(p.cmv)}
                          <Pencil className="size-3" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {qtd > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {marketplaces.map((m) => (
                            <SeloMarketplace key={m} id={m} />
                          ))}
                          <span className="text-[10px] text-muted-foreground">
                            ({formatNumero(qtd)} anúncio{qtd > 1 ? "s" : ""})
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                          <Package className="size-3" />
                          Nenhum anúncio vinculado ainda
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {produtos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    Nenhum produto encontrado com esse termo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Painel>

      <Painel
        titulo="Anúncios sem vínculo"
        descricao="De todos os marketplaces, juntos — filtre por canal ou procure pra resolver rápido"
      >
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <Input
            placeholder="Buscar por SKU ou nome do anúncio"
            value={buscaPendentes}
            onChange={(e) => setBuscaPendentes(e.target.value)}
            className="h-8 max-w-xs text-xs"
          />
          <button
            onClick={() => setCanalFiltro("todos")}
            className={cn(
              "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
              canalFiltro === "todos"
                ? "border-brand bg-brand-soft text-brand"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            Todos ({formatNumero(pendentes.length)})
          </button>
          {[...contagemPorCanal.entries()].map(([marketplaceId, qtd]) => (
            <button
              key={marketplaceId}
              onClick={() => setCanalFiltro(marketplaceId)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium transition-colors",
                canalFiltro === marketplaceId
                  ? "border-brand bg-brand-soft text-brand"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <SeloMarketplace id={marketplaceId} />({formatNumero(qtd)})
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Produto / SKU</th>
                <th className="px-3 py-2 font-medium">Canal</th>
                <th className="px-3 py-2 font-medium">Conta</th>
                <th className="px-3 py-2 text-right font-medium">Preço</th>
                <th className="px-3 py-2 text-right font-medium">Un. vendidas</th>
                <th className="px-3 py-2 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {pendentesFiltrados.map((a) => {
                const conta = contasService.buscar(a.contaId);
                return (
                  <tr key={a.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="max-w-[260px] px-4 py-3">
                      <p className="truncate text-xs font-medium">{a.produto}</p>
                      <p className="num text-[10px] text-muted-foreground">{a.sku}</p>
                    </td>
                    <td className="px-3 py-3">
                      <SeloMarketplace id={a.marketplaceId} />
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {conta?.nome ?? "—"}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs">{formatBRL(a.precoAtual)}</td>
                    <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                      {formatNumero(a.unidadesVendidas)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEmVinculo(a)}>
                        <Link2 className="size-3.5" />
                        Vincular
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {pendentesFiltrados.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    {pendentes.length === 0
                      ? "Nenhum anúncio sem vínculo — catálogo em dia."
                      : "Nenhum anúncio encontrado com esses filtros."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Painel>

      {emVinculo && (
        <DialogVincularProduto
          anuncio={emVinculo}
          aoFechar={() => setEmVinculo(null)}
          aoConcluir={() => {
            setEmVinculo(null);
            setTick((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
