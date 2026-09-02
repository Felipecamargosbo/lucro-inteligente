import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Link2, Pencil, RefreshCw } from "lucide-react";
import { anunciosService, contasService, produtosService } from "@/services";
import { useConfiguracoes } from "@/context/configuracoes";
import { CANAIS } from "@/config/navegacao";
import { formatBRL, formatNumero } from "@/lib/format";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { DialogVincularProduto } from "@/components/comum/DialogVincularProduto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type StatusFiltro = "todos" | "vinculado" | "sem-vinculo";

/** Uma linha da tabela é OU um produto do catálogo (com CMV editável) OU um
 * anúncio ainda sem vínculo (com ação de vincular) — o mesmo lugar, duas
 * naturezas de linha, pra não obrigar o seller a ficar pulando de tela. */
type LinhaCatalogo =
  | { tipo: "produto"; id: string; produto: Produto; qtd: number; marketplaces: MarketplaceId[] }
  | { tipo: "pendente"; id: string; anuncio: Anuncio };

function Produtos() {
  const { atualizarConta } = useConfiguracoes();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const [canalFiltro, setCanalFiltro] = useState<MarketplaceId | "todos">("todos");
  const [editando, setEditando] = useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [emVinculo, setEmVinculo] = useState<Anuncio | null>(null);
  // O catálogo e os anúncios vivem fora do React (src/data/mock.ts); este
  // contador força a releitura depois de cada sincronização/edição/vínculo.
  const [tick, setTick] = useState(0);

  const anuncios = useMemo(() => anunciosService.listar(), [tick]);
  const pendentes = useMemo(() => anuncios.filter((a) => !a.produtoId), [anuncios]);

  const vinculosDoProduto = (produtoId: string) => {
    const vinculados = anuncios.filter((a) => a.produtoId === produtoId);
    const marketplaces = [...new Set(vinculados.map((a) => a.marketplaceId))];
    return { totalAnuncios: vinculados.length, marketplaces };
  };

  const totalAnuncios = anuncios.length;
  const semVinculo = pendentes.length;

  // Uma linha por produto do catálogo + uma linha por anúncio pendente —
  // tudo na mesma tabela, filtrado do mesmo jeito.
  const linhas = useMemo<LinhaCatalogo[]>(() => {
    const doProdutos: LinhaCatalogo[] = produtosService.listar().map((p) => {
      const { totalAnuncios: qtd, marketplaces } = vinculosDoProduto(p.id);
      return { tipo: "produto", id: p.id, produto: p, qtd, marketplaces };
    });
    const doPendentes: LinhaCatalogo[] = pendentes
      // Faturamento perdido primeiro: resolver o que mais vende rende mais
      .slice()
      .sort((a, b) => b.precoAtual * b.unidadesVendidas - a.precoAtual * a.unidadesVendidas)
      .map((a) => ({ tipo: "pendente", id: a.id, anuncio: a }));
    return [...doProdutos, ...doPendentes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, pendentes]);

  const contagemPorCanal = useMemo(() => {
    // Começa com todos os canais em 0 — assim nenhum some da lista, mesmo
    // sem nada vinculado ainda (é só entrar e ver zerado).
    const mapa = new Map<MarketplaceId, number>(CANAIS.map((c) => [c.id, 0]));
    for (const l of linhas) {
      if (statusFiltro === "vinculado" && l.tipo !== "produto") continue;
      if (statusFiltro === "sem-vinculo" && l.tipo !== "pendente") continue;
      const canais = l.tipo === "produto" ? l.marketplaces : [l.anuncio.marketplaceId];
      for (const c of canais) mapa.set(c, (mapa.get(c) ?? 0) + 1);
    }
    return mapa;
  }, [linhas, statusFiltro]);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (statusFiltro === "vinculado" && l.tipo !== "produto") return false;
      if (statusFiltro === "sem-vinculo" && l.tipo !== "pendente") return false;

      const canais = l.tipo === "produto" ? l.marketplaces : [l.anuncio.marketplaceId];
      if (canalFiltro !== "todos" && !canais.includes(canalFiltro)) return false;

      if (termo) {
        const alvo =
          l.tipo === "produto"
            ? `${l.produto.nome} ${l.produto.sku} ${l.produto.ean ?? ""}`
            : `${l.anuncio.produto} ${l.anuncio.sku}`;
        if (!alvo.toLowerCase().includes(termo)) return false;
      }
      return true;
    });
  }, [linhas, statusFiltro, canalFiltro, busca]);

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

  const BOTOES_STATUS: { id: StatusFiltro; rotulo: string; qtd: number }[] = [
    { id: "todos", rotulo: "Todos", qtd: linhas.length },
    {
      id: "vinculado",
      rotulo: "Com vínculo",
      qtd: linhas.filter((l) => l.tipo === "produto").length,
    },
    { id: "sem-vinculo", rotulo: "Sem vínculo", qtd: semVinculo },
  ];

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
              linhas={produtosService.listar().map((p) => {
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

        {/* Busca + duas listas suspensas: status (vinculado/sem vínculo) e canal */}
        <div className="flex flex-wrap items-center gap-2 border-b p-4">
          <Input
            placeholder="Buscar por SKU, EAN ou nome"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="h-8 max-w-xs text-xs"
          />

          <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as StatusFiltro)}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {BOTOES_STATUS.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.rotulo} ({formatNumero(b.qtd)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={canalFiltro}
            onValueChange={(v) => setCanalFiltro(v as MarketplaceId | "todos")}
          >
            <SelectTrigger className="h-8 w-56 text-xs">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">
                Todos os canais ({formatNumero([...contagemPorCanal.values()].reduce((s, n) => s + n, 0))})
              </SelectItem>
              {CANAIS.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.titulo} ({formatNumero(contagemPorCanal.get(c.id) ?? 0)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-bold">Produto / SKU</th>
                <th className="px-4 py-3 font-bold">EAN</th>
                <th className="px-4 py-3 text-right font-bold">CMV</th>
                <th className="px-4 py-3 font-bold">Canal / vínculo</th>
                <th className="px-4 py-3 text-right font-bold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {linhasFiltradas.map((linha) => {
                if (linha.tipo === "produto") {
                  const p = linha.produto;
                  const emEdicao = editando === p.id;
                  return (
                    <tr key={`p-${linha.id}`} className="transition-colors hover:bg-muted/40">
                      <td className="max-w-[260px] px-4 py-3">
                        <p className="truncate text-xs font-medium">{p.nome}</p>
                        <p className="num text-[10px] text-muted-foreground">{p.sku}</p>
                      </td>
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
                        {linha.qtd > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {linha.marketplaces.map((m) => (
                              <SeloMarketplace key={m} id={m} />
                            ))}
                            <span className="text-[10px] text-muted-foreground">
                              ({formatNumero(linha.qtd)} anúncio{linha.qtd > 1 ? "s" : ""})
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                            Nenhum anúncio vinculado ainda
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-[11px] text-muted-foreground">—</td>
                    </tr>
                  );
                }

                const a = linha.anuncio;
                const conta = contasService.buscar(a.contaId);
                return (
                  <tr key={`a-${linha.id}`} className="bg-loss-soft/20 transition-colors hover:bg-loss-soft/30">
                    <td className="max-w-[260px] px-4 py-3">
                      <p className="truncate text-xs font-medium">{a.produto}</p>
                      <p className="num text-[10px] text-muted-foreground">{a.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">—</td>
                    <td className="px-4 py-3 text-right">
                      <span className="inline-flex items-center gap-1.5 rounded bg-loss-soft px-2 py-1 text-[10px] font-semibold text-loss">
                        sem vínculo
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SeloMarketplace id={a.marketplaceId} />
                        <span className="text-[10px] text-muted-foreground">
                          {conta?.nome ?? "—"} · {formatBRL(a.precoAtual)} ·{" "}
                          {formatNumero(a.unidadesVendidas)} un.
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEmVinculo(a)}>
                        <Link2 className="size-3.5" />
                        Vincular
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {linhasFiltradas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    Nada encontrado com esses filtros.
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
