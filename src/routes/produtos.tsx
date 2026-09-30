import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  ajustesCustoService,
  alteracoesPrecoService,
  anunciosService,
  contasService,
  produtosService,
  type AlteracaoPrecoRegistrada,
} from "@/services";
import { USUARIO_ATUAL } from "@/data/mock";
import { useAuth } from "@/context/auth";
import { useConfiguracoes } from "@/context/configuracoes";
import { useSelecaoContas } from "@/context/selecao-contas";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { FAIXAS_MARGEM_PADRAO } from "@/lib/finance";
import {
  AJUSTE_PADRAO,
  NOME_AFILIADOS,
  detalharPreco,
  lerNumero,
  limitesComAjuste,
  precoParaMargem,
  type AjusteCusto,
  type ConfigPrecificacao,
  type Detalhamento,
  type Limites,
  type ModoAds,
} from "@/lib/precificacao";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { DialogVincularProduto } from "@/components/comum/DialogVincularProduto";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

// A tela continua no endereço /produtos (é o mesmo lugar da antiga tela
// Custos), só mudou de nome e ganhou a planilha completa de preço.
export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Precificação | NEXO" },
      {
        name: "description",
        content:
          "Todos os produtos e anúncios numa planilha: custo, taxas, lucro, margem e preço novo.",
      },
      { property: "og:title", content: "Precificação | NEXO" },
      {
        property: "og:description",
        content: "Custo, taxas, lucro e margem de cada anúncio — e o preço novo por valor ou por margem.",
      },
    ],
  }),
  component: Precificacao,
});

/** Resumo do produto a partir dos anúncios dele. */
type SituacaoProduto = "ok" | "abaixo" | "prejuizo" | "sem-anuncio";

/** Um anúncio já com todas as contas feitas no preço de hoje. */
interface LinhaAnuncio {
  anuncio: Anuncio;
  /** O anúncio com o CMV do produto — é o que entra nas contas */
  comCmv: Anuncio;
  nomeConta: string;
  margemMinima: number;
  /** O que o seller ajustou no Ads e em Outros (ou o padrão, automático) */
  ajuste: AjusteCusto;
  /** Todos os custos no preço de hoje, já com o ajuste */
  det: Detalhamento;
  limites: Limites;
}

interface GrupoProduto {
  produto: Produto;
  linhas: LinhaAnuncio[];
  situacao: SituacaoProduto;
  qtdAbaixo: number;
  /** Menor e maior margem entre os anúncios — pra ordenar por margem */
  piorMargem: number | null;
  melhorMargem: number | null;
  /** Menor e maior lucro por unidade entre os anúncios */
  menorLucro: number | null;
  maiorLucro: number | null;
  vendidas: number;
}

type Ordenacao =
  | "nome-az"
  | "nome-za"
  | "margem-maior"
  | "margem-menor"
  | "lucro-maior"
  | "lucro-menor"
  | "vendas-mais"
  | "vendas-menos";

const OPCOES_ORDENAR: { id: Ordenacao; rotulo: string }[] = [
  { id: "nome-az", rotulo: "Nome (A-Z)" },
  { id: "nome-za", rotulo: "Nome (Z-A)" },
  { id: "margem-maior", rotulo: "Margem: maior primeiro" },
  { id: "margem-menor", rotulo: "Margem: menor primeiro (prejuízo no topo)" },
  { id: "lucro-maior", rotulo: "Lucro: maior primeiro" },
  { id: "lucro-menor", rotulo: "Lucro: menor primeiro" },
  { id: "vendas-mais", rotulo: "Mais vendidos primeiro" },
  { id: "vendas-menos", rotulo: "Menos vendidos primeiro" },
];

type ModoEdicao = "preco" | "margem";

const SEM_CATEGORIA = "__sem__";

