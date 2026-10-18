import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Send,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  ajustesCustoService,
  alteracoesPrecoService,
  faixasPrecoService,
  anunciosService,
  contasService,
  produtosService,
  precosPlanejadosService,
  preferenciasPrecoService,
  precosMlService,
  atualizarAnunciosDoCanal,
  promocoesCriadasService,
  type PromocaoCriada,
  type AlteracaoPrecoRegistrada,
  type CampoBasePreco,
  type PrecoPlanejado,
} from "@/services";
import { emDemonstracao } from "@/lib/demonstracao";
import { custosEm, limparCustos, pedirCustos, useVersaoCustos } from "@/lib/custos-canal";
import {
  DESCONTO_MAX_ML,
  DESCONTO_MIN_ML,
  LIMITE_FRETE_GRATIS_ML,
  anunciosVisiveis,
  cheioDoPromo,
  contaDaLinha,
  precoPelaMargem,
  promoDoCheio,
  type ContaDaLinha,
} from "@/lib/linha-preco";
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
  type FaixaPreco,
  type FaixasPorCanal,
  type Detalhamento,
  type Limites,
  type ModoAds,
} from "@/lib/precificacao";
import { SeloMarketplace } from "@/components/comum/Indicadores";
import { getMarketplace } from "@/data/mock";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { DialogVincularProduto } from "@/components/comum/DialogVincularProduto";
import { DialogImportarCmv } from "@/components/produtos/DialogImportarCmv";
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
import { FotoAnuncio } from "@/components/comum/FotoAnuncio";

// A tela continua no endereço /produtos (é o mesmo lugar da antiga tela
// Custos), só mudou de nome e ganhou a planilha completa de preço.
export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Precificação | Planeta97" },
      {
        name: "description",
        content:
          "Todos os produtos e anúncios numa planilha: custo, taxas, lucro, margem e preço novo.",
      },
      { property: "og:title", content: "Precificação | Planeta97" },
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
  /** Preço cheio, promoção, situação no canal e contas da linha */
  conta: ContaDaLinha;
  plano: PrecoPlanejado | null;
  descontoPadrao: number | null;
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
}

type Ordenacao =
  | "nome-az"
  | "nome-za"
  | "margem-maior"
  | "margem-menor"
  | "lucro-maior"
  | "lucro-menor";

