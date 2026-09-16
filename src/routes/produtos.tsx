import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronRight, Link2, Loader2, Pencil, Plus, RefreshCw } from "lucide-react";
import { anunciosService, contasService, produtosService } from "@/services";
import { useAuth } from "@/context/auth";
import { useConfiguracoes } from "@/context/configuracoes";
import { useSelecaoContas } from "@/context/selecao-contas";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { FAIXAS_MARGEM_PADRAO, limitesDePreco, type LimitesPreco } from "@/lib/finance";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { DialogVincularProduto } from "@/components/comum/DialogVincularProduto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
      { title: "Custos | Planeta97" },
      {
        name: "description",
        content:
          "O CMV de cada produto, cadastrado uma vez só e válido em todo marketplace vinculado.",
      },
      { property: "og:title", content: "Custos | Planeta97" },
      {
        property: "og:description",
        content: "Custo do produto cadastrado uma vez, refletido em todo anúncio vinculado.",
      },
    ],
  }),
  component: Produtos,
});

type StatusFiltro = "todos" | "vinculado" | "sem-vinculo";

/** Um anúncio do produto já com os limites de preço calculados para o canal
 * dele. O mesmo produto tem limites diferentes em cada marketplace, porque
 * comissão e frete mudam — por isso isto é uma lista, não um número só. */
interface LimitePorCanal {
  anuncio: Anuncio;
  nomeConta: string;
  margemMinima: number;
  limites: LimitesPreco;
}

/** Resumo do produto a partir dos canais dele — é o que a linha fechada
 * mostra, pra dar pra bater o olho sem precisar abrir. */
type SituacaoProduto = "ok" | "abaixo" | "prejuizo" | "sem-anuncio";

/**
 * Uma linha da tabela é OU um produto cadastrado (com CMV editável) OU um
 * anúncio ainda sem vínculo (com ação de vincular) — o mesmo lugar, duas
 * naturezas de linha, pra não obrigar o seller a ficar pulando de tela.
 */
type LinhaCustos =
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
      /** Limites de preço, um por anúncio dentro da seleção atual */
      limitesPorCanal: LimitePorCanal[];
      situacao: SituacaoProduto;
      /** Quantos canais estão abaixo da margem mínima */
      qtdAbaixo: number;
    }
  | { tipo: "pendente"; id: string; anuncio: Anuncio };

