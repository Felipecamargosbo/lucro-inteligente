import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Link2, Pencil, RefreshCw } from "lucide-react";
import { anunciosService, contasService, produtosService } from "@/services";
import { useConfiguracoes } from "@/context/configuracoes";
import { CANAIS } from "@/config/navegacao";
import { formatBRL, formatNumero } from "@/lib/format";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
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
      /** Total vinculado em qualquer canal/loja — usado só nas contagens do filtro. */
      qtd: number;
      marketplaces: MarketplaceId[];
      contas: string[];
      /** Recorte pro canal/loja marcado agora — é o que a linha MOSTRA na tabela. */
      qtdNaSelecao: number;
      marketplacesNaSelecao: MarketplaceId[];
    }
  | { tipo: "pendente"; id: string; anuncio: Anuncio };

/**
 * Filtro único de canal + loja, em árvore — igual o "Todas as contas" do
 * Dashboard: uma lista só, o canal por cima com sua caixinha, as lojas
 * daquele canal logo abaixo dele, indentadas. Nada de canal e loja em
 * caixinhas separadas — é a mesma pergunta ("onde eu quero olhar?"), então é
 * um filtro só.
 */
function FiltroCanalConta({
  contagemPorCanal,
  contagemPorConta,
  selecionadas,
  aoMudarSelecionadas,
}: {
  contagemPorCanal: Map<MarketplaceId, number>;
  contagemPorConta: Map<string, number>;
  selecionadas: Set<string>;
  aoMudarSelecionadas: (proximo: Set<string>) => void;
}) {
  const todasContas = contasService.listar();
  const todasSelecionadas = todasContas.length > 0 && selecionadas.size === todasContas.length;

  const contasDoCanal = (canalId: MarketplaceId) =>
    todasContas.filter((c) => c.marketplaceId === canalId);

  const estadoCanal = (canalId: MarketplaceId): "todas" | "parcial" | "nenhuma" => {
    const doCanal = contasDoCanal(canalId);
    if (doCanal.length === 0) return "nenhuma";
    const marcadas = doCanal.filter((c) => selecionadas.has(c.id)).length;
    if (marcadas === 0) return "nenhuma";
    if (marcadas === doCanal.length) return "todas";
    return "parcial";
  };

  const rotuloResumo = (() => {
    if (todasSelecionadas) return "Todas as contas";
    if (selecionadas.size === 0) return "Nenhuma conta";
    for (const canal of CANAIS) {
      const doCanal = contasDoCanal(canal.id);
      if (
        doCanal.length > 0 &&
        doCanal.length === selecionadas.size &&
        doCanal.every((c) => selecionadas.has(c.id))
      ) {
        return canal.titulo;
      }
    }
    return `${selecionadas.size} conta${selecionadas.size > 1 ? "s" : ""}`;
  })();

  const alternarCanal = (canalId: MarketplaceId) => {
    const doCanal = contasDoCanal(canalId);
    const marcarTudo = estadoCanal(canalId) !== "todas";
    const proximo = new Set(selecionadas);
    for (const c of doCanal) {
      if (marcarTudo) proximo.add(c.id);
      else proximo.delete(c.id);
    }
    aoMudarSelecionadas(proximo);
  };

  const alternarConta = (contaId: string) => {
    const proximo = new Set(selecionadas);
    if (proximo.has(contaId)) proximo.delete(contaId);
    else proximo.add(contaId);
    aoMudarSelecionadas(proximo);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-56 justify-between text-xs font-normal"
        >
          <span className="truncate">{rotuloResumo}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => aoMudarSelecionadas(new Set(todasContas.map((c) => c.id)))}
            className={cn(
              "flex-1 rounded-md px-3 py-2 text-left text-sm transition-colors",
              todasSelecionadas
                ? "bg-brand-soft font-semibold text-brand"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            Todas as contas
          </button>
          <button
            onClick={() => aoMudarSelecionadas(new Set())}
            className="shrink-0 rounded-md px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Limpar tudo
          </button>
        </div>

        <div className="mt-1 max-h-80 space-y-0.5 overflow-y-auto border-t pt-1">
          {CANAIS.map((canal) => {
            const doCanal = contasDoCanal(canal.id);
            if (doCanal.length === 0) return null;
            const estado = estadoCanal(canal.id);

            return (
              <div key={canal.id} className="py-1">
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                  <Checkbox
                    checked={
                      estado === "todas" ? true : estado === "parcial" ? "indeterminate" : false
                    }
                    onCheckedChange={() => alternarCanal(canal.id)}
                  />
                  <LogoMarketplace id={canal.id} tamanho="xs" />
                  <span className="flex-1 text-sm font-medium">{canal.titulo}</span>
                  <span className="num text-[10px] text-muted-foreground">
                    {formatNumero(contagemPorCanal.get(canal.id) ?? 0)}
                  </span>
                </label>

                {doCanal.length > 1 && (
                  <div className="ml-6 space-y-0.5">
                    {doCanal.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
                      >
                        <Checkbox
                          checked={selecionadas.has(c.id)}
                          onCheckedChange={() => alternarConta(c.id)}
                        />
                        <span className="flex-1 truncate text-[13px] text-muted-foreground">
                          {c.nome}
                        </span>
                        <span className="num text-[10px] text-muted-foreground">
                          {formatNumero(contagemPorConta.get(c.id) ?? 0)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Produtos() {
  const { atualizarConta } = useConfiguracoes();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  // Começa com todas as contas marcadas (= sem restrição nenhuma). Filtro
  // único de canal + loja, em árvore, igual o "Todas as contas" do Dashboard.
  const [contasSelecionadas, setContasSelecionadas] = useState<Set<string>>(
    () => new Set(contasService.listar().map((c) => c.id)),
  );
  const [editando, setEditando] = useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [emVinculo, setEmVinculo] = useState<Anuncio | null>(null);
  // O catálogo e os anúncios vivem fora do React (src/data/mock.ts); este
  // contador força a releitura depois de cada sincronização/edição/vínculo.
  const [tick, setTick] = useState(0);

  const anuncios = useMemo(() => anunciosService.listar(), [tick]);
  const pendentes = useMemo(() => anuncios.filter((a) => !a.produtoId), [anuncios]);

  // "Todas as contas" marcadas = sem restrição nenhuma (mantém, por exemplo,
  // produto que ainda não tem nenhum anúncio em lugar nenhum). Só passa a
  // exigir presença numa das contas marcadas quando o seller desmarca algo.
  const totalContas = contasService.listar().length;
  const semRestricaoDeConta = contasSelecionadas.size === totalContas;

  const vinculosDoProduto = (produtoId: string) => {
    const vinculados = anuncios.filter((a) => a.produtoId === produtoId);
    // "Totais": todo mundo que está vinculado, em qualquer canal/loja — usado
    // pra decidir SE a linha aparece e pras contagens do próprio filtro (elas
    // não podem se esconder quando você desmarca a opção que descrevem).
    const marketplaces = [...new Set(vinculados.map((a) => a.marketplaceId))];
    const contas = [...new Set(vinculados.map((a) => a.contaId))];
    // "Na seleção": só o que está dentro do canal/loja marcado agora — é o
    // que a linha MOSTRA na coluna de canal, pra não exibir Mercado Livre e
    // Amazon quando o seller marcou só Shopee.
    const vinculadosNaSelecao = semRestricaoDeConta
      ? vinculados
      : vinculados.filter((a) => contasSelecionadas.has(a.contaId));
    const marketplacesNaSelecao = [...new Set(vinculadosNaSelecao.map((a) => a.marketplaceId))];
    return {
      totalAnuncios: vinculados.length,
      marketplaces,
      contas,
      totalAnunciosNaSelecao: vinculadosNaSelecao.length,
      marketplacesNaSelecao,
    };
  };

  const totalAnuncios = anuncios.length;
  const semVinculo = pendentes.length;

  // Uma linha por produto do catálogo + uma linha por anúncio pendente —
  // tudo na mesma tabela, filtrado do mesmo jeito.
  const linhas = useMemo<LinhaCatalogo[]>(() => {
    const doProdutos: LinhaCatalogo[] = produtosService.listar().map((p) => {
      const { totalAnuncios: qtd, marketplaces, contas, totalAnunciosNaSelecao, marketplacesNaSelecao } =
        vinculosDoProduto(p.id);
      return {
        tipo: "produto",
        id: p.id,
        produto: p,
        qtd,
        marketplaces,
        contas,
        qtdNaSelecao: totalAnunciosNaSelecao,
        marketplacesNaSelecao,
      };
    });
    const doPendentes: LinhaCatalogo[] = pendentes
      // Faturamento perdido primeiro: resolver o que mais vende rende mais
      .slice()
      .sort((a, b) => b.precoAtual * b.unidadesVendidas - a.precoAtual * a.unidadesVendidas)
      .map((a) => ({ tipo: "pendente", id: a.id, anuncio: a }));
    return [...doProdutos, ...doPendentes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, pendentes, contasSelecionadas, semRestricaoDeConta]);

  // Contagens que aparecem do lado de cada canal/loja no filtro — só
  // respeitam o "Vínculo com CMV", pra servir de guia de qual opção marcar
  // (não faz sentido uma contagem que já se esconde quando você desmarca a
  // própria opção que ela descreve).
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

  const contagemPorConta = useMemo(() => {
    const mapa = new Map<string, number>(contasService.listar().map((c) => [c.id, 0]));
    for (const l of linhas) {
      if (statusFiltro === "vinculado" && l.tipo !== "produto") continue;
      if (statusFiltro === "sem-vinculo" && l.tipo !== "pendente") continue;
      const contas = l.tipo === "produto" ? l.contas : [l.anuncio.contaId];
      for (const c of contas) mapa.set(c, (mapa.get(c) ?? 0) + 1);
    }
    return mapa;
  }, [linhas, statusFiltro]);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (statusFiltro === "vinculado" && l.tipo !== "produto") return false;
      if (statusFiltro === "sem-vinculo" && l.tipo !== "pendente") return false;

      if (!semRestricaoDeConta) {
        const contas = l.tipo === "produto" ? l.contas : [l.anuncio.contaId];
        if (!contas.some((c) => contasSelecionadas.has(c))) return false;
      }

      if (termo) {
        const alvo =
          l.tipo === "produto"
            ? `${l.produto.nome} ${l.produto.sku} ${l.produto.ean ?? ""}`
            : `${l.anuncio.produto} ${l.anuncio.sku}`;
        if (!alvo.toLowerCase().includes(termo)) return false;
      }
      return true;
    });
  }, [linhas, statusFiltro, contasSelecionadas, semRestricaoDeConta, busca]);

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

        {/* Busca + 2 filtros, cada um com sua etiqueta — pra nunca ficar
            ambíguo o que "Todos" significa (todos os quê?). Canal e loja
            moram juntos num filtro só, em árvore, igual o "Todas as contas"
            do Dashboard — não faz sentido separar os dois. */}
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
              Canal / loja
            </p>
            <FiltroCanalConta
              contagemPorCanal={contagemPorCanal}
              contagemPorConta={contagemPorConta}
              selecionadas={contasSelecionadas}
              aoMudarSelecionadas={setContasSelecionadas}
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
                        {linha.qtdNaSelecao > 0 ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            {linha.marketplacesNaSelecao.map((m) => (
                              <SeloMarketplace key={m} id={m} />
                            ))}
                            <span className="text-[10px] text-muted-foreground">
                              ({formatNumero(linha.qtdNaSelecao)} anúncio
                              {linha.qtdNaSelecao > 1 ? "s" : ""})
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
