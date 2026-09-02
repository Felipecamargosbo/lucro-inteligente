import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Link2, Pencil, RefreshCw } from "lucide-react";
import { anunciosService, contasService, produtosService } from "@/services";
import { useConfiguracoes } from "@/context/configuracoes";
import { CANAIS } from "@/config/navegacao";
import { formatBRL, formatNumero } from "@/lib/format";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { DialogVincularProduto } from "@/components/comum/DialogVincularProduto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  | {
      tipo: "produto";
      id: string;
      produto: Produto;
      qtd: number;
      marketplaces: MarketplaceId[];
      contas: string[];
    }
  | { tipo: "pendente"; id: string; anuncio: Anuncio };

/** Lista suspensa com caixinhas de marcar — pra filtrar por vários canais ou
 * várias contas ao mesmo tempo (ex: ver Shopee + Mercado Livre juntos). */
function FiltroMultiSelect<T extends string>({
  rotulo,
  todosRotulo,
  opcoes,
  selecionados,
  aoMudar,
}: {
  rotulo: string;
  todosRotulo: string;
  opcoes: { valor: T; titulo: string; qtd: number }[];
  selecionados: Set<T>;
  aoMudar: (proximo: Set<T>) => void;
}) {
  const alternar = (valor: T) => {
    const proximo = new Set(selecionados);
    if (proximo.has(valor)) proximo.delete(valor);
    else proximo.add(valor);
    aoMudar(proximo);
  };

  const rotuloBotao =
    selecionados.size === 0
      ? todosRotulo
      : selecionados.size === 1
        ? (opcoes.find((o) => selecionados.has(o.valor))?.titulo ?? todosRotulo)
        : `${selecionados.size} selecionados`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-56 justify-between text-xs font-normal"
        >
          <span className="truncate">{rotuloBotao}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="flex items-center justify-between px-1 pb-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {rotulo}
          </p>
          {selecionados.size > 0 && (
            <button
              onClick={() => aoMudar(new Set())}
              className="text-[10px] font-medium text-brand hover:underline"
            >
              Limpar
            </button>
          )}
        </div>
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {opcoes.map((o) => (
            <label
              key={o.valor}
              className="flex cursor-pointer items-center justify-between gap-2 rounded px-2 py-1.5 text-xs hover:bg-muted"
            >
              <span className="flex items-center gap-2">
                <Checkbox
                  checked={selecionados.has(o.valor)}
                  onCheckedChange={() => alternar(o.valor)}
                />
                {o.titulo}
              </span>
              <span className="num text-[10px] text-muted-foreground">
                {formatNumero(o.qtd)}
              </span>
            </label>
          ))}
          {opcoes.length === 0 && (
            <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
              Nenhuma opção com os filtros atuais
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Produtos() {
  const { atualizarConta } = useConfiguracoes();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  // Vazio = "todos os canais/lojas" — selecionar um ou mais restringe a lista.
  const [canaisFiltro, setCanaisFiltro] = useState<Set<MarketplaceId>>(new Set());
  const [contasFiltro, setContasFiltro] = useState<Set<string>>(new Set());
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
    const contas = [...new Set(vinculados.map((a) => a.contaId))];
    return { totalAnuncios: vinculados.length, marketplaces, contas };
  };

  /** Troca o canal selecionado e já tira do filtro de loja qualquer conta que
   * não pertença mais a nenhum dos canais escolhidos — pra não deixar um
   * filtro de loja "fantasma" travado depois de mudar o canal. */
  const mudarCanaisFiltro = (proximo: Set<MarketplaceId>) => {
    setCanaisFiltro(proximo);
    if (proximo.size === 0) return;
    setContasFiltro((atual) => {
      const validas = new Set(
        contasService.listar().filter((c) => proximo.has(c.marketplaceId)).map((c) => c.id),
      );
      const filtrado = new Set([...atual].filter((id) => validas.has(id)));
      return filtrado.size === atual.size ? atual : filtrado;
    });
  };

  const totalAnuncios = anuncios.length;
  const semVinculo = pendentes.length;

  // Uma linha por produto do catálogo + uma linha por anúncio pendente —
  // tudo na mesma tabela, filtrado do mesmo jeito.
  const linhas = useMemo<LinhaCatalogo[]>(() => {
    const doProdutos: LinhaCatalogo[] = produtosService.listar().map((p) => {
      const { totalAnuncios: qtd, marketplaces, contas } = vinculosDoProduto(p.id);
      return { tipo: "produto", id: p.id, produto: p, qtd, marketplaces, contas };
    });
    const doPendentes: LinhaCatalogo[] = pendentes
      // Faturamento perdido primeiro: resolver o que mais vende rende mais
      .slice()
      .sort((a, b) => b.precoAtual * b.unidadesVendidas - a.precoAtual * a.unidadesVendidas)
      .map((a) => ({ tipo: "pendente", id: a.id, anuncio: a }));
    return [...doProdutos, ...doPendentes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, pendentes]);

  // Contagens "facetadas": o filtro de canal respeita a loja já escolhida, e
  // vice-versa — assim os números na lista suspensa nunca mentem sobre o que
  // vai aparecer se você marcar aquela opção.
  const contagemPorCanal = useMemo(() => {
    // Começa com todos os canais em 0 — assim nenhum some da lista, mesmo
    // sem nada vinculado ainda (é só entrar e ver zerado).
    const mapa = new Map<MarketplaceId, number>(CANAIS.map((c) => [c.id, 0]));
    for (const l of linhas) {
      if (statusFiltro === "vinculado" && l.tipo !== "produto") continue;
      if (statusFiltro === "sem-vinculo" && l.tipo !== "pendente") continue;
      const contas = l.tipo === "produto" ? l.contas : [l.anuncio.contaId];
      if (contasFiltro.size > 0 && !contas.some((c) => contasFiltro.has(c))) continue;
      const canais = l.tipo === "produto" ? l.marketplaces : [l.anuncio.marketplaceId];
      for (const c of canais) mapa.set(c, (mapa.get(c) ?? 0) + 1);
    }
    return mapa;
  }, [linhas, statusFiltro, contasFiltro]);

  const contagemPorConta = useMemo(() => {
    const mapa = new Map<string, number>(contasService.listar().map((c) => [c.id, 0]));
    for (const l of linhas) {
      if (statusFiltro === "vinculado" && l.tipo !== "produto") continue;
      if (statusFiltro === "sem-vinculo" && l.tipo !== "pendente") continue;
      const canais = l.tipo === "produto" ? l.marketplaces : [l.anuncio.marketplaceId];
      if (canaisFiltro.size > 0 && !canais.some((c) => canaisFiltro.has(c))) continue;
      const contas = l.tipo === "produto" ? l.contas : [l.anuncio.contaId];
      for (const c of contas) mapa.set(c, (mapa.get(c) ?? 0) + 1);
    }
    return mapa;
  }, [linhas, statusFiltro, canaisFiltro]);

  // Lojas disponíveis pra marcar: só as dos canais escolhidos (ou todas, se
  // nenhum canal estiver marcado) — evita listar "Amazon Outlet" quando só
  // Shopee está selecionado.
  const opcoesConta = useMemo(() => {
    return contasService
      .listar()
      .filter((c) => canaisFiltro.size === 0 || canaisFiltro.has(c.marketplaceId))
      .map((c) => {
        const canal = CANAIS.find((cn) => cn.id === c.marketplaceId);
        return {
          valor: c.id,
          titulo: canal ? `${c.nome} · ${canal.titulo}` : c.nome,
          qtd: contagemPorConta.get(c.id) ?? 0,
        };
      });
  }, [canaisFiltro, contagemPorConta]);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (statusFiltro === "vinculado" && l.tipo !== "produto") return false;
      if (statusFiltro === "sem-vinculo" && l.tipo !== "pendente") return false;

      const canais = l.tipo === "produto" ? l.marketplaces : [l.anuncio.marketplaceId];
      if (canaisFiltro.size > 0 && !canais.some((c) => canaisFiltro.has(c))) return false;

      const contas = l.tipo === "produto" ? l.contas : [l.anuncio.contaId];
      if (contasFiltro.size > 0 && !contas.some((c) => contasFiltro.has(c))) return false;

      if (termo) {
        const alvo =
          l.tipo === "produto"
            ? `${l.produto.nome} ${l.produto.sku} ${l.produto.ean ?? ""}`
            : `${l.anuncio.produto} ${l.anuncio.sku}`;
        if (!alvo.toLowerCase().includes(termo)) return false;
      }
      return true;
    });
  }, [linhas, statusFiltro, canaisFiltro, contasFiltro, busca]);

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

        {/* Busca + 3 filtros, cada um com sua etiqueta — pra nunca ficar
            ambíguo o que "Todos" significa (todos os quê?). Canal e Loja
            aceitam marcar mais de uma opção ao mesmo tempo (ex: ver Shopee +
            Mercado Livre juntos). */}
        <div className="flex flex-wrap items-end gap-3 border-b p-4">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Buscar
            </p>
            <Input
              placeholder="SKU, EAN ou nome"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-8 w-48 text-xs"
            />
          </div>

          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Vínculo com CMV
            </p>
            <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as StatusFiltro)}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue placeholder="Vínculo" />
              </SelectTrigger>
              <SelectContent>
                {BOTOES_STATUS.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.rotulo} ({formatNumero(b.qtd)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Canal
            </p>
            <FiltroMultiSelect
              rotulo="Marcar um ou mais canais"
              todosRotulo="Todos os canais"
              opcoes={CANAIS.map((c) => ({
                valor: c.id,
                titulo: c.titulo,
                qtd: contagemPorCanal.get(c.id) ?? 0,
              }))}
              selecionados={canaisFiltro}
              aoMudar={mudarCanaisFiltro}
            />
          </div>

          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Loja / conta
            </p>
            <FiltroMultiSelect
              rotulo="Marcar uma ou mais lojas"
              todosRotulo="Todas as lojas"
              opcoes={opcoesConta}
              selecionados={contasFiltro}
              aoMudar={setContasFiltro}
            />
          </div>
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