function Produtos() {
  const { atualizarConta, metasPorConta, fiscal, custoOperacionalTotal } =
    useConfiguracoes();
  // Mesmo filtro de contas do topo da tela (o "Todas as contas" ao lado do
  // título, igual no Dashboard) — a tela de Custos passou a usar esse filtro
  // global em vez de ter um seletor próprio e separado.
  const { selecionadas: contasSelecionadas, todasSelecionadas: semRestricaoDeConta } =
    useSelecaoContas();
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const [editando, setEditando] = useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");
  const [sincronizando, setSincronizando] = useState(false);
  const [emVinculo, setEmVinculo] = useState<Anuncio | null>(null);
  const [novoProdutoAberto, setNovoProdutoAberto] = useState(false);
  /** Produto com os canais abertos; null = todos fechados */
  const [expandido, setExpandido] = useState<string | null>(null);
  // Os anúncios ainda vivem fora do React (src/data/mock.ts) — dependem da
  // API do marketplace, que depende do CNPJ. Este contador força a
  // releitura deles depois de cada sincronização/edição/vínculo.
  const [tick, setTick] = useState(0);

  const { sessao } = useAuth();
  // Os produtos, esses já são de verdade: vêm do Supabase, um por seller.
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(true);

  const carregarProdutos = useCallback(async () => {
    if (!sessao) return;
    const lista = await produtosService.listar(sessao.user.id);
    // Casa cada produto real com os anúncios de exemplo pelo SKU — é isso
    // que faz o resto do sistema (Vendas, Dashboard) enxergar o CMV real
    // sem precisar saber que o catálogo agora vem do banco.
    produtosService.reconciliarComAnuncios(lista);
    setProdutos(lista);
    setCarregandoProdutos(false);
    setTick((n) => n + 1);
  }, [sessao]);

  useEffect(() => {
    carregarProdutos();
  }, [carregarProdutos]);

  const anuncios = useMemo(() => anunciosService.listar(), [tick]);
  const pendentes = useMemo(() => anuncios.filter((a) => !a.produtoId), [anuncios]);

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
      anunciosNaSelecao: vinculadosNaSelecao,
    };
  };

  const totalAnuncios = anuncios.length;
  const semVinculo = pendentes.length;

  // Uma linha por produto cadastrado + uma linha por anúncio pendente —
  // tudo na mesma tabela, filtrado do mesmo jeito.
  const linhas = useMemo<LinhaCustos[]>(() => {
    const doProdutos: LinhaCustos[] = produtos.map((p) => {
      const {
        totalAnuncios: qtd,
        marketplaces,
        contas,
        totalAnunciosNaSelecao,
        marketplacesNaSelecao,
        anunciosNaSelecao,
      } = vinculosDoProduto(p.id);

      // O CMV mora no produto, não no anúncio: é isso que faz mudar o custo
      // aqui refletir em todo canal de uma vez.
      const limitesPorCanal: LimitePorCanal[] = anunciosNaSelecao.map((a) => {
        const metas = metasPorConta[a.contaId] ?? null;
        const margemMinima = metas?.margemMinima ?? FAIXAS_MARGEM_PADRAO.margemMinima;
        return {
          anuncio: a,
          nomeConta: contasService.buscar(a.contaId)?.nome ?? "—",
          margemMinima,
          limites: limitesDePreco({ ...a, cmv: p.cmv }, margemMinima, {
            aliquotaImposto: fiscal.aliquota,
            custosOperacionais: custoOperacionalTotal,
          }),
        };
      });

      const qtdAbaixo = limitesPorCanal.filter((l) => l.limites.abaixoDoMinimo).length;
      const temPrejuizo = limitesPorCanal.some((l) => l.limites.emPrejuizo);
      const situacao: SituacaoProduto =
        limitesPorCanal.length === 0
          ? "sem-anuncio"
          : temPrejuizo
            ? "prejuizo"
            : qtdAbaixo > 0
              ? "abaixo"
              : "ok";

      return {
        tipo: "produto",
        id: p.id,
        produto: p,
        qtd,
        marketplaces,
        contas,
        qtdNaSelecao: totalAnunciosNaSelecao,
        marketplacesNaSelecao,
        limitesPorCanal,
        situacao,
        qtdAbaixo,
      };
    });
    const doPendentes: LinhaCustos[] = pendentes
      // Faturamento perdido primeiro: resolver o que mais vende rende mais
      .slice()
      .sort((a, b) => b.precoAtual * b.unidadesVendidas - a.precoAtual * a.unidadesVendidas)
      .map((a) => ({ tipo: "pendente", id: a.id, anuncio: a }));
    return [...doProdutos, ...doPendentes];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    tick,
    produtos,
    pendentes,
    contasSelecionadas,
    semRestricaoDeConta,
    metasPorConta,
    fiscal,
    custoOperacionalTotal,
  ]);

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

  /** Quantos produtos têm pelo menos um canal fora da margem mínima */
  const produtosForaDaMeta = linhas.filter(
    (l) => l.tipo === "produto" && (l.situacao === "abaixo" || l.situacao === "prejuizo"),
  ).length;

  const iniciarEdicao = (produto: Produto) => {
    setEditando(produto.id);
    setValorEdicao(produto.cmv.toFixed(2));
  };

  const salvarCmv = async (produto: Produto) => {
    const novoCmv = Number(valorEdicao.replace(",", ".")) || 0;
    setEditando(null);
    const { erro } = await produtosService.atualizarCmv(produto.id, novoCmv);
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      return;
    }
    await carregarProdutos();
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
        titulo="Custos"
        descricao="O CMV mora aqui — uma vez só. Mudar o custo de um produto atualiza na hora todo anúncio vinculado a ele, em qualquer marketplace"
        acoes={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setNovoProdutoAberto(true)}>
              <Plus className="size-3.5" />
              Novo produto
            </Button>
            <Button size="sm" variant="outline" disabled={sincronizando} onClick={sincronizarTodos}>
              <RefreshCw className={cn("size-3.5", sincronizando && "animate-spin")} />
              {sincronizando ? "Sincronizando..." : "Sincronizar todos os marketplaces"}
            </Button>
            <ExportarDados
              nomeArquivo="custos"
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
        <div className="grid gap-3 border-b p-4 sm:grid-cols-4">
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Produtos cadastrados
            </p>
            <p className="num text-lg font-bold">{formatNumero(produtos.length)}</p>
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
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Produtos fora da margem mínima
            </p>
            <p className={`num text-lg font-bold ${produtosForaDaMeta > 0 ? "text-warning" : ""}`}>
              {formatNumero(produtosForaDaMeta)}
            </p>
          </div>
        </div>

        {/* Busca + Vínculo com CMV — o filtro de canal/loja já fica lá em
            cima, do lado do nome da tela de Custos. Cada um com sua etiqueta,
            pra nunca ficar ambíguo o que "Todos" significa (todos os quê?). */}
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-bold">Produto / SKU</th>
                <th className="px-4 py-3 font-bold">EAN</th>
                <th className="px-4 py-3 text-right font-bold">CMV</th>
                <th className="px-4 py-3 font-bold">Canal / vínculo</th>
                <th className="px-4 py-3 font-bold">Situação</th>
                <th className="px-4 py-3 text-right font-bold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {linhasFiltradas.map((linha) => {
                if (linha.tipo === "produto") {
                  const p = linha.produto;
                  const emEdicao = editando === p.id;
                  const aberto = expandido === p.id;
                  const podeAbrir = linha.limitesPorCanal.length > 0;
                  return [
                    <tr
                      key={`p-${linha.id}`}
                      onClick={() => podeAbrir && setExpandido(aberto ? null : p.id)}
                      className={cn(
                        "transition-colors hover:bg-muted/40",
                        podeAbrir && "cursor-pointer",
                        aberto && "bg-muted/30",
                      )}
                    >
                      <td className="max-w-[260px] px-4 py-3">
                        <p className="truncate text-xs font-medium">{p.nome}</p>
                        <p className="num text-[10px] text-muted-foreground">{p.sku}</p>
                      </td>
                      <td className="num px-4 py-3 text-xs text-muted-foreground">
                        {p.ean ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                      <td className="px-4 py-3">
                        <SeloSituacao situacao={linha.situacao} qtdAbaixo={linha.qtdAbaixo} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {podeAbrir ? (
                          <ChevronRight
                            className={cn(
                              "ml-auto size-4 text-muted-foreground transition-transform",
                              aberto && "rotate-90",
                            )}
                          />
                        ) : (
                          <span className="text-[11px] text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>,

                    aberto ? (
                      <tr key={`d-${linha.id}`} className="bg-background/60">
                        <td colSpan={6} className="p-0">
                          <TabelaLimites itens={linha.limitesPorCanal} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                }

                const a = linha.anuncio;
                const conta = contasService.buscar(a.contaId);
                return (
                  <tr
                    key={`a-${linha.id}`}
                    className="bg-loss-soft/20 transition-colors hover:bg-loss-soft/30"
                  >
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
                    <td className="px-4 py-3">
                      <span className="text-[10px] text-muted-foreground">
                        Sem CMV, não dá pra calcular
                      </span>
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
              {carregandoProdutos && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Carregando seu catálogo...
                    </span>
                  </td>
                </tr>
              )}
              {!carregandoProdutos &&
                linhasFiltradas.length === 0 &&
                produtos.length === 0 &&
                busca === "" &&
                statusFiltro === "todos" && (
                  <tr>
                    <td colSpan={6} className="px-4 py-14 text-center">
                      <p className="text-xs text-muted-foreground">
                        Nenhum produto cadastrado ainda.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3"
                        onClick={() => setNovoProdutoAberto(true)}
                      >
                        <Plus className="size-3.5" />
                        Cadastrar o primeiro produto
                      </Button>
                    </td>
                  </tr>
                )}
              {!carregandoProdutos &&
                linhasFiltradas.length === 0 &&
                !(produtos.length === 0 && busca === "" && statusFiltro === "todos") && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-xs text-muted-foreground">
                      Nada encontrado com esses filtros.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-4 border-t px-4 py-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-profit" /> Acima da margem mínima
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-warning" /> Abaixo da mínima, ainda com lucro
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-loss" /> Abaixo do empate — prejuízo
          </span>
          <span className="ml-auto">
            A margem mínima de cada canal vem das metas em Configurações.
          </span>
        </div>
      </Painel>

      {emVinculo && (
        <DialogVincularProduto
          anuncio={emVinculo}
          aoFechar={() => setEmVinculo(null)}
          aoConcluir={() => {
            setEmVinculo(null);
            // O diálogo pode ter criado um produto novo (não só vinculado
            // um já existente) — recarrega do banco pra pegar esse caso.
            carregarProdutos();
          }}
        />
      )}

      {novoProdutoAberto && sessao && (
        <DialogNovoProduto
          perfilId={sessao.user.id}
          aoFechar={() => setNovoProdutoAberto(false)}
          aoCriar={() => {
            setNovoProdutoAberto(false);
            carregarProdutos();
          }}
        />
      )}
    </div>
  );
}

/**
 * Cadastro direto de produto, sem precisar partir de um anúncio pendente —
 * pra quando o seller quer montar o catálogo antes de ter qualquer anúncio
 * vinculado. SKU é a chave que casa este produto com os anúncios (de
 * exemplo, por ora) — dois produtos não podem repetir o mesmo SKU.
 */
function DialogNovoProduto({
  perfilId,
  aoFechar,
  aoCriar,
}: {
  perfilId: string;
  aoFechar: () => void;
  aoCriar: (produto: Produto) => void;
}) {
  const [sku, setSku] = useState("");
  const [nome, setNome] = useState("");
  const [ean, setEan] = useState("");
  const [cmv, setCmv] = useState("");
  const [salvando, setSalvando] = useState(false);

  const valido = sku.trim() !== "" && nome.trim() !== "";

  const salvar = async () => {
    if (!valido) return;
    setSalvando(true);
    const { produto, erro } = await produtosService.criar(perfilId, {
      sku: sku.trim(),
      nome: nome.trim(),
      ean: ean.trim() || null,
      cmv: Number(cmv.replace(",", ".")) || 0,
    });
    setSalvando(false);
    if (erro) {
      toast.error(erro);
      return;
    }
    if (produto) {
      toast.success(`Produto "${produto.nome}" cadastrado.`);
      aoCriar(produto);
    }
  };

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Novo produto</DialogTitle>
          <DialogDescription>
            O CMV cadastrado aqui vale para todo anúncio deste SKU, em qualquer marketplace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">SKU *</Label>
            <Input
              autoFocus
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="Seu código interno"
              className="mt-1"
              disabled={salvando}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Nome do produto *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Como você reconhece esse produto"
              className="mt-1"
              disabled={salvando}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">EAN (opcional)</Label>
              <Input
                value={ean}
                onChange={(e) => setEan(e.target.value)}
                placeholder="Código de barras"
                className="mt-1"
                disabled={salvando}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">CMV (R$)</Label>
              <Input
                inputMode="decimal"
                value={cmv}
                onChange={(e) => setCmv(e.target.value)}
                placeholder="0,00"
                className="mt-1"
                disabled={salvando}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={!valido || salvando}>
            {salvando ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Cadastrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Resumo da situação do produto na linha fechada. */
function SeloSituacao({
  situacao,
  qtdAbaixo,
}: {
  situacao: SituacaoProduto;
  qtdAbaixo: number;
}) {
  if (situacao === "sem-anuncio") {
    return <span className="text-[10px] text-muted-foreground">—</span>;
  }
  const estilo =
    situacao === "ok"
      ? "bg-profit-soft text-profit"
      : situacao === "abaixo"
        ? "bg-warning-soft text-warning"
        : "bg-loss-soft text-loss";
  const texto =
    situacao === "ok"
      ? "Todos os canais OK"
      : situacao === "prejuizo"
        ? "Vendendo com prejuízo"
        : `${qtdAbaixo} canal${qtdAbaixo > 1 ? "is" : ""} abaixo do mínimo`;
  const cor =
    situacao === "ok" ? "bg-profit" : situacao === "abaixo" ? "bg-warning" : "bg-loss";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold",
        estilo,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", cor)} />
      {texto}
    </span>
  );
}

/**
 * Os limites canal a canal. O mesmo produto tem preço mínimo diferente em
 * cada marketplace — 20% de margem no Mercado Livre não é o mesmo preço que
 * 20% na Shopee, porque a comissão e o frete são outros.
 */
function TabelaLimites({ itens }: { itens: LimitePorCanal[] }) {
  return (
    <div className="overflow-x-auto border-t bg-muted/20">
      <table className="w-full min-w-[820px] text-left">
        <thead>
          <tr className="text-[9px] uppercase tracking-wide text-muted-foreground">
            <th className="px-6 py-2 font-bold">Canal / conta</th>
            <th className="px-4 py-2 text-right font-bold">Preço hoje</th>
            <th className="px-4 py-2 text-right font-bold">Margem hoje</th>
            <th className="px-4 py-2 text-right font-bold">Preço mínimo</th>
            <th className="px-4 py-2 text-right font-bold">Empate</th>
          </tr>
        </thead>
        <tbody>
          {itens.map(({ anuncio, nomeConta, margemMinima, limites }) => {
            const cor = limites.emPrejuizo
              ? "text-loss"
              : limites.abaixoDoMinimo
                ? "text-warning"
                : "text-profit";
            const ponto = limites.emPrejuizo
              ? "bg-loss"
              : limites.abaixoDoMinimo
                ? "bg-warning"
                : "bg-profit";
            return (
              <tr key={anuncio.id} className="border-t border-border/40">
                <td className="px-6 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn("size-1.5 shrink-0 rounded-full", ponto)} />
                    <SeloMarketplace id={anuncio.marketplaceId} />
                    <span className="text-[10px] text-muted-foreground">{nomeConta}</span>
                  </div>
                  {limites.faltaParaMinimo > 0 && (
                    <p className="mt-1 pl-[14px] text-[10px] text-muted-foreground">
                      Precisa subir {formatBRL(limites.faltaParaMinimo)} para voltar aos{" "}
                      {formatPercentual(margemMinima)}
                    </p>
                  )}
                </td>
                <td className="num px-4 py-2.5 text-right text-xs">
                  {formatBRL(anuncio.precoAtual)}
                </td>
                <td className={cn("num px-4 py-2.5 text-right text-xs font-semibold", cor)}>
                  {formatPercentual(limites.margemAtual)}
                </td>
                <td
                  className={cn(
                    "num px-4 py-2.5 text-right text-xs font-bold",
                    limites.abaixoDoMinimo && "text-warning",
                  )}
                >
                  {formatBRL(limites.precoMinimo)}
                  <span className="ml-1 text-[9px] font-normal text-muted-foreground">
                    ({formatPercentual(margemMinima)})
                  </span>
                </td>
                <td className="num px-4 py-2.5 text-right text-xs text-loss">
                  {formatBRL(limites.precoEmpate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