function Precificacao() {
  const { atualizarConta, metasPorConta, fiscal, custoOperacionalDetalhado } =
    useConfiguracoes();
  // Mesmo filtro de contas do topo da tela (o "Todas as contas" ao lado do
  // título, igual no Dashboard).
  const { selecionadas: contasSelecionadas, todasSelecionadas: semRestricaoDeConta } =
    useSelecaoContas();
  const { sessao } = useAuth();

  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas");
  const [situacaoFiltro, setSituacaoFiltro] = useState<"todos" | SituacaoProduto>("todos");
  const [agrupar, setAgrupar] = useState<"produto" | "categoria">("produto");
  const [ordenar, setOrdenar] = useState<Ordenacao>("nome-az");
  /** Produtos recolhidos (por padrão todos ficam abertos) */
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [verPendentes, setVerPendentes] = useState(true);

  const [editandoCmv, setEditandoCmv] = useState<string | null>(null);
  const [valorCmv, setValorCmv] = useState("");
  const [editandoCategoria, setEditandoCategoria] = useState<string | null>(null);
  const [valorCategoria, setValorCategoria] = useState("");

  /** O que o seller está digitando em cada anúncio: preço novo ou margem */
  const [rascunhos, setRascunhos] = useState<Record<string, { modo: ModoEdicao; texto: string }>>({});
  const [aplicando, setAplicando] = useState<string | null>(null);

  const [emVinculo, setEmVinculo] = useState<Anuncio | null>(null);
  const [emEdicaoProduto, setEmEdicaoProduto] = useState<Produto | null>(null);
  const [emExclusao, setEmExclusao] = useState<Produto | null>(null);
  const [receberAberto, setReceberAberto] = useState(false);
  // Os anúncios ainda vivem fora do React (src/data/mock.ts) — dependem da
  // API do marketplace, que depende do CNPJ. Este contador força a
  // releitura deles depois de cada mudança.
  const [tick, setTick] = useState(0);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(true);
  /** Ajustes de Ads e Outros, por anúncio */
  const [ajustes, setAjustes] = useState<Map<string, AjusteCusto>>(new Map());
  /** Última mudança de preço feita aqui, por anúncio — o preço fica colorido */
  const [precosAlterados, setPrecosAlterados] = useState<Map<string, AlteracaoPrecoRegistrada>>(
    new Map(),
  );

  const carregarProdutos = useCallback(async () => {
    if (!sessao) return;
    const [lista, alteracoes, mapaAjustes] = await Promise.all([
      produtosService.listar(sessao.user.id),
      alteracoesPrecoService.listar(sessao.user.id),
      ajustesCustoService.listar(sessao.user.id),
    ]);
    setAjustes(mapaAjustes);
    const ultimas = new Map<string, AlteracaoPrecoRegistrada>();
    // A lista vem da mais nova pra mais antiga: a primeira de cada anúncio vale.
    for (const alt of alteracoes) if (!ultimas.has(alt.anuncioId)) ultimas.set(alt.anuncioId, alt);
    setPrecosAlterados(ultimas);
    // Casa cada produto real com os anúncios pelo SKU (o CMV vem do produto)
    // e reaplica os preços que o seller já mudou aqui.
    produtosService.reconciliarComAnuncios(lista);
    alteracoesPrecoService.aplicarNosAnuncios(alteracoes);
    setProdutos(lista);
    setCarregandoProdutos(false);
    setTick((n) => n + 1);
  }, [sessao]);

  useEffect(() => {
    carregarProdutos();
  }, [carregarProdutos]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const anuncios = useMemo(() => anunciosService.listar().slice(), [tick]);
  const pendentes = useMemo(
    () =>
      anuncios
        .filter((a) => !a.produtoId)
        .filter((a) => semRestricaoDeConta || contasSelecionadas.has(a.contaId))
        // Faturamento perdido primeiro: resolver o que mais vende rende mais
        .sort((a, b) => b.precoAtual * b.unidadesVendidas - a.precoAtual * a.unidadesVendidas),
    [anuncios, semRestricaoDeConta, contasSelecionadas],
  );

  /** As contas de cada anúncio usam a alíquota e os custos operacionais
   * das Configurações — os mesmos do resto do NEXO. */
  const cfg: ConfigPrecificacao = useMemo(
    () => ({ aliquotaImposto: fiscal.aliquota, custosOperacionais: custoOperacionalDetalhado }),
    [fiscal, custoOperacionalDetalhado],
  );

  const categorias = useMemo(() => {
    const unicas = new Set<string>();
    for (const p of produtos) {
      const c = p.categoria?.trim();
      if (c) unicas.add(c);
    }
    return Array.from(unicas).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [produtos]);

  const grupos = useMemo<GrupoProduto[]>(() => {
    return produtos.map((p) => {
      const vinculados = anuncios.filter((a) => a.produtoId === p.id);
      const naSelecao = semRestricaoDeConta
        ? vinculados
        : vinculados.filter((a) => contasSelecionadas.has(a.contaId));
      const linhas: LinhaAnuncio[] = naSelecao.map((a) => {
        const metas = metasPorConta[a.contaId] ?? null;
        const margemMinima = metas?.margemMinima ?? FAIXAS_MARGEM_PADRAO.margemMinima;
        // O CMV mora no produto: é isso que faz mudar o custo aqui refletir
        // em todo canal de uma vez.
        const comCmv = { ...a, cmv: p.cmv };
        const ajuste = ajustes.get(a.id) ?? AJUSTE_PADRAO;
        return {
          anuncio: a,
          comCmv,
          nomeConta: contasService.buscar(a.contaId)?.nome ?? "—",
          margemMinima,
          ajuste,
          det: detalharPreco(comCmv, a.precoAtual, ajuste, cfg),
          limites: limitesComAjuste(comCmv, margemMinima, ajuste, cfg),
        };
      });
      const qtdAbaixo = linhas.filter((l) => l.limites.abaixoDoMinimo).length;
      const temPrejuizo = linhas.some((l) => l.limites.emPrejuizo);
      return {
        produto: p,
        linhas,
        qtdAbaixo,
        situacao:
          linhas.length === 0 ? "sem-anuncio" : temPrejuizo ? "prejuizo" : qtdAbaixo > 0 ? "abaixo" : "ok",
        piorMargem: linhas.length > 0 ? Math.min(...linhas.map((l) => l.det.margem)) : null,
        melhorMargem: linhas.length > 0 ? Math.max(...linhas.map((l) => l.det.margem)) : null,
        menorLucro: linhas.length > 0 ? Math.min(...linhas.map((l) => l.det.lucro)) : null,
        maiorLucro: linhas.length > 0 ? Math.max(...linhas.map((l) => l.det.lucro)) : null,
        vendidas: vinculados.reduce((s, a) => s + a.unidadesVendidas, 0),
      };
    });
  }, [
    produtos,
    anuncios,
    semRestricaoDeConta,
    contasSelecionadas,
    metasPorConta,
    ajustes,
    cfg,
  ]);

  const gruposFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = grupos.filter((g) => {
      // Com um canal/conta marcado lá em cima, some o produto sem anúncio nele.
      if (!semRestricaoDeConta && g.linhas.length === 0) return false;
      if (situacaoFiltro !== "todos" && g.situacao !== situacaoFiltro) return false;
      if (categoriaFiltro === SEM_CATEGORIA && g.produto.categoria) return false;
      if (
        categoriaFiltro !== "todas" &&
        categoriaFiltro !== SEM_CATEGORIA &&
        g.produto.categoria !== categoriaFiltro
      )
        return false;
      if (termo) {
        const alvo = `${g.produto.nome} ${g.produto.sku} ${g.produto.ean ?? ""}`.toLowerCase();
        if (!alvo.includes(termo)) return false;
      }
      return true;
    });
    // Compara dois números; produto sem anúncio (null) vai sempre pro fim.
    const porNumero = (x: number | null, y: number | null, crescente: boolean) => {
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return crescente ? x - y : y - x;
    };
    const ordenada = lista.sort((a, b) => {
      switch (ordenar) {
        case "nome-za":
          return b.produto.nome.localeCompare(a.produto.nome, "pt-BR");
        case "margem-maior":
          return porNumero(a.melhorMargem, b.melhorMargem, false);
        case "margem-menor":
          return porNumero(a.piorMargem, b.piorMargem, true);
        case "lucro-maior":
          return porNumero(a.maiorLucro, b.maiorLucro, false);
        case "lucro-menor":
          return porNumero(a.menorLucro, b.menorLucro, true);
        case "vendas-mais":
          return b.vendidas - a.vendidas;
        case "vendas-menos":
          return a.vendidas - b.vendidas;
        default:
          return a.produto.nome.localeCompare(b.produto.nome, "pt-BR");
      }
    });
    // Dentro de cada produto, os anúncios seguem a mesma ordem quando ela
    // é por margem ou lucro.
    const ordemLinhas: Partial<Record<Ordenacao, (x: LinhaAnuncio, y: LinhaAnuncio) => number>> = {
      "margem-maior": (x, y) => y.det.margem - x.det.margem,
      "margem-menor": (x, y) => x.det.margem - y.det.margem,
      "lucro-maior": (x, y) => y.det.lucro - x.det.lucro,
      "lucro-menor": (x, y) => x.det.lucro - y.det.lucro,
    };
    const ordemDasLinhas = ordemLinhas[ordenar as Ordenacao];
    return ordemDasLinhas
      ? ordenada.map((g) => ({ ...g, linhas: [...g.linhas].sort(ordemDasLinhas) }))
      : ordenada;
  }, [grupos, busca, situacaoFiltro, categoriaFiltro, ordenar, semRestricaoDeConta]);

  /** Agrupado por categoria: uma faixa por categoria, "Sem categoria" no fim. */
  const secoes = useMemo(() => {
    if (agrupar === "produto") return [{ titulo: null as string | null, itens: gruposFiltrados }];
    const mapa = new Map<string, GrupoProduto[]>();
    for (const g of gruposFiltrados) {
      const chave = g.produto.categoria?.trim() || "Sem categoria";
      mapa.set(chave, [...(mapa.get(chave) ?? []), g]);
    }
    return [...mapa.entries()]
      .sort(([a], [b]) =>
        a === "Sem categoria" ? 1 : b === "Sem categoria" ? -1 : a.localeCompare(b, "pt-BR"),
      )
      .map(([titulo, itens]) => ({ titulo: titulo as string | null, itens }));
  }, [agrupar, gruposFiltrados]);

  // Resumo do topo — só anúncios vinculados, dentro do filtro de conta.
  const todasLinhas = grupos.flatMap((g) => g.linhas);
  const emPrejuizo = todasLinhas.filter((l) => l.limites.emPrejuizo).length;
  const abaixoMinimo = todasLinhas.filter((l) => l.limites.abaixoDoMinimo && !l.limites.emPrejuizo).length;
  const margemMedia =
    todasLinhas.length > 0 ? todasLinhas.reduce((s, l) => s + l.det.margem, 0) / todasLinhas.length : 0;

  /* ---------------------------- ações ---------------------------- */

  const alternarProduto = (id: string) =>
    setFechados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

  const salvarCmv = async (produto: Produto) => {
    const novoCmv = lerNumero(valorCmv);
    setEditandoCmv(null);
    if (novoCmv === null || novoCmv < 0) {
      toast.error("CMV inválido.");
      return;
    }
    const { erro } = await produtosService.atualizarCmv(produto.id, novoCmv);
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      return;
    }
    await carregarProdutos();
    const qtd = produtosService.cobertura(produto.id).totalAnuncios;
    toast.success(
      qtd > 0
        ? `CMV de "${produto.nome}" atualizado — refletido em ${qtd} anúncio(s).`
        : `CMV de "${produto.nome}" atualizado.`,
    );
  };

  const salvarCategoria = async (produto: Produto) => {
    const categoria = valorCategoria.trim() || null;
    setEditandoCategoria(null);
    if ((produto.categoria ?? null) === categoria) return;
    const erro = await produtosService.atualizarCategoria(produto.id, categoria);
    if (erro) {
      toast.error(
        erro.includes("categoria")
          ? "O campo de categoria ainda não existe no banco — rode o SQL da tela Precificação no Supabase."
          : `Não consegui salvar: ${erro}`,
      );
      return;
    }
    await carregarProdutos();
    toast.success(
      categoria ? `"${produto.nome}" agora está em "${categoria}".` : `"${produto.nome}" ficou sem categoria.`,
    );
  };

  const aplicarPreco = async (linha: LinhaAnuncio, precoNovo: number) => {
    if (!sessao) return;
    const a = linha.anuncio;
    const antes = a.precoAtual;
    setAplicando(a.id);
    const erro = await alteracoesPrecoService.registrar(sessao.user.id, a, precoNovo, USUARIO_ATUAL.nome);
    setAplicando(null);
    if (erro) {
      toast.error(
        erro.includes("alteracoes_preco")
          ? "A tabela de mudanças de preço ainda não existe — rode o SQL da tela Precificação no Supabase."
          : `Não consegui salvar o preço: ${erro}`,
      );
      return;
    }
    setRascunhos((atual) => {
      const novo = { ...atual };
      delete novo[a.id];
      return novo;
    });
    setPrecosAlterados((atual) =>
      new Map(atual).set(a.id, {
        id: `local-${Date.now()}`,
        anuncioId: a.id,
        contaId: a.contaId,
        sku: a.sku,
        produto: a.produto,
        marketplaceId: a.marketplaceId,
        precoAntes: antes,
        precoDepois: precoNovo,
        data: new Date().toISOString(),
      }),
    );
    setTick((n) => n + 1);
    toast.success(`${a.produto} (${linha.nomeConta}): de ${formatBRL(antes)} para ${formatBRL(precoNovo)}.`, {
      description:
        "Salvo no NEXO. Sem a API do marketplace ainda, altere também o preço lá no anúncio.",
    });
  };

  /** Salva o ajuste de Ads/Outros num anúncio ou em todos do produto. */
  const salvarAjuste = async (
    linha: LinhaAnuncio,
    ajuste: AjusteCusto,
    todosDoProduto: boolean,
  ): Promise<boolean> => {
    if (!sessao) return false;
    const ids = todosDoProduto
      ? anuncios.filter((a) => a.produtoId === linha.anuncio.produtoId).map((a) => a.id)
      : [linha.anuncio.id];
    const erro = await ajustesCustoService.salvar(sessao.user.id, ids, ajuste);
    if (erro) {
      toast.error(
        erro.includes("ajustes_custo_anuncio")
          ? "A tabela de ajustes ainda não existe — rode o SQL da parte 2 da Precificação no Supabase."
          : `Não consegui salvar: ${erro}`,
      );
      return false;
    }
    setAjustes((atual) => {
      const novo = new Map(atual);
      for (const id of ids) novo.set(id, ajuste);
      return novo;
    });
    toast.success(
      todosDoProduto
        ? `Ajuste salvo em ${ids.length} anúncio${ids.length > 1 ? "s" : ""} de ${linha.anuncio.produto}.`
        : "Ajuste salvo neste anúncio.",
    );
    return true;
  };

  const dispensarAnuncio = (anuncio: Anuncio) => {
    anunciosService.dispensar(anuncio.id);
    setTick((n) => n + 1);
    toast(`"${anuncio.produto}" descartado — não aparece mais na fila.`);
  };

  const COLUNAS = 16;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <Painel
        titulo="Precificação"
        descricao="Todos os produtos e anúncios numa planilha: custo, taxas, lucro e margem — e o preço novo, por valor ou por margem"
        acoes={
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={() => setReceberAberto(true)}>
              <RefreshCw className="size-3.5" />
              Receber anúncios
            </Button>
            <ExportarDados
              nomeArquivo="precificacao"
              linhas={grupos.flatMap((g) =>
                g.linhas.map((l) => ({
                  Produto: g.produto.nome,
                  SKU: g.produto.sku,
                  Categoria: g.produto.categoria ?? "",
                  Canal: l.anuncio.marketplaceId,
                  Conta: l.nomeConta,
                  Preço: l.det.preco.toFixed(2),
                  CMV: l.det.cmv.toFixed(2),
                  Comissão: l.det.comissao.toFixed(2),
                  "Taxa fixa": l.det.taxaFixa.toFixed(2),
                  Frete: l.det.frete.toFixed(2),
                  Ads: l.det.ads.toFixed(2),
                  Imposto: l.det.imposto.toFixed(2),
                  Outros: l.det.outros.toFixed(2),
                  Lucro: l.det.lucro.toFixed(2),
                  "Margem %": (l.det.margem * 100).toFixed(1),
                  "Preço mínimo": l.limites.precoMinimo?.toFixed(2) ?? "",
                  Empate: l.limites.precoEmpate?.toFixed(2) ?? "",
                })),
              )}
            />
          </div>
        }
      >
        {/* Resumo */}
        <div className="grid gap-3 border-b p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Resumo rotulo="Produtos cadastrados" valor={formatNumero(produtos.length)} />
          <Resumo rotulo="Anúncios na planilha" valor={formatNumero(todasLinhas.length)} />
          <Resumo
            rotulo="Anúncios com prejuízo"
            valor={formatNumero(emPrejuizo)}
            cor={emPrejuizo > 0 ? "text-loss" : undefined}
          />
          <Resumo
            rotulo="Abaixo da margem mínima"
            valor={formatNumero(abaixoMinimo)}
            cor={abaixoMinimo > 0 ? "text-warning" : undefined}
          />
          <Resumo rotulo="Margem média dos anúncios" valor={formatPercentual(margemMedia)} />
        </div>

        {/* Anúncios sem produto vinculado */}
        {pendentes.length > 0 && (
          <div className="border-b">
            <button
              onClick={() => setVerPendentes((v) => !v)}
              className="flex w-full items-center gap-2 bg-loss-soft/30 px-4 py-2.5 text-left"
            >
              {verPendentes ? (
                <ChevronDown className="size-3.5 text-loss" />
              ) : (
                <ChevronRight className="size-3.5 text-loss" />
              )}
              <span className="text-xs font-semibold text-loss">
                {formatNumero(pendentes.length)} anúncio{pendentes.length > 1 ? "s" : ""} sem produto
                vinculado
              </span>
              <span className="text-[10px] text-muted-foreground">
                — sem CMV não dá pra calcular lucro. Vincule a um produto ou crie um novo.
              </span>
            </button>
            {verPendentes && (
              <div className="divide-y">
                {pendentes.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div className="min-w-[200px] flex-1">
                      <p className="truncate text-xs font-medium">{a.produto}</p>
                      <p className="num text-[10px] text-muted-foreground">{a.sku}</p>
                    </div>
                    <SeloMarketplace id={a.marketplaceId} />
                    <span className="text-[10px] text-muted-foreground">
                      {contasService.buscar(a.contaId)?.nome ?? "—"} · {formatBRL(a.precoAtual)} ·{" "}
                      {formatNumero(a.unidadesVendidas)} vendidos
                    </span>
                    <div className="ml-auto flex items-center gap-1.5">
                      <button
                        onClick={() => dispensarAnuncio(a)}
                        title="Descartar este anúncio (não vincula nem mostra de novo)"
                        className="text-muted-foreground transition-colors hover:text-loss"
                      >
                        <X className="size-4" />
                      </button>
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setEmVinculo(a)}>
                        <Link2 className="size-3.5" />
                        Vincular
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filtros */}
        <div className="flex flex-wrap items-end gap-3 border-b p-4">
          <Filtro rotulo="Buscar">
            <Input
              placeholder="Nome, SKU ou EAN"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-8 w-48 text-xs"
            />
          </Filtro>
          <Filtro rotulo="Categoria">
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
                <SelectItem value={SEM_CATEGORIA}>Sem categoria</SelectItem>
              </SelectContent>
            </Select>
          </Filtro>
          <Filtro rotulo="Situação">
            <Select
              value={situacaoFiltro}
              onValueChange={(v) => setSituacaoFiltro(v as typeof situacaoFiltro)}
            >
              <SelectTrigger className="h-8 w-64 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os produtos</SelectItem>
                <SelectItem value="prejuizo">Vendendo com prejuízo</SelectItem>
                <SelectItem value="abaixo">Com lucro, mas abaixo da margem mínima</SelectItem>
                <SelectItem value="ok">Todos acima da margem mínima</SelectItem>
                <SelectItem value="sem-anuncio">Produto sem anúncio vinculado</SelectItem>
              </SelectContent>
            </Select>
          </Filtro>
          <Filtro rotulo="Ordenar por">
            <Select value={ordenar} onValueChange={(v) => setOrdenar(v as Ordenacao)}>
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPCOES_ORDENAR.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Filtro>
          <Filtro rotulo="Agrupar por">
            <Select value={agrupar} onValueChange={(v) => setAgrupar(v as typeof agrupar)}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="produto">Produto</SelectItem>
                <SelectItem value="categoria">Categoria</SelectItem>
              </SelectContent>
            </Select>
          </Filtro>
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={() => setFechados(new Set())}>
              Abrir tudo
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-[11px]"
              onClick={() => setFechados(new Set(produtos.map((p) => p.id)))}
            >
              Recolher tudo
            </Button>
          </div>
        </div>

        {/* A planilha */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[9px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-bold">Canal / conta</th>
                <th className="px-2 py-2.5 text-right font-bold">Preço</th>
                <th className="px-2 py-2.5 text-right font-bold">CMV</th>
                <th className="px-2 py-2.5 text-right font-bold">Comissão</th>
                <th className="px-2 py-2.5 text-right font-bold">Taxa fixa</th>
                <th className="px-2 py-2.5 text-right font-bold">Frete</th>
                <th className="px-2 py-2.5 text-right font-bold">Ads</th>
                <th className="px-2 py-2.5 text-right font-bold">Imposto</th>
                <th className="px-2 py-2.5 text-right font-bold">Outros</th>
                <th className="px-2 py-2.5 text-right font-bold">Lucro</th>
                <th className="px-2 py-2.5 text-right font-bold">Margem</th>
                <th className="px-2 py-2.5 text-right font-bold">Mínimo</th>
                <th className="px-2 py-2.5 text-right font-bold">Empate</th>
                <th className="px-2 py-2.5 text-right font-bold">Preço final</th>
                <th className="border-l px-2 py-2.5 font-bold">Novo preço ou margem</th>
                <th className="px-3 py-2.5 text-right font-bold"></th>
              </tr>
            </thead>
            <tbody>
              {secoes.map((secao) => (
                <Fragment key={secao.titulo ?? "todos"}>
                  {secao.titulo && (
                    <tr className="border-y bg-brand/10">
                      <td colSpan={COLUNAS} className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold">
                          <Tag className="size-3.5 text-brand" />
                          {secao.titulo}
                        </span>
                        <span className="ml-2 text-[10px] text-muted-foreground">
                          {secao.itens.length} produto{secao.itens.length > 1 ? "s" : ""}
                        </span>
                      </td>
                    </tr>
                  )}
                  {secao.itens.map((g) => {
                    const p = g.produto;
                    const aberto = !fechados.has(p.id);
                    return (
                      <Fragment key={p.id}>
                        {/* Linha do produto */}
                        <tr className="border-t-2 border-border bg-muted/30">
                          <td colSpan={COLUNAS} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                              <button
                                onClick={() => alternarProduto(p.id)}
                                className="flex min-w-0 items-center gap-1.5 text-left"
                                title={aberto ? "Recolher" : "Abrir"}
                              >
                                {aberto ? (
                                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                                )}
                                <span className="truncate text-xs font-bold">{p.nome}</span>
                              </button>
                              <span className="num text-[10px] text-muted-foreground">
                                SKU {p.sku}
                                {p.ean ? ` · EAN ${p.ean}` : ""}
                              </span>

                              {/* Categoria */}
                              {editandoCategoria === p.id ? (
                                <span className="flex items-center gap-1">
                                  <Input
                                    autoFocus
                                    list="categorias-precificacao"
                                    value={valorCategoria}
                                    onChange={(e) => setValorCategoria(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") salvarCategoria(p);
                                      if (e.key === "Escape") setEditandoCategoria(null);
                                    }}
                                    placeholder="Ex.: Relógios"
                                    className="h-7 w-40 text-xs"
                                  />
                                  <button onClick={() => salvarCategoria(p)} className="text-profit" title="Salvar">
                                    <Check className="size-3.5" />
                                  </button>
                                  <button
                                    onClick={() => setEditandoCategoria(null)}
                                    className="text-muted-foreground"
                                    title="Cancelar"
                                  >
                                    <X className="size-3.5" />
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    setEditandoCategoria(p.id);
                                    setValorCategoria(p.categoria ?? "");
                                  }}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors",
                                    p.categoria
                                      ? "bg-brand/10 text-brand hover:bg-brand/20"
                                      : "border border-dashed text-muted-foreground hover:text-foreground",
                                  )}
                                  title="Mudar a categoria"
                                >
                                  <Tag className="size-3" />
                                  {p.categoria ?? "Pôr categoria"}
                                </button>
                              )}

                              {/* CMV */}
                              <span className="flex items-center gap-1.5 text-[11px]">
                                <span className="text-muted-foreground">CMV</span>
                                {editandoCmv === p.id ? (
                                  <span className="flex items-center gap-1">
                                    <Input
                                      autoFocus
                                      inputMode="decimal"
                                      value={valorCmv}
                                      onChange={(e) => setValorCmv(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") salvarCmv(p);
                                        if (e.key === "Escape") setEditandoCmv(null);
                                      }}
                                      className="num h-7 w-24 px-2 text-right text-xs"
                                    />
                                    <button onClick={() => salvarCmv(p)} className="text-profit" title="Salvar CMV">
                                      <Check className="size-3.5" />
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => {
                                      setEditandoCmv(p.id);
                                      setValorCmv(p.cmv.toFixed(2).replace(".", ","));
                                    }}
                                    className="num inline-flex items-center gap-1 font-bold transition-colors hover:text-brand"
                                    title="Mudar o CMV (vale pra todos os anúncios deste produto)"
                                  >
                                    {formatBRL(p.cmv)}
                                    <Pencil className="size-3" />
                                  </button>
                                )}
                              </span>

                              <SeloSituacao situacao={g.situacao} qtdAbaixo={g.qtdAbaixo} />
                              <span className="text-[10px] text-muted-foreground">
                                {g.linhas.length} anúncio{g.linhas.length === 1 ? "" : "s"}
                              </span>

                              <span className="ml-auto flex items-center gap-2">
                                <button
                                  onClick={() => setEmEdicaoProduto(p)}
                                  title="Editar produto"
                                  className="text-muted-foreground transition-colors hover:text-brand"
                                >
                                  <Pencil className="size-3.5" />
                                </button>
                                <button
                                  onClick={() => setEmExclusao(p)}
                                  title="Excluir produto"
                                  className="text-muted-foreground transition-colors hover:text-loss"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </span>
                            </div>
                          </td>
                        </tr>

                        {/* Anúncios do produto */}
                        {aberto &&
                          g.linhas.map((l) => (
                            <LinhaDoAnuncio
                              key={l.anuncio.id}
                              linha={l}
                              cfg={cfg}
                              alteracaoPreco={precosAlterados.get(l.anuncio.id) ?? null}
                              aoSalvarAjuste={(ajuste, todos) => salvarAjuste(l, ajuste, todos)}
                              rascunho={rascunhos[l.anuncio.id] ?? { modo: "preco", texto: "" }}
                              aoMudarRascunho={(r) =>
                                setRascunhos((atual) => ({ ...atual, [l.anuncio.id]: r }))
                              }
                              aplicando={aplicando === l.anuncio.id}
                              aoAplicar={(preco) => aplicarPreco(l, preco)}
                            />
                          ))}
                        {aberto && g.linhas.length === 0 && (
                          <tr>
                            <td colSpan={COLUNAS} className="px-8 py-2 text-[10px] text-muted-foreground">
                              Nenhum anúncio vinculado a este produto ainda.
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}

              {carregandoProdutos && (
                <tr>
                  <td colSpan={COLUNAS} className="px-4 py-12 text-center">
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Carregando seus produtos...
                    </span>
                  </td>
                </tr>
              )}
              {!carregandoProdutos && produtos.length === 0 && (
                <tr>
                  <td colSpan={COLUNAS} className="px-4 py-14 text-center">
                    <p className="text-xs text-muted-foreground">
                      Nenhum produto cadastrado ainda. Receba os anúncios do marketplace e vincule o
                      CMV de cada um.
                    </p>
                    <Button size="sm" variant="outline" className="mt-3" onClick={() => setReceberAberto(true)}>
                      <RefreshCw className="size-3.5" />
                      Receber anúncios
                    </Button>
                  </td>
                </tr>
              )}
              {!carregandoProdutos && produtos.length > 0 && gruposFiltrados.length === 0 && (
                <tr>
                  <td colSpan={COLUNAS} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    Nada encontrado com esses filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <datalist id="categorias-precificacao">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div className="space-y-1.5 border-t px-4 py-3 text-[10px] text-muted-foreground">
          <div className="flex flex-wrap gap-4">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-profit" /> Acima da margem mínima
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-warning" /> Abaixo da mínima, ainda com lucro
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-loss" /> Abaixo do empate — prejuízo
            </span>
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-brand">R$ 0,00</span> Valor que você mudou (preço
              aplicado aqui, Ads ou Outros)
            </span>
            <span className="ml-auto">A margem mínima de cada conta vem das metas em Configurações.</span>
          </div>
          <p>
            <strong>Ads</strong> e <strong>Outros</strong>: clique no valor pra escolher o que entra na conta
            (Ads automático, fixo, em % ou nenhum; marcar/desmarcar cada custo e somar um custo extra).{" "}
            <strong>Mínimo</strong> = menor preço que respeita a margem mínima; <strong>Empate</strong> =
            preço de lucro zero. No preço novo, comissão e imposto acompanham o preço; frete, taxa fixa
            e Ads ficam iguais aos de hoje (no Mercado Livre, cruzar os R$ 79 pode mudar o frete).
          </p>
        </div>
      </Painel>

      {emVinculo && (
        <DialogVincularProduto
          anuncio={emVinculo}
          aoFechar={() => setEmVinculo(null)}
          aoConcluir={() => {
            setEmVinculo(null);
            carregarProdutos();
          }}
        />
      )}

      {emEdicaoProduto && (
        <DialogEditarProduto
          produto={emEdicaoProduto}
          categorias={categorias}
          aoFechar={() => setEmEdicaoProduto(null)}
          aoSalvar={() => {
            setEmEdicaoProduto(null);
            carregarProdutos();
          }}
        />
      )}

      {emExclusao && (
        <DialogConfirmarExclusao
          produto={emExclusao}
          qtdAnuncios={produtosService.cobertura(emExclusao.id).totalAnuncios}
          aoFechar={() => setEmExclusao(null)}
          aoExcluir={() => {
            setEmExclusao(null);
            carregarProdutos();
          }}
        />
      )}

      {receberAberto && (
        <DialogReceberAnuncios
          atualizarConta={atualizarConta}
          aoFechar={() => setReceberAberto(false)}
          aoConcluir={() => {
            setReceberAberto(false);
            carregarProdutos();
          }}
        />
      )}
    </div>
  );
}

function Resumo({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={cn("num text-lg font-bold", cor)}>{valor}</p>
    </div>
  );
}

function Filtro({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {rotulo}
      </p>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Uma linha de anúncio                                                */
/* ------------------------------------------------------------------ */

function LinhaDoAnuncio({
  linha,
  cfg,
  rascunho,
  aoMudarRascunho,
  aplicando,
  aoAplicar,
  aoSalvarAjuste,
  alteracaoPreco,
}: {
  linha: LinhaAnuncio;
  cfg: ConfigPrecificacao;
  /** Última mudança de preço feita nesta tela (null = preço original) */
  alteracaoPreco: AlteracaoPrecoRegistrada | null;
  rascunho: { modo: ModoEdicao; texto: string };
  aoMudarRascunho: (r: { modo: ModoEdicao; texto: string }) => void;
  aplicando: boolean;
  aoAplicar: (preco: number) => void;
  aoSalvarAjuste: (ajuste: AjusteCusto, todosDoProduto: boolean) => Promise<boolean>;
}) {
  const { anuncio: a, comCmv, det: d, limites, margemMinima, ajuste } = linha;

  // O que o seller digitou vira um preço novo — direto (modo preço) ou
  // calculado a partir da margem pedida (modo margem).
  const numero = lerNumero(rascunho.texto);
  let precoNovo: number | null = null;
  let impossivel = false;
  if (numero !== null && rascunho.texto.trim() !== "") {
    if (rascunho.modo === "preco") {
      precoNovo = numero > 0 ? Math.round(numero * 100) / 100 : null;
    } else {
      precoNovo = precoParaMargem(comCmv, numero / 100, ajuste, cfg);
      impossivel = precoNovo === null;
    }
  }
  const mudou = precoNovo !== null && Math.abs(precoNovo - a.precoAtual) >= 0.01;
  // Com um preço novo digitado (ou calculado pela margem), a linha inteira
  // passa a mostrar as contas nesse preço: comissão, imposto, Ads, outros,
  // lucro e margem acompanham. Apagou o campo, volta ao preço de hoje.
  const v = precoNovo !== null ? detalharPreco(comCmv, precoNovo, ajuste, cfg) : d;
  const ponto = v.lucro < 0 ? "bg-loss" : v.margem < margemMinima ? "bg-warning" : "bg-profit";
  const corMargem = v.lucro < 0 ? "text-loss" : v.margem < margemMinima ? "text-warning" : "text-profit";

  return (
    <tr className="border-t border-border/40 text-xs transition-colors hover:bg-muted/20">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2 pl-5">
          <span className={cn("size-1.5 shrink-0 rounded-full", ponto)} />
          <SeloMarketplace id={a.marketplaceId} />
          <span className="truncate text-[10px] text-muted-foreground">{linha.nomeConta}</span>
        </div>
      </td>
      <td
        className={cn("num px-2 py-2 text-right font-semibold", alteracaoPreco && COR_ALTERADO)}
        title={
          alteracaoPreco
            ? `Preço mudado aqui em ${new Date(alteracaoPreco.data).toLocaleDateString("pt-BR")}: de ${formatBRL(alteracaoPreco.precoAntes)} para ${formatBRL(alteracaoPreco.precoDepois)}. Sem API ainda, confira se mudou também no marketplace.`
            : undefined
        }
      >
        {formatBRL(d.preco)}
      </td>
      <td className="num px-2 py-2 text-right text-muted-foreground">{formatBRL(d.cmv)}</td>
      <td
        className="num px-2 py-2 text-right text-muted-foreground"
        title={`${formatPercentual(a.comissaoPercentual)} do preço`}
      >
        {formatBRL(v.comissao)}
      </td>
      <td className="num px-2 py-2 text-right text-muted-foreground">{formatBRL(v.taxaFixa)}</td>
      <td className="num px-2 py-2 text-right text-muted-foreground">{formatBRL(v.frete)}</td>
      <td className="px-2 py-2 text-right">
        <PopoverAds anuncio={a} ajuste={ajuste} valorAtual={v.ads} aoSalvar={aoSalvarAjuste} />
      </td>
      <td className="num px-2 py-2 text-right text-muted-foreground">{formatBRL(v.imposto)}</td>
      <td className="px-2 py-2 text-right">
        <PopoverOutros det={v} ajuste={ajuste} aoSalvar={aoSalvarAjuste} />
      </td>
      <td className={cn("num px-2 py-2 text-right font-bold", v.lucro < 0 ? "text-loss" : "")}>
        {formatBRL(v.lucro)}
      </td>
      <td className={cn("num px-2 py-2 text-right font-bold", corMargem)}>{formatPercentual(v.margem)}</td>
      <td
        className="num px-2 py-2 text-right"
        title={`Margem mínima desta conta: ${formatPercentual(margemMinima)}`}
      >
        {limites.precoMinimo !== null ? formatBRL(limites.precoMinimo) : "—"}
      </td>
      <td className="num px-2 py-2 text-right text-loss">
        {limites.precoEmpate !== null ? formatBRL(limites.precoEmpate) : "—"}
      </td>
      <td className="num px-2 py-2 text-right font-bold">
        {impossivel ? (
          <span className="text-[10px] font-normal text-loss">Margem impossível</span>
        ) : (
          formatBRL(v.preco)
        )}
      </td>

      {/* Edição: por preço ou por margem */}
      <td className="border-l px-2 py-2">
        <div className="flex items-center gap-1">
          <div className="flex rounded-md bg-muted p-0.5">
            {(
              [
                ["preco", "R$"],
                ["margem", "%"],
              ] as const
            ).map(([modo, rotulo]) => (
              <button
                key={modo}
                onClick={() => aoMudarRascunho({ modo, texto: "" })}
                title={modo === "preco" ? "Digitar o preço novo" : "Digitar a margem que você quer"}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-bold",
                  rascunho.modo === modo ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {rotulo}
              </button>
            ))}
          </div>
          <Input
            inputMode="decimal"
            value={rascunho.texto}
            onChange={(e) => aoMudarRascunho({ ...rascunho, texto: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter" && mudou && precoNovo !== null) aoAplicar(precoNovo);
            }}
            placeholder={
              rascunho.modo === "preco"
                ? d.preco.toFixed(2).replace(".", ",")
                : (d.margem * 100).toFixed(1).replace(".", ",")
            }
            className="num h-7 w-24 px-2 text-right text-xs"
          />
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        <Button
          size="sm"
          variant={mudou ? "default" : "outline"}
          className="h-7 text-[11px]"
          disabled={!mudou || aplicando}
          onClick={() => precoNovo !== null && aoAplicar(precoNovo)}
        >
          {aplicando ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Aplicar
        </Button>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Clicar e editar: Ads                                                */
/* ------------------------------------------------------------------ */

const ROTULO_MODO_ADS: Record<ModoAds, string> = {
  auto: "automático",
  reais: "em valor fixo por unidade",
  percentual: "em % do preço",
  nenhum: "fora da conta",
};

/** Valor que o seller mudou (preço aplicado aqui, Ads ou Outros ajustados)
 * aparece nesta cor — sem etiqueta do lado, pra não bagunçar a coluna. */
const COR_ALTERADO = "font-semibold text-brand";

/** Célula clicável: sem sublinhado, só um fundo leve ao passar o mouse. */
const BOTAO_EDITAVEL =
  "num inline-flex items-center rounded px-1.5 py-0.5 text-right transition-colors hover:bg-muted cursor-pointer";

function PopoverAds({
  anuncio,
  ajuste,
  valorAtual,
  aoSalvar,
}: {
  anuncio: Anuncio;
  ajuste: AjusteCusto;
  valorAtual: number;
  aoSalvar: (ajuste: AjusteCusto, todosDoProduto: boolean) => Promise<boolean>;
}) {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<ModoAds>(ajuste.adsModo);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Toda vez que abre, começa do que está salvo.
  useEffect(() => {
    if (!aberto) return;
    setModo(ajuste.adsModo);
    setTexto(
      ajuste.adsModo === "reais"
        ? ajuste.adsValor.toFixed(2).replace(".", ",")
        : ajuste.adsModo === "percentual"
          ? (ajuste.adsValor * 100).toFixed(1).replace(".", ",")
          : "",
    );
  }, [aberto, ajuste]);

  const numero = lerNumero(texto);
  const valido = modo === "auto" || modo === "nenhum" || (numero !== null && numero >= 0);

  const salvar = async (todos: boolean) => {
    if (!valido) return;
    setSalvando(true);
    const ok = await aoSalvar(
      {
        ...ajuste,
        adsModo: modo,
        adsValor: modo === "reais" ? numero ?? 0 : modo === "percentual" ? (numero ?? 0) / 100 : 0,
      },
      todos,
    );
    setSalvando(false);
    if (ok) setAberto(false);
  };

  const opcoes: { id: ModoAds; titulo: string; detalhe: string }[] = [
    {
      id: "auto",
      titulo: "Automático",
      detalhe: `Média real do Ads: ${formatBRL(anuncio.custoMidiaUnitario)} por venda`,
    },
    { id: "reais", titulo: "Valor fixo por unidade", detalhe: "Você diz quanto reservar em R$" },
    { id: "percentual", titulo: "% do preço", detalhe: "Acompanha o preço quando ele muda" },
    { id: "nenhum", titulo: "Não considerar Ads", detalhe: "Fica fora da conta" },
  ];

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            BOTAO_EDITAVEL,
            ajuste.adsModo !== "auto" ? COR_ALTERADO : "text-muted-foreground hover:text-foreground",
          )}
          title={
            ajuste.adsModo === "auto"
              ? "Ads automático (média real). Clique pra mudar."
              : `Ads ${ROTULO_MODO_ADS[ajuste.adsModo]}. Clique pra mudar.`
          }
        >
          {formatBRL(valorAtual)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 text-xs">
        <div>
          <p className="font-semibold">Ads deste anúncio</p>
          <p className="text-[10px] text-muted-foreground">Como o custo de Ads entra no lucro e na margem</p>
        </div>
        <div className="space-y-1.5">
          {opcoes.map((o) => (
            <label
              key={o.id}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-md border px-2.5 py-2",
                modo === o.id ? "border-brand bg-brand/5" : "hover:bg-muted/50",
              )}
            >
              <input
                type="radio"
                name={`ads-${anuncio.id}`}
                checked={modo === o.id}
                onChange={() => {
                  setModo(o.id);
                  setTexto("");
                }}
                className="mt-0.5 accent-[var(--brand)]"
              />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{o.titulo}</span>
                <span className="block text-[10px] text-muted-foreground">{o.detalhe}</span>
                {modo === o.id && (o.id === "reais" || o.id === "percentual") && (
                  <span className="mt-1.5 flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">{o.id === "reais" ? "R$" : ""}</span>
                    <Input
                      autoFocus
                      inputMode="decimal"
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      placeholder={o.id === "reais" ? "0,00" : "8"}
                      className="num h-7 w-24 px-2 text-right text-xs"
                    />
                    <span className="text-[10px] text-muted-foreground">{o.id === "percentual" ? "% do preço" : "por unidade"}</span>
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-7 text-[11px]" disabled={!valido || salvando} onClick={() => salvar(false)}>
            {salvando && <Loader2 className="size-3.5 animate-spin" />}
            Salvar neste anúncio
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={!valido || salvando}
            onClick={() => salvar(true)}
          >
            Em todos deste produto
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Clicar e editar: Outros                                             */
/* ------------------------------------------------------------------ */

function PopoverOutros({
  det,
  ajuste,
  aoSalvar,
}: {
  det: Detalhamento;
  ajuste: AjusteCusto;
  aoSalvar: (ajuste: AjusteCusto, todosDoProduto: boolean) => Promise<boolean>;
}) {
  const [aberto, setAberto] = useState(false);
  const [ignorados, setIgnorados] = useState<string[]>(ajuste.ignorados);
  const [extra, setExtra] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setIgnorados(ajuste.ignorados);
    setExtra(ajuste.custoExtra > 0 ? ajuste.custoExtra.toFixed(2).replace(".", ",") : "");
  }, [aberto, ajuste]);

  // Os itens da lista (sem o custo extra, que tem campo próprio).
  const itens = det.itensOutros.filter((i) => i.nome !== "Custo extra deste anúncio");
  const extraNumero = extra.trim() === "" ? 0 : lerNumero(extra);
  const valido = extraNumero !== null && extraNumero >= 0;
  const personalizado = ajuste.ignorados.length > 0 || ajuste.custoExtra > 0;

  const alternar = (nome: string) =>
    setIgnorados((atual) => (atual.includes(nome) ? atual.filter((n) => n !== nome) : [...atual, nome]));

  const salvar = async (todos: boolean) => {
    if (!valido) return;
    setSalvando(true);
    const ok = await aoSalvar({ ...ajuste, ignorados, custoExtra: extraNumero ?? 0 }, todos);
    setSalvando(false);
    if (ok) setAberto(false);
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            BOTAO_EDITAVEL,
            personalizado ? COR_ALTERADO : "text-muted-foreground hover:text-foreground",
          )}
          title={
            personalizado
              ? "Você ajustou o que entra aqui. Clique pra ver ou mudar."
              : "Clique pra escolher quais custos entram na conta"
          }
        >
          {formatBRL(det.outros)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3 text-xs">
        <div>
          <p className="font-semibold">Outros custos deste anúncio</p>
          <p className="text-[10px] text-muted-foreground">
            Desmarque o que não vale pra este anúncio. Os custos gerais vêm de Configurações.
          </p>
        </div>
        <div className="space-y-1">
          {itens.length === 0 && (
            <p className="text-[10px] text-muted-foreground">Nenhum custo operacional cadastrado.</p>
          )}
          {itens.map((i) => {
            const marcado = !ignorados.includes(i.nome);
            return (
              <label
                key={i.nome}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
              >
                <Checkbox checked={marcado} onCheckedChange={() => alternar(i.nome)} />
                <span className={cn("flex-1", !marcado && "text-muted-foreground line-through")}>
                  {i.nome}
                  {i.nome === NOME_AFILIADOS && (
                    <span className="text-[10px] text-muted-foreground"> (comissão de criador/afiliado)</span>
                  )}
                </span>
                <span className={cn("num", !marcado && "text-muted-foreground line-through")}>
                  {formatBRL(i.valor)}
                </span>
              </label>
            );
          })}
        </div>
        <div className="space-y-1 border-t pt-2">
          <p className="font-medium">Custo extra só deste anúncio</p>
          <p className="text-[10px] text-muted-foreground">
            Ex.: embalagem especial, brinde, manual impresso. Soma com os de cima.
          </p>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-muted-foreground">R$</span>
            <Input
              inputMode="decimal"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
              placeholder="0,00"
              className="num h-7 w-24 px-2 text-right text-xs"
            />
            <span className="text-[10px] text-muted-foreground">por unidade</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="h-7 text-[11px]" disabled={!valido || salvando} onClick={() => salvar(false)}>
            {salvando && <Loader2 className="size-3.5 animate-spin" />}
            Salvar neste anúncio
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={!valido || salvando}
            onClick={() => salvar(true)}
          >
            Em todos deste produto
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const OPCOES_MARKETPLACE: { id: MarketplaceId | "todos"; nome: string }[] = [
  { id: "todos", nome: "Todos os marketplaces" },
  { id: "mercado-livre", nome: "Mercado Livre" },
  { id: "shopee", nome: "Shopee" },
  { id: "amazon", nome: "Amazon" },
  { id: "magalu", nome: "Magalu" },
  { id: "tiktok-shop", nome: "TikTok Shop" },
  { id: "shein", nome: "Shein" },
];

type ModoRecebimento = "todos" | "especifico";

/**
 * Corrige SKU, nome, EAN ou CMV de um produto já cadastrado. Diferente do
 * lápis de CMV na tabela (que é só um atalho pro campo mais usado), este
 * diálogo edita o produto inteiro — pra quando o erro foi no SKU ou no
 * nome, não no custo.
 */
function DialogEditarProduto({
  produto,
  categorias,
  aoFechar,
  aoSalvar,
}: {
  produto: Produto;
  /** Categorias que o seller já usa — aparecem como sugestão */
  categorias: string[];
  aoFechar: () => void;
  aoSalvar: (produto: Produto) => void;
}) {
  const [categoria, setCategoria] = useState(produto.categoria ?? "");
  const [sku, setSku] = useState(produto.sku);
  const [nome, setNome] = useState(produto.nome);
  const [ean, setEan] = useState(produto.ean ?? "");
  const [cmv, setCmv] = useState(produto.cmv.toFixed(2).replace(".", ","));
  const [salvando, setSalvando] = useState(false);

  const valido = sku.trim() !== "" && nome.trim() !== "";

  const salvar = async () => {
    if (!valido) return;
    setSalvando(true);
    const { produto: atualizado, erro } = await produtosService.atualizar(produto.id, {
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
    if ((produto.categoria ?? "") !== categoria.trim()) {
      const erroCategoria = await produtosService.atualizarCategoria(produto.id, categoria);
      if (erroCategoria) toast.error(`Salvei o produto, mas não a categoria: ${erroCategoria}`);
    }
    if (atualizado) {
      toast.success(`"${atualizado.nome}" atualizado.`);
      aoSalvar(atualizado);
    }
  };

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar produto</DialogTitle>
          <DialogDescription>
            Mudar o SKU refaz o vínculo com os anúncios — passa a casar pelo SKU novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">SKU *</Label>
            <Input
              autoFocus
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="mt-1"
              disabled={salvando}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Nome do produto *</Label>
            <Input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1"
              disabled={salvando}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Categoria (opcional)</Label>
            <Input
              list="categorias-editar-produto"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Ex.: Relógios"
              className="mt-1"
              disabled={salvando}
            />
            <datalist id="categorias-editar-produto">
              {categorias.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">EAN (opcional)</Label>
              <Input
                value={ean}
                onChange={(e) => setEan(e.target.value)}
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
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Confirmação de exclusão. Avisa quantos anúncios ficam sem vínculo depois
 * — não é bloqueio, é só pra ninguém apagar sem saber o efeito colateral.
 */
function DialogConfirmarExclusao({
  produto,
  qtdAnuncios,
  aoFechar,
  aoExcluir,
}: {
  produto: Produto;
  qtdAnuncios: number;
  aoFechar: () => void;
  aoExcluir: () => void;
}) {
  const [excluindo, setExcluindo] = useState(false);

  const confirmar = async () => {
    setExcluindo(true);
    const erro = await produtosService.remover(produto.id);
    setExcluindo(false);
    if (erro) {
      toast.error(`Não consegui excluir: ${erro}`);
      return;
    }
    toast.success(`"${produto.nome}" excluído.`);
    aoExcluir();
  };

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Excluir "{produto.nome}"?</DialogTitle>
          <DialogDescription>
            {qtdAnuncios > 0
              ? `${qtdAnuncios} anúncio${qtdAnuncios > 1 ? "s" : ""} vinculado${qtdAnuncios > 1 ? "s" : ""} a este produto ${qtdAnuncios > 1 ? "ficam" : "fica"} sem CMV depois de excluir.`
              : "Este produto não tem anúncio vinculado hoje."}
            {" "}Não dá pra desfazer.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={excluindo}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={confirmar} disabled={excluindo}>
            {excluindo ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "Receber anúncios" — o único jeito de anúncio entrar no sistema, hoje de
 * mentira (não há API ainda) e amanhã de verdade, sem mudar esta tela.
 *
 * Duas escolhas em sequência: de qual marketplace (ou todos), e se é pra
 * trazer tudo que existe lá ou só um anúncio específico por SKU/EAN — pro
 * caso do seller só querer testar ou resolver um produto pontual.
 */
function DialogReceberAnuncios({
  atualizarConta,
  aoFechar,
  aoConcluir,
}: {
  atualizarConta: (contaId: string, dados: { ultimaSincronizacao: string }) => void;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [marketplace, setMarketplace] = useState<MarketplaceId | "todos">("todos");
  const [modo, setModo] = useState<ModoRecebimento>("todos");
  const [sku, setSku] = useState("");
  const [ean, setEan] = useState("");
  const [buscando, setBuscando] = useState(false);

  const buscaValida = modo === "todos" || sku.trim() !== "" || ean.trim() !== "";

  const receber = async () => {
    if (!buscaValida) return;
    setBuscando(true);
    // Fictício: sem API ainda, cada clique fabrica anúncio de exemplo. O
    // filtro por marketplace e o modo específico já ficam prontos pro dia
    // em que isso vira uma chamada real por conta.
    await new Promise((resolve) => setTimeout(resolve, 900));

    const alvo = marketplace === "todos" ? undefined : marketplace;
    const contasAtivas = contasService.ativas(alvo);

    if (contasAtivas.length === 0) {
      setBuscando(false);
      toast.error("Nenhuma conta conectada nesse marketplace ainda.");
      return;
    }

    let vinculadosAuto = 0;
    for (const conta of contasAtivas) {
      const novo =
        modo === "todos"
          ? anunciosService.puxarNovoAnuncio(conta)
          : anunciosService.puxarAnuncioEspecifico(conta, { sku, ean });
      if (novo.produtoId) vinculadosAuto++;
      atualizarConta(conta.id, { ultimaSincronizacao: new Date().toISOString() });
    }

    setBuscando(false);
    toast.success(
      modo === "todos"
        ? `${formatNumero(contasAtivas.length)} conta(s) verificada(s) — anúncio(s) novo(s) encontrado(s)` +
            (vinculadosAuto > 0
              ? `, ${formatNumero(vinculadosAuto)} já vinculado(s) automaticamente pelo SKU.`
              : ".")
        : `Anúncio buscado em ${formatNumero(contasAtivas.length)} conta(s).`,
    );
    aoConcluir();
  };

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Receber anúncios</DialogTitle>
          <DialogDescription>
            Puxa os anúncios do marketplace para a tela de Precificação — o que chegar sem CMV
            cai em "sem vínculo", esperando você informar o custo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">De qual marketplace?</Label>
            <Select
              value={marketplace}
              onValueChange={(v) => {
                const escolhido = v as MarketplaceId | "todos";
                setMarketplace(escolhido);
                // Buscar um anúncio específico só faz sentido dentro de UM
                // marketplace — em "todos", trava em "puxar tudo" e some a
                // pergunta seguinte, em vez de deixar uma combinação sem
                // sentido disponível.
                if (escolhido === "todos") setModo("todos");
              }}
            >
              <SelectTrigger className="mt-1 h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPCOES_MARKETPLACE.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {marketplace !== "todos" && (
            <div>
              <Label className="text-xs text-muted-foreground">O quê?</Label>
              <Select value={modo} onValueChange={(v) => setModo(v as ModoRecebimento)}>
                <SelectTrigger className="mt-1 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Puxar todos os anúncios</SelectItem>
                  <SelectItem value="especifico">Puxar um anúncio específico</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {modo === "especifico" && marketplace !== "todos" && (
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 p-3">
              <div>
                <Label className="text-xs text-muted-foreground">SKU</Label>
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Código do anúncio"
                  className="mt-1"
                  disabled={buscando}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">EAN</Label>
                <Input
                  value={ean}
                  onChange={(e) => setEan(e.target.value)}
                  placeholder="Código de barras"
                  className="mt-1"
                  disabled={buscando}
                />
              </div>
              {!buscaValida && (
                <p className="col-span-2 text-[10px] text-muted-foreground">
                  Informe pelo menos SKU ou EAN.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={buscando}>
            Cancelar
          </Button>
          <Button onClick={receber} disabled={!buscaValida || buscando}>
            {buscando ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Receber
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