const OPCOES_ORDENAR: { id: Ordenacao; rotulo: string }[] = [
  { id: "nome-az", rotulo: "Nome (A-Z)" },
  { id: "nome-za", rotulo: "Nome (Z-A)" },
  { id: "margem-maior", rotulo: "Margem: maior primeiro" },
  { id: "margem-menor", rotulo: "Margem: menor primeiro (prejuízo no topo)" },
  { id: "lucro-maior", rotulo: "Lucro: maior primeiro" },
  { id: "lucro-menor", rotulo: "Lucro: menor primeiro" },
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
  const { sessao, perfil } = useAuth();

  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas");
  const [situacaoFiltro, setSituacaoFiltro] = useState<"todos" | SituacaoProduto>("todos");
  const [tipoFiltro, setTipoFiltro] = useState<FiltroTipoAnuncio>("todos");
  const [agrupar, setAgrupar] = useState<"produto" | "categoria">("produto");
  const [ordenar, setOrdenar] = useState<Ordenacao>("nome-az");
  /** Produtos recolhidos (por padrão todos ficam abertos) */
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [verPendentes, setVerPendentes] = useState(true);

  const [editandoCmv, setEditandoCmv] = useState<string | null>(null);
  const [valorCmv, setValorCmv] = useState("");
  const [editandoCategoria, setEditandoCategoria] = useState<string | null>(null);
  const [valorCategoria, setValorCategoria] = useState("");


  const [emVinculo, setEmVinculo] = useState<Anuncio | null>(null);
  const [emEdicaoProduto, setEmEdicaoProduto] = useState<Produto | null>(null);
  const [emExclusao, setEmExclusao] = useState<Produto | null>(null);
  const [receberAberto, setReceberAberto] = useState(false);
  const [importarCmvAberto, setImportarCmvAberto] = useState(false);
  // Os anúncios ainda vivem fora do React (src/data/mock.ts) — dependem da
  // API do marketplace, que depende do CNPJ. Este contador força a
  // releitura deles depois de cada mudança.
  const [tick, setTick] = useState(0);

  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregandoProdutos, setCarregandoProdutos] = useState(true);
  /** Ajustes de Ads e Outros, por anúncio */
  const [ajustes, setAjustes] = useState<Map<string, AjusteCusto>>(new Map());
  /** Regras de taxa fixa e frete por faixa de preço, por canal */
  const [faixas, setFaixas] = useState<FaixasPorCanal>({});
  const [faixasAberto, setFaixasAberto] = useState(false);
  /** Margem digitada na linha do produto, pra preencher em todos os canais */
  const [margemTodos, setMargemTodos] = useState<Record<string, string>>({});
  /** Última mudança de preço feita aqui, por anúncio — o preço fica colorido */
  const [precosAlterados, setPrecosAlterados] = useState<Map<string, AlteracaoPrecoRegistrada>>(
    new Map(),
  );
  /** Preço planejado de cada anúncio (cheio, desconto, promocional) */
  const [planos, setPlanos] = useState<Map<string, PrecoPlanejado>>(new Map());
  /** Desconto padrão de cada conta, em % */
  const [descontosPadrao, setDescontosPadrao] = useState<Record<string, number>>({});
  /** Anúncios sendo lançados no canal agora */
  const [enviando, setEnviando] = useState<Set<string>>(new Set());
  /** "todos" ou o id do anúncio sendo atualizado do canal */
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [promoFiltro, setPromoFiltro] = useState<FiltroPromocao>("todos");
  /** "geral" = todos os canais lado a lado; ou um canal (cada um com as suas regras) */
  const [abaCanal, setAbaCanal] = useState<"geral" | MarketplaceId | null>(null);
  /** Lançamento esperando o seller escolher a promoção (ou confirmar) */
  const [confirmarLancamento, setConfirmarLancamento] = useState<LinhaAnuncio[] | null>(null);
  /** Promoções do seller criadas pelo painel (pra entrar ao lançar) */
  const [criadas, setCriadas] = useState<PromocaoCriada[]>([]);
  const versaoCustos = useVersaoCustos();
  const gravacoes = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const carregarProdutos = useCallback(async () => {
    if (!sessao) return;
    const [lista, alteracoes, mapaAjustes, regrasFaixas, mapaPlanos, padroes] = await Promise.all([
      produtosService.listar(sessao.user.id),
      alteracoesPrecoService.listar(sessao.user.id),
      ajustesCustoService.listar(sessao.user.id),
      faixasPrecoService.listar(sessao.user.id),
      precosPlanejadosService.listar(sessao.user.id),
      preferenciasPrecoService.listar(sessao.user.id),
    ]);
    promocoesCriadasService.listar(sessao.user.id).then(setCriadas);
    setAjustes(mapaAjustes);
    setFaixas(regrasFaixas);
    setPlanos(mapaPlanos);
    setDescontosPadrao(padroes);
    const ultimas = new Map<string, AlteracaoPrecoRegistrada>();
    // A lista vem da mais nova pra mais antiga: a primeira de cada anúncio vale.
    for (const alt of alteracoes) if (!ultimas.has(alt.anuncioId)) ultimas.set(alt.anuncioId, alt);
    setPrecosAlterados(ultimas);
    // Casa cada produto real com os anúncios pelo SKU (o CMV vem do produto)
    // e reaplica os preços que o seller já mudou aqui.
    produtosService.reconciliarComAnuncios(lista);
    // Com o canal conectado, o preço de cada anúncio é o que está lá (lido
    // na sincronização). Só a demonstração reaplica os preços salvos aqui.
    if (emDemonstracao()) alteracoesPrecoService.aplicarNosAnuncios(alteracoes);
    setProdutos(lista);
    setCarregandoProdutos(false);
    setTick((n) => n + 1);
  }, [sessao]);

  useEffect(() => {
    carregarProdutos();
  }, [carregarProdutos]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const anuncios = useMemo(() => anunciosService.listar().slice(), [tick]);
  /** Sem inativos e sem o tradicional que tem o mesmo produto em catálogo. */
  const visiveis = useMemo(() => anunciosVisiveis(anuncios), [anuncios]);
  /** Canais com anúncio (cada um vira uma aba) */
  const canais = useMemo(() => {
    const contagem = new Map<MarketplaceId, number>();
    for (const a of visiveis) contagem.set(a.marketplaceId, (contagem.get(a.marketplaceId) ?? 0) + 1);
    return [...contagem.entries()].sort((x, y) => y[1] - x[1]);
  }, [visiveis]);
  const aba: "geral" | MarketplaceId =
    abaCanal ?? (canais.some(([id]) => id === "mercado-livre") ? "mercado-livre" : (canais[0]?.[0] ?? "geral"));
  const pendentes = useMemo(
    () =>
      visiveis
        .filter((a) => !a.produtoId)
        .filter((a) => semRestricaoDeConta || contasSelecionadas.has(a.contaId))
        .filter((a) => passaNoTipo(a, tipoFiltro))
        .filter((a) => aba === "geral" || a.marketplaceId === aba)
        // Faturamento perdido primeiro: resolver o que mais vende rende mais
        .sort((a, b) => b.precoAtual * b.unidadesVendidas - a.precoAtual * a.unidadesVendidas),
    [visiveis, semRestricaoDeConta, contasSelecionadas, tipoFiltro, aba],
  );

  /** Quantos anúncios dividem o mesmo estoque no canal (mesmo produto do
   * vendedor no ML: o de catálogo e os tradicionais do mesmo item). */
  const tamanhoGrupoEstoque = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const a of anuncios) if (a.grupoEstoque) mapa.set(a.grupoEstoque, (mapa.get(a.grupoEstoque) ?? 0) + 1);
    return mapa;
  }, [anuncios]);

  // A busca também procura nos anúncios sem produto vinculado — e abre a
  // faixa vermelha sozinha quando acha algum lá.
  const termoBusca = busca.trim().toLowerCase();
  const pendentesVisiveis = termoBusca
    ? pendentes.filter((a) => `${a.produto} ${a.sku}`.toLowerCase().includes(termoBusca))
    : pendentes;
  const pendentesAbertos = verPendentes || (termoBusca !== "" && pendentesVisiveis.length > 0);

  /** As contas de cada anúncio usam a alíquota e os custos operacionais
   * das Configurações — os mesmos do resto do NEXO. */
  const cfg: ConfigPrecificacao = useMemo(
    () => ({ aliquotaImposto: fiscal.aliquota, custosOperacionais: custoOperacionalDetalhado, faixas }),
    [fiscal, custoOperacionalDetalhado, faixas],
  );

  const categorias = useMemo(() => {
    const unicas = new Set<string>();
    for (const p of produtos) {
      const c = p.categoria?.trim();
      if (c) unicas.add(c);
    }
    return Array.from(unicas).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [produtos]);

  /** Quantos produtos em cada categoria (e sem categoria) — aparece na lista do filtro */
  const contagemCategorias = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of produtos) {
      const chave = p.categoria?.trim() || SEM_CATEGORIA;
      mapa.set(chave, (mapa.get(chave) ?? 0) + 1);
    }
    return mapa;
  }, [produtos]);

  const grupos = useMemo<GrupoProduto[]>(() => {
    return produtos.map((p) => {
      const vinculados = visiveis.filter((a) => a.produtoId === p.id);
      const naSelecao = (
        semRestricaoDeConta ? vinculados : vinculados.filter((a) => contasSelecionadas.has(a.contaId))
      )
        .filter((a) => aba === "geral" || a.marketplaceId === aba)
        .filter((a) => passaNoTipo(a, tipoFiltro));
      const linhas: LinhaAnuncio[] = naSelecao.map((a) => {
        const metas = metasPorConta[a.contaId] ?? null;
        const margemMinima = metas?.margemMinima ?? FAIXAS_MARGEM_PADRAO.margemMinima;
        // O CMV mora no produto: é isso que faz mudar o custo aqui refletir
        // em todo canal de uma vez.
        const comCmv = { ...a, cmv: p.cmv };
        const ajuste = ajustes.get(a.id) ?? AJUSTE_PADRAO;
        const plano = planos.get(a.id) ?? null;
        const descontoPadrao = descontosPadrao[a.contaId] ?? null;
        const conta = contaDaLinha({
          anuncio: a,
          comCmv,
          ajuste,
          cfg,
          plano,
          descontoPadrao,
          margemMinima,
          custos: (preco) => custosEm(a.id, preco),
          enviando: enviando.has(a.id),
        });
        return {
          anuncio: a,
          comCmv,
          nomeConta: contasService.buscar(a.contaId)?.nome ?? "—",
          margemMinima,
          ajuste,
          // O que vale na linha: a simulação (azul) ou o que está no canal.
          det: conta.det,
          limites: limitesComAjuste(comCmv, margemMinima, ajuste, cfg),
          conta,
          plano,
          descontoPadrao,
        };
      }).filter((l) => passaNaPromocao(l.conta, promoFiltro));
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
    tipoFiltro,
    visiveis,
    planos,
    descontosPadrao,
    enviando,
    versaoCustos,
    promoFiltro,
    aba,
  ]);

  const gruposFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const lista = grupos.filter((g) => {
      // Com um canal/conta marcado lá em cima, some o produto sem anúncio nele.
      if (!semRestricaoDeConta && g.linhas.length === 0) return false;
      // Filtrando por tipo (catálogo/tradicional), some o produto sem anúncio desse tipo.
      if ((tipoFiltro !== "todos" || promoFiltro !== "todos" || aba !== "geral") && g.linhas.length === 0)
        return false;
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
  }, [grupos, busca, situacaoFiltro, categoriaFiltro, ordenar, semRestricaoDeConta, tipoFiltro, promoFiltro, aba]);

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
    todasLinhas.length > 0 ? todasLinhas.reduce((s, l) => s + l.conta.detAgora.margem, 0) / todasLinhas.length : 0;
  /** Mudou aqui e ainda não foi pro canal (ou o canal recusou) */
  const alterados = todasLinhas.filter((l) => podeLancar(l));
  const recusados = todasLinhas.filter((l) => l.conta.envio === "erro").length;
  /** Promoção planejada e nenhuma valendo: o cliente está pagando o cheio */
  const semPromocaoAtiva = todasLinhas.filter((l) => l.conta.estadoPromocao === "sem-promocao").length;
  const promoOutroValor = todasLinhas.filter((l) => l.conta.estadoPromocao === "outro-valor").length;
  const subirAntesQtd = todasLinhas.filter((l) => passaNaPromocao(l.conta, "subir-antes")).length;
  /** Contas do Mercado Livre (o desconto padrão vale pra elas) */
  const contasDescontoPadrao = useMemo(() => {
    const ids = [...new Set(visiveis.filter((a) => a.marketplaceId === "mercado-livre").map((a) => a.contaId))];
    return ids.map((id) => ({ id, nome: contasService.buscar(id)?.nome ?? "Conta" }));
  }, [visiveis]);
  /** Última leitura dos anúncios no canal */
  const ultimaLeitura = visiveis.reduce<string | null>(
    (maior, a) => (a.atualizadoEm && (!maior || a.atualizadoEm > maior) ? a.atualizadoEm : maior),
    null,
  );

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

  /* ------------------- preço planejado e envio ao canal ------------------- */

  /** Muda o plano de um anúncio na hora (a linha recalcula) e grava no banco
   * logo depois que o seller para de digitar. null = volta ao preço do canal. */
  const mudarPlano = (
    linha: LinhaAnuncio,
    plano: Pick<PrecoPlanejado, "precoCheio" | "descontoPercentual" | "precoPromocional" | "campoBase"> | null,
  ) => {
    if (!sessao) return;
    const a = linha.anuncio;
    setPlanos((atual) => {
      const novo = new Map(atual);
      if (plano === null) novo.delete(a.id);
      else
        novo.set(a.id, {
          anuncioId: a.id,
          ...plano,
          statusEnvio: "rascunho",
          erroEnvio: null,
          precoEnviado: atual.get(a.id)?.precoEnviado ?? null,
          enviadoEm: atual.get(a.id)?.enviadoEm ?? null,
          atualizadoEm: new Date().toISOString(),
        });
      return novo;
    });
    const anterior = gravacoes.current.get(a.id);
    if (anterior) clearTimeout(anterior);
    gravacoes.current.set(
      a.id,
      setTimeout(async () => {
        gravacoes.current.delete(a.id);
        const erro =
          plano === null
            ? await precosPlanejadosService.remover(sessao.user.id, a.id)
            : await precosPlanejadosService.salvar(sessao.user.id, a, plano);
        if (erro) toast.error(`Não consegui salvar o preço planejado: ${erro}`);
      }, 700),
    );
  };

  /** Preço pela margem em todos os anúncios do produto (cada canal calcula
   * o seu). Nada vai pro canal até "Lançar". */
  const preencherMargemTodos = (g: GrupoProduto) => {
    const m = lerNumero((margemTodos[g.produto.id] ?? "").trim());
    if (m === null) {
      toast.error("Digite a margem, por exemplo 25.");
      return;
    }
    let semPreco = 0;
    for (const l of g.linhas) {
      const { preco } = precoPelaMargem(l.comCmv, m / 100, l.ajuste, cfg, (x) => custosEm(l.anuncio.id, x));
      if (preco === null) {
        semPreco++;
        continue;
      }
      const desconto = l.plano?.descontoPercentual ?? l.descontoPadrao ?? 0;
      mudarPlano(
        l,
        desconto > 0
          ? {
              precoCheio: cheioDoPromo(preco, desconto),
              descontoPercentual: l.plano?.descontoPercentual ?? null,
              precoPromocional: preco,
              campoBase: "margem",
            }
          : { precoCheio: preco, descontoPercentual: l.plano?.descontoPercentual ?? null, precoPromocional: null, campoBase: "margem" },
      );
    }
    if (semPreco > 0) toast.error(`${semPreco} anúncio(s) não chegam nessa margem com as taxas de hoje.`);
  };

  /** "Repetir": o que foi preenchido num anúncio vai pros outros anúncios do
   * mesmo produto (ex.: catálogo + tradicional, Clássico + Premium). */
  const repetirNosOutros = (g: GrupoProduto, origem: LinhaAnuncio) => {
    const c = origem.conta;
    const plano = origem.plano;
    const outros = g.linhas.filter((l) => l.anuncio.id !== origem.anuncio.id);
    if (outros.length === 0) return;
    for (const l of outros) {
      if (!plano) mudarPlano(l, null);
      else
        mudarPlano(l, {
          precoCheio: c.planoCheio ?? c.cheioCanal,
          descontoPercentual: plano.descontoPercentual,
          precoPromocional: plano.precoPromocional,
          campoBase: plano.campoBase === "margem" ? "promo" : plano.campoBase,
        });
    }
    toast.success(
      plano
        ? `Repetido em ${outros.length} anúncio${outros.length > 1 ? "s" : ""}: cheio ${formatBRL(c.planoCheio ?? c.cheioCanal)}${c.planoPromo ? ` · promo ${formatBRL(c.planoPromo)}` : ""}.`
        : `Os outros ${outros.length} anúncio(s) voltaram ao preço do canal.`,
    );
  };

  /** Lança o preço cheio planejado no canal. Anúncio com promoção valendo
   * pede confirmação antes (subir o preço tira a promoção, regra do ML). */
  const pedirLancamento = (linhas: LinhaAnuncio[]) => {
    const prontas = linhas.filter((l) => podeLancar(l));
    if (prontas.length === 0) return;
    setConfirmarLancamento(prontas);
  };

  const lancar = async (
    linhas: LinhaAnuncio[],
    promocao: { tipo: "PRICE_DISCOUNT" | "SELLER_CAMPAIGN"; idPromocao?: string; nome: string; fim: string | null } | null,
    modo: ModoLancamento = "tudo",
  ) => {
    setConfirmarLancamento(null);
    // Etapa 1 sozinha: ninguém entra em promoção agora.
    if (modo === "preco") promocao = null;
    const ids = linhas.map((l) => l.anuncio.id);
    setEnviando((atual) => new Set([...atual, ...ids]));
    const resultados = await precosMlService.lancar(
      linhas.map((l) => ({
        anuncioId: l.anuncio.id,
        preco: l.conta.planoCheio ?? l.conta.cheioCanal,
        precoPromo: promocao ? l.conta.planoPromo : null,
        promocao: promocao && l.conta.planoPromo ? { tipo: promocao.tipo, idPromocao: promocao.idPromocao } : null,
        // Etapa 2 sozinha: o preço cheio não muda agora.
        soPromocao: modo === "promo",
      })),
    );
    setEnviando((atual) => {
      const novo = new Set(atual);
      for (const id of ids) novo.delete(id);
      return novo;
    });
    const agora = new Date().toISOString();
    let ok = 0;
    let promoOk = 0;
    const erros: string[] = [];
    const errosPromo: string[] = [];
    setPlanos((atual) => {
      const novo = new Map(atual);
      for (const r of resultados) {
        const plano = novo.get(r.anuncioId);
        if (!plano) continue;
        novo.set(r.anuncioId, {
          ...plano,
          statusEnvio: r.ok ? "enviado" : "erro",
          erroEnvio: r.ok ? null : (r.erro ?? "O canal recusou."),
          precoEnviado: r.ok ? plano.precoCheio : plano.precoEnviado,
          enviadoEm: r.ok ? agora : plano.enviadoEm,
          statusPromo: r.promoOk === true ? "enviada" : r.promoOk === false ? "erro" : plano.statusPromo,
          erroPromo: r.promoOk === false ? (r.erroPromo ?? "O canal recusou a promoção.") : r.promoOk ? null : plano.erroPromo,
        });
      }
      return novo;
    });
    for (const r of resultados) {
      const l = linhas.find((x) => x.anuncio.id === r.anuncioId);
      if (!l) continue;
      if (!r.ok) {
        erros.push(`${l.anuncio.produto}: ${r.erro ?? "o canal recusou"}`);
        continue;
      }
      ok++;
      const a = l.anuncio;
      const novoCheio = l.conta.planoCheio ?? l.conta.cheioCanal;
      // Subir o preço tira a promoção antiga (regra do ML); se entrou na nova,
      // o cliente passa a pagar o promocional.
      if (r.promoOk && l.conta.planoPromo && promocao) {
        promoOk++;
        a.promocaoAtiva = { nome: promocao.nome, tipo: promocao.tipo, preco: l.conta.planoPromo, precoCheio: novoCheio, fim: promocao.fim };
        a.precoAtual = l.conta.planoPromo;
      } else {
        if (a.promocaoAtiva && novoCheio > a.promocaoAtiva.precoCheio) a.promocaoAtiva = null;
        if (a.promocaoAtiva) a.promocaoAtiva = { ...a.promocaoAtiva, precoCheio: novoCheio };
        else a.precoAtual = novoCheio;
        if (r.promoOk === false) errosPromo.push(`${a.produto}: ${r.erroPromo ?? "recusada"}`);
      }
      // Os anúncios do mesmo produto (catálogo + tradicional) vão juntos.
      for (const irmao of anuncios) {
        if (irmao.id !== a.id && a.grupoEstoque && irmao.grupoEstoque === a.grupoEstoque) {
          irmao.promocaoAtiva = a.promocaoAtiva ? { ...a.promocaoAtiva } : irmao.promocaoAtiva;
          irmao.precoAtual = a.precoAtual;
        }
      }
    }
    setTick((n) => n + 1);
    if (ok > 0)
      toast.success(
        `Preço lançado no Mercado Livre em ${ok} anúncio${ok > 1 ? "s" : ""}${promoOk ? ` · ${promoOk} já em promoção` : ""}.`,
      );
    if (erros.length > 0)
      toast.error(`O Mercado Livre recusou ${erros.length} preço(s).`, { description: erros.slice(0, 3).join(" · ") });
    if (errosPromo.length > 0)
      toast.error(`O preço subiu, mas o Mercado Livre recusou a promoção em ${errosPromo.length} anúncio(s).`, {
        description: errosPromo.slice(0, 3).join(" · "),
      });
  };

  /** Lê de novo do canal: todos os anúncios ou só um. */
  const atualizarDoCanal = async (linha?: LinhaAnuncio) => {
    setAtualizando(linha ? linha.anuncio.id : "todos");
    const idsMl = linha ? [linha.anuncio.idExterno ?? ""].filter(Boolean) : [];
    const { erro, resumo } = await atualizarAnunciosDoCanal(idsMl);
    setAtualizando(null);
    if (erro) {
      toast.error(erro);
      return;
    }
    limparCustos();
    toast.success(resumo, { description: "Recarregando os dados do canal..." });
    // Recarrega os dados reais (anúncios, taxas, frete e promoções).
    window.dispatchEvent(new Event("nexo:dados-reais"));
  };

  const salvarDescontoPadrao = async (contaId: string, valor: number | null) => {
    if (!sessao) return;
    const erro = await preferenciasPrecoService.salvar(sessao.user.id, contaId, valor);
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      return;
    }
    setDescontosPadrao((atual) => {
      const novo = { ...atual };
      if (valor === null) delete novo[contaId];
      else novo[contaId] = valor;
      return novo;
    });
    toast.success(valor === null ? "Desconto padrão removido." : `Desconto padrão: ${valor}%.`);
  };

  /** Salva as faixas de preço de um canal. */
  const salvarFaixas = async (marketplaceId: MarketplaceId, lista: FaixaPreco[]): Promise<boolean> => {
    if (!sessao) return false;
    const erro = await faixasPrecoService.salvar(sessao.user.id, marketplaceId, lista);
    if (erro) {
      toast.error(
        erro.includes("faixas_preco_canal")
          ? "A tabela de faixas ainda não existe — rode o SQL da parte 8 da Precificação no Supabase."
          : `Não consegui salvar: ${erro}`,
      );
      return false;
    }
    setFaixas((atual) => ({ ...atual, [marketplaceId]: lista }));
    toast.success("Faixas de preço salvas. A simulação de preço já usa.");
    return true;
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
    <div className="w-full space-y-6">
      <PainelLivre
        titulo="Precificação"
        descricao="Todos os produtos e anúncios numa planilha: custo, taxas, lucro e margem — e o preço novo, por valor ou por margem"
        acoes={
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setFaixasAberto(true)}>
              Taxa e frete por faixa
            </Button>
            <Button size="sm" variant="outline" onClick={() => setImportarCmvAberto(true)}>
              <Upload className="size-3.5" />
              Importar CMV
            </Button>
            <PopoverDescontoPadrao
              contas={contasDescontoPadrao}
              valores={descontosPadrao}
              aoSalvar={salvarDescontoPadrao}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={atualizando !== null}
              onClick={() => atualizarDoCanal()}
              title="Lê de novo no canal o preço, a comissão, a taxa fixa, o frete, a situação e as promoções de todos os anúncios"
            >
              <RefreshCw className={cn("size-3.5", atualizando === "todos" && "animate-spin")} />
              Atualizar anúncios
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReceberAberto(true)}>
              Receber anúncios
            </Button>
            {alterados.length > 0 && (
              <Button size="sm" onClick={() => pedirLancamento(alterados)} disabled={enviando.size > 0}>
                {enviando.size > 0 ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Lançar alterados ({alterados.length})
              </Button>
            )}
            <ExportarDados
              nomeArquivo="precificacao"
              linhas={grupos.flatMap((g) =>
                g.linhas.map((l) => ({
                  Produto: g.produto.nome,
                  SKU: g.produto.sku,
                  Categoria: g.produto.categoria ?? "",
                  Canal: l.anuncio.marketplaceId,
                  Conta: l.nomeConta,
                  "Preço cheio no canal": l.conta.cheioCanal.toFixed(2),
                  "Cliente paga agora": l.conta.precoCliente.toFixed(2),
                  "Preço cheio planejado": l.conta.planoCheio?.toFixed(2) ?? "",
                  "Desconto %": l.conta.desconto ? String(l.conta.desconto) : "",
                  "Promocional planejado": l.conta.planoPromo?.toFixed(2) ?? "",
                  Promoção: ROTULO_ESTADO_PROMO[l.conta.estadoPromocao],
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
        {/* Abas: Geral (todos os canais lado a lado) e uma por canal */}
        <div className="flex flex-wrap gap-1 border-b px-4 pt-3">
          {([["geral", visiveis.length] as const, ...canais] as const).map(([id, qtd]) => (
            <button
              key={id}
              onClick={() => {
                setAbaCanal(id);
                setPromoFiltro("todos");
              }}
              className={cn(
                "-mb-px rounded-t-md border-b-2 px-3 py-2 text-xs font-semibold transition-colors",
                aba === id ? "border-brand text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {id === "geral" ? "Geral" : getMarketplace(id).nome}{" "}
              <span className="font-normal text-muted-foreground">({formatNumero(qtd)})</span>
            </button>
          ))}
        </div>

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

        {/* Situação no canal: leitura, promoções que não estão valendo, recusas */}
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2 text-[11px]">
          <span className="text-muted-foreground">
            {ultimaLeitura ? `Anúncios lidos do canal ${tempoAtras(ultimaLeitura)}` : "Anúncios ainda não lidos do canal"}
          </span>
          {semPromocaoAtiva > 0 && (
            <button
              onClick={() => setPromoFiltro("sem-promocao")}
              className="inline-flex items-center gap-1.5 rounded-md border border-loss/40 bg-loss-soft/40 px-2 py-1 font-semibold text-loss"
              title="Esses anúncios têm desconto planejado aqui, mas nenhuma promoção valendo no canal: o cliente paga o preço cheio"
            >
              <AlertTriangle className="size-3.5" />
              {semPromocaoAtiva} anúncio{semPromocaoAtiva > 1 ? "s" : ""} sem promoção ativa — o cliente paga o preço cheio
            </button>
          )}
          {promoOutroValor > 0 && (
            <button
              onClick={() => setPromoFiltro("outro-valor")}
              className="inline-flex items-center gap-1.5 rounded-md border border-warning/40 bg-warning/10 px-2 py-1 font-semibold text-warning"
            >
              {promoOutroValor} em promoção num valor diferente do planejado
            </button>
          )}
          {subirAntesQtd > 0 && (
            <button
              onClick={() => setPromoFiltro("subir-antes")}
              className="inline-flex items-center gap-1.5 rounded-md border border-brand/50 bg-brand/10 px-2 py-1 font-semibold text-brand"
              title="O desconto planejado pede um preço cheio maior: primeiro sobe o preço, depois a promoção"
            >
              {subirAntesQtd} precisa{subirAntesQtd > 1 ? "m" : ""} subir o preço antes da promoção
            </button>
          )}
          {recusados > 0 && (
            <button
              onClick={() => setPromoFiltro("alterados")}
              className="inline-flex items-center gap-1.5 rounded-md border border-loss/40 px-2 py-1 font-semibold text-loss"
            >
              {recusados} lançamento{recusados > 1 ? "s" : ""} recusado{recusados > 1 ? "s" : ""} pelo canal
            </button>
          )}
          {promoFiltro !== "todos" && (
            <button onClick={() => setPromoFiltro("todos")} className="text-muted-foreground underline">
              Mostrar todos
            </button>
          )}
        </div>

        {/* Anúncios sem produto vinculado (a busca também procura aqui) */}
        {pendentes.length > 0 && (!termoBusca || pendentesVisiveis.length > 0) && (
          <div className="border-b">
            <button
              onClick={() => setVerPendentes((v) => !v)}
              className="flex w-full items-center gap-2 bg-loss-soft/30 px-4 py-2.5 text-left"
            >
              {pendentesAbertos ? (
                <ChevronDown className="size-3.5 text-loss" />
              ) : (
                <ChevronRight className="size-3.5 text-loss" />
              )}
              <span className="text-xs font-semibold text-loss">
                {formatNumero(pendentesVisiveis.length)} anúncio{pendentesVisiveis.length > 1 ? "s" : ""}{" "}
                sem produto vinculado{termoBusca ? ` com "${busca.trim()}"` : ""}
              </span>
              <span className="text-[10px] text-muted-foreground">
                — sem CMV não dá pra calcular lucro. Vincule a um produto ou crie um novo. No
                Mercado Livre, o mesmo SKU pode ter um anúncio de catálogo e um ou mais
                tradicionais (inclusive inativos): cada um aparece aqui separado.
              </span>
            </button>
            {pendentesAbertos && (
              <div className="divide-y">
                {pendentesVisiveis.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <FotoAnuncio anuncioId={a.id} />
                    <div className="min-w-[200px] flex-1">
                      <p className="truncate text-xs font-medium">{a.produto}</p>
                      <p className="num text-[10px] text-muted-foreground">{a.sku}</p>
                    </div>
                    <SeloMarketplace id={a.marketplaceId} />
                    <SelosTipoAnuncio anuncio={a} dividemEstoque={tamanhoGrupoEstoque.get(a.grupoEstoque ?? "") ?? 0} />
                    <span className="text-[10px] text-muted-foreground">
                      {contasService.buscar(a.contaId)?.nome ?? "—"} · {formatBRL(a.precoAtual)} ·{" "}
                      {formatNumero(a.estoque)} em estoque
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
            <FiltroCategoria
              valor={categoriaFiltro}
              aoMudar={setCategoriaFiltro}
              categorias={categorias}
              contagem={contagemCategorias}
            />
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
          <Filtro rotulo="Promoção">
            <Select value={promoFiltro} onValueChange={(v) => setPromoFiltro(v as FiltroPromocao)}>
              <SelectTrigger className="h-8 w-60 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas</SelectItem>
                <SelectItem value="ativa">Promoção ativa</SelectItem>
                <SelectItem value="outro-valor">Ativa em outro valor</SelectItem>
                <SelectItem value="sem-promocao">Sem promoção ativa</SelectItem>
                <SelectItem value="alterados">Mudou aqui, falta lançar</SelectItem>
                <SelectItem value="subir-antes">Subir o preço antes da promoção</SelectItem>
              </SelectContent>
            </Select>
          </Filtro>
          <Filtro rotulo="Tipo de anúncio">
            <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as FiltroTipoAnuncio)}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="catalogo">Só catálogo</SelectItem>
                <SelectItem value="tradicional">Só tradicional</SelectItem>
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

        {aba === "geral" && !carregandoProdutos && (
          <TabelaGeral grupos={gruposFiltrados} canais={canais.map(([id]) => id)} aoAbrirCanal={(id) => setAbaCanal(id)} />
        )}

        {/* A planilha */}
        <div className={cn("[&_.num]:[font-family:Helvetica,Arial,sans-serif] [&_input]:[font-family:Helvetica,Arial,sans-serif]", aba === "geral" && "hidden")}>
          <table className="w-full text-left">
            <tbody>
              {secoes.map((secao) => (
                <Fragment key={secao.titulo ?? "todos"}>
                  {secao.titulo && (
                    <tr className="border-y bg-brand/10">
                      <td colSpan={COLUNAS} className="px-1.5 py-2">
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
                        <tr className="border-t-2 border-white/40 bg-muted/30 [.claro_&]:border-black/70">
                          <td colSpan={COLUNAS} className="px-1.5 py-2">
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

                              {g.linhas.length > 1 && (
                                <span className="flex items-center gap-1.5">
                                  <span className="text-[10px] text-muted-foreground">Margem em todos os canais</span>
                                  <Input
                                    inputMode="decimal"
                                    value={margemTodos[p.id] ?? ""}
                                    onChange={(e) =>
                                      setMargemTodos((atual) => ({ ...atual, [p.id]: e.target.value }))
                                    }
                                    onKeyDown={(e) => e.key === "Enter" && preencherMargemTodos(g)}
                                    placeholder="25"
                                    className="num h-7 w-16 px-2 text-right text-xs"
                                  />
                                  <span className="text-[10px] text-muted-foreground">%</span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[11px]"
                                    onClick={() => preencherMargemTodos(g)}
                                  >
                                    Preencher
                                  </Button>
                                  {g.linhas.filter((l) => podeLancar(l)).length > 1 && (
                                    <Button
                                      size="sm"
                                      className="h-7 text-[11px]"
                                      disabled={g.linhas.some((l) => l.conta.envio === "enviando")}
                                      onClick={() => pedirLancamento(g.linhas)}
                                    >
                                      <Send className="size-3.5" />
                                      Lançar todos ({g.linhas.filter((l) => podeLancar(l)).length})
                                    </Button>
                                  )}
                                </span>
                              )}

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

                        {/* Anúncios do produto (com os títulos das colunas) */}
                        {aberto && g.linhas.length > 0 && <CabecalhoColunas />}
                        {aberto &&
                          g.linhas.map((l) => (
                            <LinhaDoAnuncio
                              key={l.anuncio.id}
                              linha={l}
                              cfg={cfg}
                              aoRepetir={g.linhas.length > 1 ? () => repetirNosOutros(g, l) : undefined}
                              aoSalvarAjuste={(ajuste, todos) => salvarAjuste(l, ajuste, todos)}
                              aoMudarPlano={(plano) => mudarPlano(l, plano)}
                              aoLancar={() => pedirLancamento([l])}
                              aoAtualizar={() => atualizarDoCanal(l)}
                              atualizando={atualizando === l.anuncio.id || atualizando === "todos"}
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
                  <td colSpan={COLUNAS} className="px-2 py-12 text-center">
                    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" />
                      Carregando seus produtos...
                    </span>
                  </td>
                </tr>
              )}
              {!carregandoProdutos && produtos.length === 0 && (
                <tr>
                  <td colSpan={COLUNAS} className="px-2 py-14 text-center">
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
                  <td colSpan={COLUNAS} className="px-2 py-12 text-center text-xs text-muted-foreground">
                    {termoBusca && pendentesVisiveis.length > 0 ? (
                      <>
                        Nenhum <strong>produto cadastrado</strong> com "{busca.trim()}". Mas achei{" "}
                        {pendentesVisiveis.length} anúncio{pendentesVisiveis.length > 1 ? "s" : ""} sem
                        produto vinculado com esse nome — {pendentesVisiveis.length > 1 ? "estão" : "está"} na
                        faixa vermelha lá em cima. Clique em <strong>Vincular</strong> pra criar o produto e
                        colocar o CMV.
                      </>
                    ) : (
                      "Nada encontrado com esses filtros."
                    )}
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
              <span className="font-semibold text-brand">R$ 0,00</span> Simulação: você mudou e ainda não lançou
              (Ads e Outros ajustados também ficam nesta cor)
            </span>
            <span className="ml-auto">A margem mínima de cada conta vem das metas em Configurações.</span>
          </div>
          <div className="flex flex-wrap gap-4">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-brand" /> Mudou aqui, falta lançar</span>
            <span className="flex items-center gap-1.5"><span className="size-2 animate-pulse rounded-full bg-warning" /> Enviando ao canal</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-profit" /> Igual ao canal (confirmado)</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-loss" /> O canal recusou (passe o mouse pra ver o motivo)</span>
          </div>
          <p>
            <strong>Preço cheio</strong> é o que vai pro canal no botão <strong>Lançar</strong>. Digite o preço
            promocional que você quer e o desconto: o preço cheio sai sozinho (ex.: R$ 78,99 com 30% → R$ 112,84).
            Ou digite o preço cheio, ou a margem — o campo que você digitou fica com contorno azul. A promoção em si
            é criada na tela <strong>Promoções</strong> ou no <strong>Lançar</strong> (1º sobe o preço, 2º sobe a
            promoção). <strong>Custos, lucro e margem</strong> são sempre do preço que você digitou (o promocional, ou o
            cheio se não tiver desconto) — em azul enquanto esse não é o preço que o cliente paga; embaixo, pequeno, o
            que acontece <strong>agora</strong> no canal. <strong>Voltar</strong> desfaz o que você mudou;{" "}
            <strong>Repetir</strong> copia o preço de um anúncio pros outros do mesmo produto.{" "}
            <strong>Frete, taxa fixa e comissão</strong> vêm do próprio Mercado Livre em cada preço (a partir de
            R$ 79 o frete grátis é obrigatório e o seu frete sobe). <strong>Mínimo</strong> = menor preço que
            respeita a margem mínima; <strong>Empate</strong> = preço de lucro zero. <strong>Ads</strong> e{" "}
            <strong>Outros</strong>: clique no valor pra escolher o que entra na conta.
          </p>
        </div>
      </PainelLivre>

      {confirmarLancamento && (
        <DialogLancar
          linhas={confirmarLancamento}
          criadas={criadas}
          aoFechar={() => setConfirmarLancamento(null)}
          aoLancar={(promocao, modo) => lancar(confirmarLancamento, promocao, modo)}
        />
      )}

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

      {faixasAberto && (
        <DialogFaixas faixas={faixas} aoFechar={() => setFaixasAberto(false)} aoSalvar={salvarFaixas} />
      )}

      {importarCmvAberto && (
        <DialogImportarCmv
          anuncios={anuncios}
          produtos={produtos}
          aoFechar={() => setImportarCmvAberto(false)}
          aoConcluir={() => {
            setImportarCmvAberto(false);
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

/**
 * Filtro de categoria com busca: com muitas categorias, a lista rola e dá
 * pra digitar pra achar. Mostra quantos produtos tem em cada uma.
 */
function FiltroCategoria({
  valor,
  aoMudar,
  categorias,
  contagem,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  categorias: string[];
  contagem: Map<string, number>;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  const filtradas = termo ? categorias.filter((c) => c.toLowerCase().includes(termo)) : categorias;
  const rotulo =
    valor === "todas" ? "Todas" : valor === SEM_CATEGORIA ? "Sem categoria" : valor;

  const escolher = (v: string) => {
    aoMudar(v);
    setAberto(false);
    setBusca("");
  };

  const Opcao = ({ id, texto, qtd }: { id: string; texto: string; qtd?: number }) => (
    <button
      onClick={() => escolher(id)}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted",
        valor === id && "bg-muted font-semibold",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{texto}</span>
      {qtd !== undefined && <span className="num text-[10px] text-muted-foreground">{qtd}</span>}
      {valor === id && <Check className="size-3.5 shrink-0" />}
    </button>
  );

  return (
    <Popover
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) setBusca("");
      }}
    >
      <PopoverTrigger asChild>
        <button className="flex h-8 w-44 items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-xs">
          <span className="truncate">{rotulo}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <Input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar categoria..."
          className="mb-2 h-8 text-xs"
        />
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {!termo && <Opcao id="todas" texto="Todas" />}
          {filtradas.map((c) => (
            <Opcao key={c} id={c} texto={c} qtd={contagem.get(c) ?? 0} />
          ))}
          {!termo && (
            <Opcao id={SEM_CATEGORIA} texto="Sem categoria" qtd={contagem.get(SEM_CATEGORIA) ?? 0} />
          )}
          {termo && filtradas.length === 0 && (
            <p className="px-2 py-3 text-center text-[11px] text-muted-foreground">
              Nenhuma categoria com "{busca.trim()}".
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** O quadro da Precificação sem moldura (a tela fica "livre") e com os
 * textos secundários mais claros, pra ler bem no fundo escuro. */
function PainelLivre({
  titulo,
  descricao,
  acoes,
  children,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card-glow overflow-hidden [--muted-foreground:oklch(0.86_0.01_255)] [.claro_&]:[--muted-foreground:#374151]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{titulo}</h2>
          {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </header>
      {children}
    </section>
  );
}

/** Títulos das colunas, repetidos em cada produto (a planilha é longa). */
function CabecalhoColunas() {
  const th = "px-1 py-1.5 text-right font-semibold";
  return (
    <tr className="bg-muted/40 text-[9px] uppercase tracking-wide text-muted-foreground">
      <th className="px-1 py-1.5 pl-4 text-left font-semibold">Canal / conta</th>
      <th className={th} title="O preço que vai pro canal (o botão Lançar manda este)">Preço cheio</th>
      <th className={th}>Desc. %</th>
      <th className={th} title="O preço com desconto. Verde = promoção valendo; amarelo = valendo em outro valor; tracejado vermelho = sem promoção">
        Preço promo
      </th>
      <th className={th}>CMV</th>
      <th className={th}>Comissão</th>
      <th className={th}>Taxa fixa</th>
      <th className={th}>Frete</th>
      <th className={th}>Ads</th>
      <th className={th}>Imposto</th>
      <th className={th}>Outros</th>
      <th className={th}>Lucro</th>
      <th className={th}>Margem</th>
      <th className={th}>Mínimo</th>
      <th className={th}>Empate</th>
      <th className="border-l px-1 py-1.5 text-right font-semibold">No canal</th>
    </tr>
  );
}

function Resumo({ rotulo, valor, cor }: { rotulo: string; valor: string; cor?: string }) {
  return (
    <div className="rounded-lg border border-white/50 bg-muted px-3 py-2 [.claro_&]:border-black/50">
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

type FiltroTipoAnuncio = "todos" | "catalogo" | "tradicional";

/** Catálogo x tradicional. Canal que não informa (catalogo null) conta como tradicional. */
function passaNoTipo(a: Anuncio, filtro: FiltroTipoAnuncio): boolean {
  if (filtro === "todos") return true;
  return filtro === "catalogo" ? a.catalogo === true : a.catalogo !== true;
}

/** Selos do anúncio: Catálogo/Tradicional, Clássico/Premium e a situação no
 * canal (ex.: "Inativo para revisar"). */
function SelosTipoAnuncio({ anuncio: a, dividemEstoque = 0 }: { anuncio: Anuncio; dividemEstoque?: number }) {
  if (a.catalogo === undefined && !a.situacaoCanal && !a.tipoAnuncio) return null;
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1">
      {a.catalogo !== undefined && a.catalogo !== null && (
        <span
          title={
            a.catalogo
              ? "Anúncio de catálogo: compete com outros vendedores na página do produto."
              : "Anúncio tradicional: página própria, com suas fotos e descrição."
          }
          className={cn(
            "rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
            a.catalogo ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          {a.catalogo ? "Catálogo" : "Tradicional"}
        </span>
      )}
      {a.tipoAnuncio && (
        <span className="rounded border px-1.5 py-0.5 text-[9px] text-muted-foreground">{a.tipoAnuncio}</span>
      )}
      {a.situacaoCanal && (
        <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[9px] font-semibold text-warning">
          {a.situacaoCanal}
        </span>
      )}
      {dividemEstoque > 1 && (
        <span
          title="No Mercado Livre estes anúncios são do mesmo produto e usam o mesmo estoque: vendeu em um, baixa em todos."
          className="rounded border border-dashed px-1.5 py-0.5 text-[9px] text-muted-foreground"
        >
          Estoque dividido com {dividemEstoque - 1}
        </span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Visibilidade, filtros e textos da linha                             */
/* ------------------------------------------------------------------ */


type FiltroPromocao = "todos" | "ativa" | "outro-valor" | "sem-promocao" | "alterados" | "subir-antes";

function passaNaPromocao(c: ContaDaLinha, filtro: FiltroPromocao): boolean {
  switch (filtro) {
    case "todos":
      return true;
    case "alterados":
      return c.envio === "alterado" || c.envio === "erro";
    case "subir-antes":
      // Desconto planejado que exige subir o preço cheio antes da promoção.
      return !!c.planoPromo && (c.planoCheio ?? 0) > c.cheioCanal + 0.005;
    default:
      return c.estadoPromocao === filtro;
  }
}

const ROTULO_ESTADO_PROMO: Record<ContaDaLinha["estadoPromocao"], string> = {
  ativa: "Ativa",
  "outro-valor": "Ativa em outro valor",
  "sem-promocao": "Sem promoção ativa",
  nenhuma: "Sem promoção",
};

function tempoAtras(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  return `em ${new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
}

const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : null;

/** Número editável na própria linha: mostra o valor; ao clicar, vira campo.
 * Cada tecla já recalcula a linha. */
function CampoValor({
  valor,
  aoMudar,
  casas = 2,
  placeholder,
  destaque,
  className,
  titulo,
}: {
  valor: number | null;
  aoMudar: (n: number | null) => void;
  casas?: number;
  placeholder?: string;
  /** contorno azul: é o campo que o seller digitou */
  destaque?: boolean;
  className?: string;
  titulo?: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const exibido = valor === null || !Number.isFinite(valor) ? "" : valor.toFixed(casas).replace(".", ",");
  return (
    <input
      inputMode="decimal"
      title={titulo}
      value={texto ?? exibido}
      placeholder={placeholder}
      onFocus={(e) => {
        setTexto(exibido);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setTexto(e.target.value);
        if (e.target.value.trim() === "") aoMudar(null);
        else {
          const n = lerNumero(e.target.value);
          if (n !== null) aoMudar(n);
        }
      }}
      onBlur={() => setTexto(null)}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={cn(
        "num h-7 w-[68px] rounded-md border border-input bg-background/60 px-1.5 text-right text-xs outline-none transition-colors hover:border-foreground/40 focus:border-ring focus:bg-background",
        destaque && "border-brand ring-1 ring-brand/40",
        className,
      )}
    />
  );
}

type PlanoEditavel = Pick<PrecoPlanejado, "precoCheio" | "descontoPercentual" | "precoPromocional" | "campoBase">;

function LinhaDoAnuncio({
  linha,
  cfg,
  aoSalvarAjuste,
  aoMudarPlano,
  aoLancar,
  aoAtualizar,
  atualizando,
  aoRepetir,
}: {
  /** Repete o que foi preenchido aqui nos outros anúncios do mesmo produto */
  aoRepetir?: () => void;
  linha: LinhaAnuncio;
  cfg: ConfigPrecificacao;
  aoSalvarAjuste: (ajuste: AjusteCusto, todosDoProduto: boolean) => Promise<boolean>;
  aoMudarPlano: (plano: PlanoEditavel | null) => void;
  aoLancar: () => void;
  aoAtualizar: () => void;
  atualizando: boolean;
}) {
  const { anuncio: a, comCmv, det: v, limites, margemMinima, ajuste, conta: c, plano } = linha;
  const base: CampoBasePreco | null = plano?.campoBase ?? null;
  const descGuardado = plano?.descontoPercentual ?? null;
  const [margemDigitada, setMargemDigitada] = useState<number | null>(null);
  const [margemImpossivel, setMargemImpossivel] = useState(false);
  const versaoCustos = useVersaoCustos();

  // Pede ao canal o frete/taxas nos preços novos (espera parar de digitar).
  useEffect(() => {
    const precos = [c.precoCalculo, c.planoPromo, c.planoCheio].filter(
      (x): x is number => typeof x === "number" && x > 0 && Math.abs(x - a.precoAtual) >= 0.005,
    );
    if (precos.length === 0) return;
    const t = setTimeout(() => precos.forEach((p) => pedirCustos(a.id, p)), 500);
    return () => clearTimeout(t);
  }, [a.id, a.precoAtual, c.precoCalculo, c.planoPromo, c.planoCheio]);

  const aplicarMargem = (m: number) => {
    const { preco } = precoPelaMargem(comCmv, m / 100, ajuste, cfg, (x) => custosEm(a.id, x));
    setMargemImpossivel(preco === null);
    if (preco === null) return;
    const novo: PlanoEditavel =
      c.desconto > 0
        ? { precoCheio: cheioDoPromo(preco, c.desconto), descontoPercentual: descGuardado, precoPromocional: preco, campoBase: "margem" }
        : { precoCheio: preco, descontoPercentual: descGuardado, precoPromocional: null, campoBase: "margem" };
    const igual =
      plano?.campoBase === "margem" &&
      Math.abs((plano.precoCheio ?? 0) - (novo.precoCheio ?? 0)) < 0.005 &&
      Math.abs((plano.precoPromocional ?? 0) - (novo.precoPromocional ?? 0)) < 0.005;
    if (!igual) aoMudarPlano(novo);
  };

  // Chegou o frete do canal no preço achado pela margem: refaz a conta.
  useEffect(() => {
    if (margemDigitada !== null && base === "margem") aplicarMargem(margemDigitada);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versaoCustos]);

  const mudarCheio = (n: number | null) => {
    setMargemDigitada(null);
    if (n === null || n <= 0) {
      aoMudarPlano(null);
      return;
    }
    aoMudarPlano({
      precoCheio: n,
      descontoPercentual: descGuardado,
      precoPromocional: c.desconto > 0 ? promoDoCheio(n, c.desconto) : null,
      campoBase: "cheio",
    });
  };

  const mudarDesconto = (n: number | null) => {
    const d = n ?? linha.descontoPadrao ?? 0;
    // O desconto SOBE o preço cheio: o promocional (o que o cliente paga)
    // fica e o cheio é calculado em cima dele (77,24 com 30% → 110,34).
    // Sem promocional digitado, a base é o que o cliente paga hoje.
    const promoBase =
      base === "promo" || base === "margem"
        ? (plano?.precoPromocional ?? plano?.precoCheio ?? c.precoCliente)
        : c.precoCliente;
    aoMudarPlano({
      precoCheio: cheioDoPromo(promoBase, d),
      descontoPercentual: n,
      precoPromocional: promoBase,
      campoBase: base === "margem" ? "margem" : "promo",
    });
  };

  const mudarPromo = (n: number | null) => {
    setMargemDigitada(null);
    if (n === null || n <= 0) {
      if (plano) aoMudarPlano({ precoCheio: plano.precoCheio, descontoPercentual: descGuardado, precoPromocional: null, campoBase: "cheio" });
      return;
    }
    // Sem o % ainda: guarda o promocional e espera o desconto pra calcular o
    // cheio (o cheio do canal não muda até lá).
    aoMudarPlano({
      precoCheio: c.desconto > 0 ? cheioDoPromo(n, c.desconto) : (plano?.precoCheio ?? c.cheioCanal),
      descontoPercentual: descGuardado,
      precoPromocional: n,
      campoBase: "promo",
    });
  };

  const mudarMargem = (n: number | null) => {
    if (n === null) return;
    setMargemDigitada(n);
    aplicarMargem(n);
  };

  /** Digitou o promocional sem desconto: o cheio só sobe quando tiver o %. */
  const faltaDesconto = base === "promo" && c.desconto <= 0;
  const sim = c.simulacao;
  const ponto = v.lucro < 0 ? "bg-loss" : v.margem < margemMinima ? "bg-warning" : "bg-profit";
  const corMargem = v.lucro < 0 ? "text-loss" : v.margem < margemMinima ? "text-warning" : "text-profit";
  const ativa = a.promocaoAtiva ?? null;
  const custosPendentes = sim && Math.abs(c.precoCalculo - a.precoAtual) >= 0.005 && custosEm(a.id, c.precoCalculo) === undefined;
  const textoPequeno = "mt-0.5 block text-[9px] leading-tight";

  // Comparação pequena embaixo do lucro e da margem.
  // A linha mostra o preço digitado; embaixo, o que acontece AGORA no canal.
  let comparacao: { rotulo: string; det: Detalhamento } | null = null;
  if (sim) comparacao = { rotulo: "agora", det: c.detAgora };

  const situacao = {
    alterado: { cor: "bg-brand", texto: "Mudou aqui, falta lançar no canal" },
    enviando: { cor: "bg-warning animate-pulse", texto: "Enviando ao canal..." },
    igual: { cor: "bg-profit", texto: plano?.enviadoEm ? `Igual ao canal (lançado em ${dataCurta(plano.enviadoEm)})` : "Igual ao canal" },
    erro: { cor: "bg-loss", texto: `O canal recusou: ${plano?.erroEnvio ?? "sem motivo"}` },
    "sem-plano": { cor: "bg-muted-foreground/30", texto: "Preço do canal (nada planejado aqui)" },
  }[c.envio];

  return (
    <tr className={cn("border-t-2 border-white/25 text-xs transition-colors hover:bg-muted/20 [.claro_&]:border-black/40", sim && "bg-brand/[0.03]")}>
      <td className="px-1 py-2">
        <div className="flex items-center gap-2 pl-2">
          {a.fotoUrl ? (
            <img src={a.fotoUrl} alt="" loading="lazy" className="size-12 shrink-0 rounded-md border bg-white object-contain" />
          ) : (
            <div className="size-12 shrink-0 rounded-md border bg-muted/40" />
          )}
        <div className="flex max-w-[160px] flex-wrap items-center gap-1">
          <span className={cn("size-1.5 shrink-0 rounded-full", ponto)} />
          <SeloMarketplace id={a.marketplaceId} />
          <span className="max-w-[90px] truncate text-[10px] text-muted-foreground" title={linha.nomeConta}>
            {linha.nomeConta}
          </span>
          <SelosTipoAnuncio anuncio={a} />
        </div>
        </div>
      </td>

      {/* Preço cheio: o que vai pro canal */}
      <td className="px-1 py-1.5 text-right align-top">
        <CampoValor
          valor={c.planoCheio ?? c.cheioCanal}
          aoMudar={mudarCheio}
          destaque={base === "cheio"}
          className={cn("font-semibold", (c.envio === "alterado" || c.envio === "erro") && COR_ALTERADO)}
          titulo="Preço cheio: é o que vai pro canal no botão Lançar"
        />
        {(c.envio === "alterado" || c.envio === "erro") && (
          <span className={cn(textoPequeno, "text-muted-foreground")}>no canal {formatBRL(c.cheioCanal)}</span>
        )}
      </td>

      {/* Desconto % */}
      <td className="px-1 py-1.5 text-right align-top">
        <span className="inline-flex items-center gap-1">
          <CampoValor
            valor={descGuardado}
            aoMudar={mudarDesconto}
            casas={0}
            placeholder={linha.descontoPadrao ? `${linha.descontoPadrao}` : "ex.: 30"}
            titulo={
              linha.descontoPadrao
                ? `Digite o desconto da promoção. Vazio = desconto padrão da conta (${linha.descontoPadrao}%)`
                : "Digite o desconto da promoção, em %"
            }
            destaque={faltaDesconto}
            className={cn("w-11", faltaDesconto && "border-loss ring-loss/40")}
          />
          <span className="text-[10px] text-muted-foreground">%</span>
        </span>
        {faltaDesconto ? (
          <span className={cn(textoPequeno, "font-semibold text-loss")}>digite o % do desconto</span>
        ) : c.descontoForaDoMl ? (
          <span className={cn(textoPequeno, "text-loss")}>
            ML: {DESCONTO_MIN_ML}% a {DESCONTO_MAX_ML}%
          </span>
        ) : c.descontoMaximo !== null ? (
          <span
            className={cn(textoPequeno, c.desconto > c.descontoMaximo ? "text-loss" : "text-muted-foreground")}
            title={`Maior desconto que ainda deixa a margem mínima da conta (${formatPercentual(margemMinima)})`}
          >
            até {c.descontoMaximo.toLocaleString("pt-BR")}%
          </span>
        ) : null}
      </td>

      {/* Preço promocional: o plano + a situação da promoção no canal */}
      <td className="px-1 py-1.5 text-right align-top">
        <div
          className={cn(
            "inline-block rounded-md border px-0.5 py-0.5 text-right",
            c.estadoPromocao === "ativa" && "border-profit/60 bg-profit/10",
            c.estadoPromocao === "outro-valor" && "border-warning/60 bg-warning/10",
            c.estadoPromocao === "sem-promocao" && "border-dashed border-loss/60",
            c.estadoPromocao === "nenhuma" && "border-transparent",
          )}
        >
          <CampoValor
            valor={
              c.planoPromo ?? (base === "promo" ? (plano?.precoPromocional ?? null) : null) ?? (ativa && !plano ? ativa.preco : null)
            }
            aoMudar={mudarPromo}
            placeholder="—"
            destaque={base === "promo"}
            className={cn(
              "font-semibold",
              c.estadoPromocao === "ativa" && "text-profit",
              c.estadoPromocao === "outro-valor" && "text-warning",
              c.estadoPromocao === "sem-promocao" && "text-loss",
            )}
            titulo="Preço promocional: digite o valor que você quer (ex.: 78,99). Com o desconto, o preço cheio sobe sozinho."
          />
          {c.estadoPromocao === "ativa" && ativa && (
            <span className={cn(textoPequeno, "max-w-[120px] truncate px-1 text-profit")} title={ativa.nome}>
              Ativa · {ativa.nome}
              {ativa.fim ? ` até ${dataCurta(ativa.fim)}` : ""}
            </span>
          )}
          {ativa?.rebate ? (
            <span
              className={cn(textoPequeno, "px-1 font-semibold text-profit")}
              title="Redução de tarifa que o Mercado Livre dá por venda nesta promoção. Já está somada no lucro."
            >
              ML devolve {formatBRL(ativa.rebate)}
            </span>
          ) : null}
          {c.estadoPromocao === "outro-valor" && ativa && (
            <span className={cn(textoPequeno, "max-w-[120px] px-1 text-warning")} title={ativa.nome}>
              Ativa a {formatBRL(ativa.preco)}
            </span>
          )}
          {c.estadoPromocao === "sem-promocao" && (
            <span className={cn(textoPequeno, "inline-flex items-center gap-0.5 px-1 font-semibold text-loss")}>
              <AlertTriangle className="size-2.5" /> Sem promoção
            </span>
          )}
        </div>
      </td>

      <td className="num px-1 py-2 text-right align-top text-muted-foreground">{formatBRL(v.cmv)}</td>
      <td
        className={cn("num px-1 py-2 text-right align-top", sim ? "text-brand" : "text-muted-foreground")}
        title={`${formatPercentual(v.preco > 0 ? v.comissao / v.preco : 0)} do preço`}
      >
        {formatBRL(v.comissao)}
      </td>
      <td className={cn("num px-1 py-2 text-right align-top", sim ? "text-brand" : "text-muted-foreground")}>
        {formatBRL(v.taxaFixa)}
      </td>
      <td
        className={cn("num px-1 py-2 text-right align-top", sim ? "text-brand" : "text-muted-foreground")}
        title={
          c.cruzou79
            ? `Passou da linha dos R$ ${LIMITE_FRETE_GRATIS_ML}: o frete muda (hoje ${formatBRL(c.detAgora.frete)}).`
            : "Frete que o canal cobra de você nesse preço"
        }
      >
        {custosPendentes ? <Loader2 className="ml-auto size-3 animate-spin" /> : formatBRL(v.frete)}
        {c.cruzou79 && (
          <span className={cn(textoPequeno, "font-semibold text-warning")}>
            {c.precoCalculo >= LIMITE_FRETE_GRATIS_ML ? "≥ R$ 79" : "< R$ 79"}
          </span>
        )}
      </td>
      <td className="px-1 py-2 text-right align-top">
        <PopoverAds anuncio={a} ajuste={ajuste} valorAtual={v.ads} aoSalvar={aoSalvarAjuste} />
      </td>
      <td className={cn("num px-1 py-2 text-right align-top", sim ? "text-brand" : "text-muted-foreground")}>
        {formatBRL(v.imposto)}
      </td>
      <td className="px-1 py-2 text-right align-top">
        <PopoverOutros det={v} ajuste={ajuste} aoSalvar={aoSalvarAjuste} />
      </td>
      <td className={cn("num px-1 py-2 text-right align-top font-bold", sim ? "text-brand" : v.lucro < 0 ? "text-loss" : "")}>
        {formatBRL(v.lucro)}
        {comparacao && (
          <span className={cn(textoPequeno, "font-normal text-muted-foreground")}>
            {comparacao.rotulo} {formatBRL(comparacao.det.lucro)}
          </span>
        )}
      </td>
      <td className="px-1 py-1.5 text-right align-top">
        <CampoValor
          valor={margemImpossivel ? null : v.margem * 100}
          aoMudar={mudarMargem}
          casas={1}
          placeholder="impossível"
          destaque={base === "margem"}
          className={cn("w-12 font-bold", sim ? "text-brand" : corMargem)}
          titulo="Digite a margem que você quer: o preço sai sozinho"
        />
        {comparacao && (
          <span className={cn(textoPequeno, "text-muted-foreground")}>
            {comparacao.rotulo} {formatPercentual(comparacao.det.margem)}
          </span>
        )}
      </td>
      <td
        className="num px-1 py-2 text-right align-top"
        title={`Margem mínima desta conta: ${formatPercentual(margemMinima)}`}
      >
        {limites.precoMinimo !== null ? formatBRL(limites.precoMinimo) : "—"}
      </td>
      <td className="num px-1 py-2 text-right align-top text-loss">
        {limites.precoEmpate !== null ? formatBRL(limites.precoEmpate) : "—"}
      </td>

      {/* Situação no canal + ações */}
      <td className="border-l px-2 py-1.5 align-top">
        <div className="flex items-center justify-end gap-1.5">
          <span className={cn("size-2.5 shrink-0 rounded-full", situacao.cor)} title={situacao.texto} />
          {(c.envio === "alterado" || c.envio === "erro") && a.marketplaceId !== "mercado-livre" && (
            <span className="text-[9px] text-muted-foreground" title="Por enquanto o lançamento automático é só no Mercado Livre">
              mude no canal
            </span>
          )}
          {podeLancar(linha) && (
            <Button
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={aoLancar}
              title="Sobe o preço cheio no Mercado Livre e coloca o anúncio na promoção com o preço promocional"
            >
              <Send className="size-3.5" />
              Lançar
            </Button>
          )}
          {c.envio === "enviando" && <Loader2 className="size-3.5 animate-spin text-warning" />}
          <button
            onClick={aoAtualizar}
            disabled={atualizando}
            title="Ler de novo este anúncio no canal (preço, taxas, frete e situação)"
            className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3.5", atualizando && "animate-spin")} />
          </button>
        </div>
        {(plano || aoRepetir) && (
          <div className="mt-1 flex items-center justify-end gap-1">
            {aoRepetir && (
              <button
                onClick={aoRepetir}
                title="Repetir este preço cheio, desconto e promocional nos outros anúncios deste produto"
                className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-brand hover:text-brand"
              >
                <Copy className="size-3" />
                Repetir
              </button>
            )}
            {plano && (c.envio === "alterado" || c.envio === "erro" || c.simulacao) && (
              <button
                onClick={() => aoMudarPlano(null)}
                title="Desfazer o que você mudou aqui e voltar ao preço que está no canal"
                className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground transition-colors hover:border-loss hover:text-loss"
              >
                <RotateCcw className="size-3" />
                Voltar
              </button>
            )}
          </div>
        )}
        {c.envio === "erro" && (
          <span className={cn(textoPequeno, "max-w-[160px] text-right text-loss")} title={plano?.erroEnvio ?? ""}>
            {(plano?.erroEnvio ?? "").slice(0, 60)}
          </span>
        )}
        {plano?.statusPromo === "erro" && c.estadoPromocao !== "ativa" && (
          <span className={cn(textoPequeno, "max-w-[160px] text-right text-loss")} title={plano.erroPromo ?? ""}>
            Promoção recusada: {(plano.erroPromo ?? "").slice(0, 50)}
          </span>
        )}
      </td>
    </tr>
  );
}

/** Desconto padrão por conta: com ele, o seller só digita o preço
 * promocional e o preço cheio sai sozinho. */
function PopoverDescontoPadrao({
  contas,
  valores,
  aoSalvar,
}: {
  contas: { id: string; nome: string }[];
  valores: Record<string, number>;
  aoSalvar: (contaId: string, valor: number | null) => Promise<void>;
}) {
  const [aberto, setAberto] = useState(false);
  const [textos, setTextos] = useState<Record<string, string>>({});
  if (contas.length === 0) return null;
  const algum = contas.some((c) => valores[c.id] !== undefined);
  return (
    <Popover
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) setTextos(Object.fromEntries(contas.map((c) => [c.id, valores[c.id] !== undefined ? String(valores[c.id]) : ""])));
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          Desconto padrão
          {algum && contas.length === 1 && `: ${valores[contas[0]!.id]}%`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <p className="text-[11px] text-muted-foreground">
          Com um desconto padrão, em cada anúncio você só digita o preço promocional e o preço cheio sai sozinho
          (ex.: 30% → R$ 78,99 vira cheio de R$ 112,84). Dá pra mudar o % em cada linha. O Mercado Livre aceita de{" "}
          {DESCONTO_MIN_ML}% a {DESCONTO_MAX_ML}%.
        </p>
        {contas.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs">{c.nome}</span>
            <Input
              inputMode="decimal"
              value={textos[c.id] ?? ""}
              onChange={(e) => setTextos((t) => ({ ...t, [c.id]: e.target.value }))}
              placeholder="30"
              className="num h-8 w-16 text-right text-xs"
            />
            <span className="text-xs text-muted-foreground">%</span>
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px]"
              onClick={async () => {
                const t = (textos[c.id] ?? "").trim();
                const n = t === "" ? null : lerNumero(t);
                if (t !== "" && (n === null || n < 0 || n >= 100)) {
                  toast.error("Digite um desconto entre 0 e 99.");
                  return;
                }
                await aoSalvar(c.id, n);
              }}
            >
              Salvar
            </Button>
          </div>
        ))}
      </PopoverContent>
    </Popover>
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

/* ------------------------------------------------------------------ */
/* Taxa fixa e frete por faixa de preço                                */
/* ------------------------------------------------------------------ */

/** Referência do Mercado Livre (tabelas de mercado de 2026 — confira no
 * seu painel em "Custos de vender"): abaixo de R$ 79 entra o custo fixo
 * por unidade e o frete grátis não é seu; de R$ 79 pra cima o custo fixo
 * some e o frete fica o do anúncio. */
const REFERENCIA_MERCADO_LIVRE: FaixaPreco[] = [
  { ate: 28.99, taxaFixa: 6.25, frete: 0 },
  { ate: 49.99, taxaFixa: 6.5, frete: 0 },
  { ate: 78.99, taxaFixa: 6.75, frete: 0 },
  { ate: null, taxaFixa: 0, frete: null },
];

interface FaixaEditavel {
  ate: string;
  taxaFixa: string;
  frete: string;
}

const paraTexto = (n: number | null) => (n === null ? "" : n.toFixed(2).replace(".", ","));

function DialogFaixas({
  faixas,
  aoFechar,
  aoSalvar,
}: {
  faixas: FaixasPorCanal;
  aoFechar: () => void;
  aoSalvar: (marketplaceId: MarketplaceId, faixas: FaixaPreco[]) => Promise<boolean>;
}) {
  const canais = OPCOES_MARKETPLACE.filter((o) => o.id !== "todos") as { id: MarketplaceId; nome: string }[];
  const [canal, setCanal] = useState<MarketplaceId>("mercado-livre");
  const [linhas, setLinhas] = useState<FaixaEditavel[]>([]);
  const [salvando, setSalvando] = useState(false);

  // Troca de canal → carrega as faixas salvas dele.
  useEffect(() => {
    const salvas = faixas[canal as MarketplaceId] ?? [];
    setLinhas(
      salvas.map((f) => ({ ate: paraTexto(f.ate), taxaFixa: paraTexto(f.taxaFixa), frete: paraTexto(f.frete) })),
    );
  }, [canal, faixas]);

  const mudar = (i: number, campo: keyof FaixaEditavel, valor: string) =>
    setLinhas((atual) => atual.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));

  const usarReferencia = () =>
    setLinhas(
      REFERENCIA_MERCADO_LIVRE.map((f) => ({
        ate: paraTexto(f.ate),
        taxaFixa: paraTexto(f.taxaFixa),
        frete: paraTexto(f.frete),
      })),
    );

  const salvar = async () => {
    // Converte, ordena pelo "até" e garante que a última faixa vai até o infinito.
    const convertidas: FaixaPreco[] = linhas
      .map((l, i) => ({
        ate: i === linhas.length - 1 ? null : lerNumero(l.ate),
        taxaFixa: l.taxaFixa.trim() ? lerNumero(l.taxaFixa) : null,
        frete: l.frete.trim() ? lerNumero(l.frete) : null,
      }))
      .sort((x, y) => (x.ate ?? Infinity) - (y.ate ?? Infinity));
    if (convertidas.slice(0, -1).some((f) => f.ate === null || f.ate <= 0)) {
      toast.error("Preencha o \"até R$\" de todas as faixas, menos a última.");
      return;
    }
    setSalvando(true);
    const ok = await aoSalvar(canal, convertidas);
    setSalvando(false);
    if (ok) aoFechar();
  };

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Taxa fixa e frete por faixa de preço</DialogTitle>
          <DialogDescription>
            Quando o preço novo cruza pra outra faixa, a Precificação usa a taxa fixa e o frete
            daquela faixa. Na mesma faixa do preço de hoje, valem os valores do próprio anúncio.
            Campo vazio = usa o valor do anúncio. Quando a API conectar, o marketplace informa os
            valores exatos e esta tabela deixa de ser necessária.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={canal} onValueChange={(v) => setCanal(v as MarketplaceId)}>
              <SelectTrigger className="h-8 w-48 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {canais.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                    {faixas[c.id]?.length ? " ✓" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canal === "mercado-livre" && (
              <Button size="sm" variant="outline" className="h-8 text-[11px]" onClick={usarReferencia}>
                Preencher com a referência do Mercado Livre
              </Button>
            )}
          </div>

          {linhas.length === 0 ? (
            <p className="rounded-md bg-muted/50 px-3 py-4 text-center text-xs text-muted-foreground">
              Sem faixas neste canal: a taxa fixa e o frete ficam sempre os do anúncio.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-1.5 text-left font-semibold">Preço</th>
                  <th className="py-1.5 text-left font-semibold">Taxa fixa (R$)</th>
                  <th className="py-1.5 text-left font-semibold">Frete (R$)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => {
                  const ultima = i === linhas.length - 1;
                  const anterior = i > 0 ? linhas[i - 1]!.ate : "";
                  return (
                    <tr key={i} className="border-t">
                      <td className="py-1.5 pr-2">
                        {ultima ? (
                          <span className="text-muted-foreground">
                            {anterior ? `Acima de R$ ${anterior}` : "Qualquer preço"}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span className="text-muted-foreground">Até R$</span>
                            <Input
                              inputMode="decimal"
                              value={l.ate}
                              onChange={(e) => mudar(i, "ate", e.target.value)}
                              className="num h-7 w-24 px-2 text-right text-xs"
                            />
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          inputMode="decimal"
                          value={l.taxaFixa}
                          onChange={(e) => mudar(i, "taxaFixa", e.target.value)}
                          placeholder="do anúncio"
                          className="num h-7 w-28 px-2 text-right text-xs"
                        />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input
                          inputMode="decimal"
                          value={l.frete}
                          onChange={(e) => mudar(i, "frete", e.target.value)}
                          placeholder="do anúncio"
                          className="num h-7 w-28 px-2 text-right text-xs"
                        />
                      </td>
                      <td className="py-1.5 text-right">
                        <button
                          onClick={() => setLinhas((atual) => atual.filter((_, j) => j !== i))}
                          className="text-muted-foreground hover:text-loss"
                          title="Tirar esta faixa"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px]"
            onClick={() => setLinhas((atual) => [{ ate: "", taxaFixa: "", frete: "" }, ...atual])}
          >
            + Adicionar faixa
          </Button>
          {canal === "mercado-livre" && (
            <p className="text-[10px] leading-relaxed text-muted-foreground">
              A referência usa valores de tabelas de mercado de 2026. O Mercado Livre muda esses
              valores de tempos em tempos e eles podem variar por conta e categoria — confira em
              "Custos de vender" no seu painel e corrija aqui.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar} disabled={salvando}>
            Cancelar
          </Button>
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Salvar faixas do canal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Aba Geral: cada produto com todos os canais lado a lado             */
/* ------------------------------------------------------------------ */

function TabelaGeral({
  grupos,
  canais,
  aoAbrirCanal,
}: {
  grupos: GrupoProduto[];
  canais: MarketplaceId[];
  aoAbrirCanal: (id: MarketplaceId) => void;
}) {
  const faixa = (valores: number[], fmt: (n: number) => string) => {
    if (valores.length === 0) return "—";
    const min = Math.min(...valores);
    const max = Math.max(...valores);
    return Math.abs(max - min) < 0.005 ? fmt(min) : `${fmt(min)} a ${fmt(max)}`;
  };
  return (
    <div className="w-full border-b">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b bg-muted/50 text-[9px] uppercase tracking-wide text-muted-foreground">
            <th className="px-1.5 py-2.5 font-bold">Produto</th>
            <th className="px-2 py-2.5 text-right font-bold">CMV</th>
            {canais.map((c) => (
              <th key={c} className="border-l px-2 py-2.5 text-center font-bold" colSpan={3}>
                <button onClick={() => aoAbrirCanal(c)} className="hover:text-foreground" title="Abrir a aba deste canal">
                  {getMarketplace(c).nome}
                </button>
              </th>
            ))}
          </tr>
          <tr className="border-b text-[9px] uppercase tracking-wide text-muted-foreground">
            <th />
            <th />
            {canais.map((c) => (
              <Fragment key={c}>
                <th className="border-l px-2 py-1 text-right font-semibold">Cliente paga</th>
                <th className="px-2 py-1 text-right font-semibold">Margem</th>
                <th className="px-2 py-1 text-center font-semibold">Promoção</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => (
            <tr key={g.produto.id} className="border-t border-border/40 text-xs hover:bg-muted/20">
              <td className="max-w-[320px] px-1.5 py-2"><div className="flex items-center gap-2"><FotoAnuncio sku={g.produto.sku} /><div className="min-w-0">
                <p className="truncate font-medium" title={g.produto.nome}>
                  {g.produto.nome}
                </p>
                <p className="num text-[10px] text-muted-foreground">SKU {g.produto.sku}</p>
              </div></div></td>
              <td className="num px-2 py-2 text-right">{formatBRL(g.produto.cmv)}</td>
              {canais.map((c) => {
                const ls = g.linhas.filter((l) => l.anuncio.marketplaceId === c);
                // O que acontece de verdade no canal (sem a simulação).
                const reais = ls.map((l) => (l.conta.simulacao ? l.conta.detAgora : l.conta.det));
                const piorMargem = reais.length ? Math.min(...reais.map((d) => d.margem)) : null;
                const minima = ls[0]?.margemMinima ?? 0;
                const estados = new Set(ls.map((l) => l.conta.estadoPromocao));
                return (
                  <Fragment key={c}>
                    <td className="num border-l px-2 py-2 text-right">
                      {faixa(
                        ls.map((l) => l.conta.precoCliente),
                        formatBRL,
                      )}
                    </td>
                    <td
                      className={cn(
                        "num px-2 py-2 text-right font-bold",
                        piorMargem === null
                          ? "text-muted-foreground"
                          : piorMargem < 0
                            ? "text-loss"
                            : piorMargem < minima
                              ? "text-warning"
                              : "text-profit",
                      )}
                    >
                      {faixa(
                        reais.map((d) => d.margem),
                        (n) => formatPercentual(n),
                      )}
                    </td>
                    <td className="px-2 py-2 text-center">
                      {ls.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">sem anúncio</span>
                      ) : estados.has("sem-promocao") ? (
                        <span className="rounded bg-loss-soft px-1.5 py-0.5 text-[10px] font-semibold text-loss">Sem promoção</span>
                      ) : estados.has("outro-valor") ? (
                        <span className="rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold text-warning">Outro valor</span>
                      ) : estados.has("ativa") ? (
                        <span className="rounded bg-profit-soft px-1.5 py-0.5 text-[10px] font-semibold text-profit">Ativa</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">—</span>
                      )}
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
          {grupos.length === 0 && (
            <tr>
              <td colSpan={2 + canais.length * 3} className="px-2 py-10 text-center text-xs text-muted-foreground">
                Nenhum produto com esses filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[10px] text-muted-foreground">
        A aba Geral mostra o que está valendo em cada canal agora (o que o cliente paga e a margem real). Para mudar
        preço e lançar, abra a aba do canal.
      </p>
    </div>
  );
}

/** Dá pra lançar: mudou o preço cheio (ou o canal recusou), ou tem promoção
 * planejada que ainda não está valendo. Por enquanto, só no Mercado Livre. */
function podeLancar(l: LinhaAnuncio): boolean {
  if (l.anuncio.marketplaceId !== "mercado-livre" || l.conta.envio === "enviando") return false;
  if ((l.conta.envio === "alterado" || l.conta.envio === "erro") && l.conta.planoCheio) return true;
  return l.conta.estadoPromocao === "sem-promocao" && !!l.conta.planoPromo;
}

/** Desconto individual do ML: de 5% a 80%, até 14 dias. Sua promoção: 10% a 70%. */
const FAIXA_INDIVIDUAL = [5, 80] as const;
const FAIXA_CAMPANHA = [10, 70] as const;

type EscolhaPromocao = { tipo: "PRICE_DISCOUNT" | "SELLER_CAMPAIGN"; idPromocao?: string; nome: string; fim: string | null };

/** Como lançar: as duas etapas juntas, ou uma de cada vez. */
type ModoLancamento = "tudo" | "preco" | "promo";

/** Precisa subir o preço cheio no canal antes de entrar na promoção. */
function precisaSubirAntes(l: LinhaAnuncio): boolean {
  return !!l.conta.planoPromo && (l.conta.planoCheio ?? 0) > l.conta.cheioCanal + 0.005;
}

/**
 * Lançar em duas etapas, nesta ordem:
 *   1) SOBE O PREÇO CHEIO no Mercado Livre;
 *   2) SOBE A PROMOÇÃO: o anúncio entra na promoção com o preço promocional.
 * Dá pra fazer as duas juntas ou uma de cada vez (ex.: subir o preço hoje e
 * a promoção depois).
 */
function DialogLancar({
  linhas,
  criadas,
  aoFechar,
  aoLancar,
}: {
  linhas: LinhaAnuncio[];
  criadas: PromocaoCriada[];
  aoFechar: () => void;
  aoLancar: (promocao: EscolhaPromocao | null, modo: ModoLancamento) => void;
}) {
  const comPromo = linhas.filter((l) => l.conta.planoPromo);
  const sobem = linhas.filter((l) => Math.abs((l.conta.planoCheio ?? l.conta.cheioCanal) - l.conta.cheioCanal) >= 0.005);
  const subirAntes = linhas.filter(precisaSubirAntes);
  const descontos = comPromo.map((l) => l.conta.desconto);
  const dentro = (f: readonly [number, number]) => descontos.every((d) => d >= f[0] && d <= f[1]);
  const contas = new Set(linhas.map((l) => l.anuncio.contaId));
  const campanhas = criadas.filter(
    (c) => c.status === "criada" && c.idPromocao && c.statusCanal !== "finished" && c.contaId && contas.size === 1 && contas.has(c.contaId),
  );
  const fimIndividual = new Date(Date.now() + 13 * 86400000).toISOString();
  type Opcao = { id: string; titulo: string; detalhe: string; valida: boolean; escolha: EscolhaPromocao };
  const opcoes: Opcao[] = [];
  for (const c of campanhas) {
    opcoes.push({
      id: c.id,
      titulo: `Sua promoção "${c.nome}"`,
      detalhe: `até ${c.fim ? new Date(`${c.fim}T12:00:00`).toLocaleDateString("pt-BR") : "—"} · aceita de ${FAIXA_CAMPANHA[0]}% a ${FAIXA_CAMPANHA[1]}%`,
      valida: dentro(FAIXA_CAMPANHA),
      escolha: { tipo: "SELLER_CAMPAIGN", idPromocao: c.idPromocao!, nome: c.nome, fim: c.fim },
    });
  }
  opcoes.push({
    id: "individual",
    titulo: "Desconto individual do anúncio",
    detalhe: `14 dias (até ${new Date(fimIndividual).toLocaleDateString("pt-BR")}) · aceita de ${FAIXA_INDIVIDUAL[0]}% a ${FAIXA_INDIVIDUAL[1]}%`,
    valida: dentro(FAIXA_INDIVIDUAL),
    escolha: { tipo: "PRICE_DISCOUNT", nome: "Desconto individual", fim: fimIndividual },
  });

  // Sem preço pra subir: só a etapa 2. Sem promoção planejada: só a etapa 1.
  const modoInicial: ModoLancamento = comPromo.length === 0 ? "preco" : sobem.length === 0 ? "promo" : "tudo";
  const [modo, setModo] = useState<ModoLancamento>(modoInicial);
  const [escolhida, setEscolhida] = useState<string>(() => opcoes.find((o) => o.valida)?.id ?? "individual");
  const opcao = opcoes.find((o) => o.id === escolhida) ?? opcoes[opcoes.length - 1]!;
  const fazPreco = modo !== "promo";
  const fazPromo = modo !== "preco" && comPromo.length > 0;
  const saemDaPromocao = linhas.filter((l) => l.anuncio.promocaoAtiva && (l.conta.planoCheio ?? 0) > l.conta.cheioCanal).length;
  const podeConfirmar = (!fazPromo || opcao.valida) && (fazPreco ? sobem.length > 0 || fazPromo : comPromo.length > 0);

  const ModoBotao = ({ id, titulo, detalhe, desligado }: { id: ModoLancamento; titulo: string; detalhe: string; desligado?: boolean }) => (
    <button
      disabled={desligado}
      onClick={() => setModo(id)}
      className={cn(
        "flex w-full items-start gap-2 rounded-md border p-2 text-left text-xs transition-colors disabled:opacity-40",
        modo === id ? "border-brand bg-brand/5" : "hover:bg-muted/40",
      )}
    >
      <span className={cn("mt-0.5 size-3 shrink-0 rounded-full border", modo === id ? "border-brand bg-brand" : "border-muted-foreground/50")} />
      <span>
        <span className="block font-semibold">{titulo}</span>
        <span className="block text-[10px] text-muted-foreground">{detalhe}</span>
      </span>
    </button>
  );

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Lançar {linhas.length} anúncio{linhas.length > 1 ? "s" : ""} no Mercado Livre
          </DialogTitle>
          <DialogDescription>
            São duas etapas, sempre nesta ordem: <strong>1º sobe o preço cheio</strong>, <strong>2º sobe a promoção</strong>.
          </DialogDescription>
        </DialogHeader>

        {subirAntes.length > 0 && (
          <div className="flex gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-[11px] text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            <span>
              <strong>Atenção:</strong> pra dar o desconto planejado, {subirAntes.length} anúncio
              {subirAntes.length > 1 ? "s precisam" : " precisa"} <strong>SUBIR O PREÇO</strong> primeiro e só depois{" "}
              <strong>SUBIR A PROMOÇÃO</strong>. Se a promoção entrar antes, o desconto sai em cima do preço antigo.
            </span>
          </div>
        )}

        {/* Etapa 1 */}
        <div className={cn("space-y-1.5 rounded-md border p-2.5", !fazPreco && "opacity-50")}>
          <p className="flex items-center gap-2 text-xs font-bold">
            <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[10px] text-white">1</span>
            Subir o preço cheio
            <span className="font-normal text-muted-foreground">
              {sobem.length > 0 ? `${sobem.length} anúncio(s) mudam de preço` : "nenhum preço cheio pra mudar"}
            </span>
          </p>
          <div className="max-h-32 space-y-1 overflow-y-auto text-[11px]">
            {linhas.slice(0, 20).map((l) => (
              <div key={l.anuncio.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{l.anuncio.produto}</span>
                <span className="num text-muted-foreground">{formatBRL(l.conta.cheioCanal)}</span>
                <span>→</span>
                <span className="num font-semibold">{formatBRL(l.conta.planoCheio ?? l.conta.cheioCanal)}</span>
              </div>
            ))}
            {linhas.length > 20 && <p className="text-muted-foreground">e mais {linhas.length - 20}...</p>}
          </div>
        </div>

        {/* Etapa 2 */}
        <div className={cn("space-y-1.5 rounded-md border p-2.5", !fazPromo && "opacity-50")}>
          <p className="flex items-center gap-2 text-xs font-bold">
            <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[10px] text-white">2</span>
            Subir a promoção
            <span className="font-normal text-muted-foreground">
              {comPromo.length > 0 ? `${comPromo.length} anúncio(s) com preço promocional` : "nenhuma promoção planejada"}
            </span>
          </p>
          {comPromo.length > 0 && (
            <>
              <div className="max-h-24 space-y-1 overflow-y-auto text-[11px]">
                {comPromo.slice(0, 20).map((l) => (
                  <div key={l.anuncio.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{l.anuncio.produto}</span>
                    <span className="num text-profit">
                      {formatBRL(l.conta.planoPromo ?? 0)} ({formatNumero(l.conta.desconto)}% off)
                    </span>
                  </div>
                ))}
              </div>
              <p className="pt-1 text-[11px] font-semibold">Em qual promoção entrar?</p>
              {opcoes.map((o) => (
                <button
                  key={o.id}
                  disabled={!o.valida || !fazPromo}
                  onClick={() => setEscolhida(o.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md border p-2 text-left text-xs transition-colors disabled:opacity-50",
                    escolhida === o.id ? "border-brand bg-brand/5" : "hover:bg-muted/40",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 size-3 shrink-0 rounded-full border",
                      escolhida === o.id ? "border-brand bg-brand" : "border-muted-foreground/50",
                    )}
                  />
                  <span>
                    <span className="block font-semibold">{o.titulo}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {o.detalhe}
                      {!o.valida && " — o desconto planejado está fora dessa faixa"}
                    </span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* O que fazer agora */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold">O que fazer agora?</p>
          <ModoBotao
            id="tudo"
            titulo="As duas etapas: sobe o preço e logo depois sobe a promoção"
            detalhe="O mais comum. Se o Mercado Livre recusar a promoção, o preço novo fica e o motivo aparece na linha."
            desligado={comPromo.length === 0 || sobem.length === 0}
          />
          <ModoBotao
            id="preco"
            titulo="Só a etapa 1: subir o preço cheio agora"
            detalhe="A promoção você sobe depois (a linha fica com o aviso “sem promoção” até lá)."
            desligado={sobem.length === 0}
          />
          <ModoBotao
            id="promo"
            titulo="Só a etapa 2: subir a promoção"
            detalhe={
              subirAntes.length > 0
                ? "Cuidado: o preço cheio ainda não subiu no canal — faça a etapa 1 antes."
                : "O preço cheio já está certo no canal."
            }
            desligado={comPromo.length === 0}
          />
        </div>

        {fazPreco && saemDaPromocao > 0 && (
          <p className="rounded-md bg-warning/10 px-3 py-2 text-[11px] text-warning">
            {saemDaPromocao} anúncio(s) estão em promoção agora: pela regra do Mercado Livre, subir o preço cheio tira a
            promoção atual{fazPromo ? " (a nova entra logo em seguida)" : ""}.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button disabled={!podeConfirmar} onClick={() => aoLancar(fazPromo ? opcao.escolha : null, modo)}>
            <Send className="size-3.5" />
            {modo === "tudo" ? "Subir o preço e a promoção" : modo === "preco" ? "Subir só o preço" : "Subir só a promoção"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
