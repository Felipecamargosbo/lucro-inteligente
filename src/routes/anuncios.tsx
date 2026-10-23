import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { ImageDown, Link2, Loader2, RefreshCw, Search, Upload } from "lucide-react";
import {
  anunciosService,
  atualizarAnunciosDoCanal,
  obterContasReais,
  produtosService,
  vendasService,
} from "@/services";
import { tiktokService } from "@/services/tiktok";
import { shopeeService } from "@/services/shopee";
import { useAuth } from "@/context/auth";
import { CANAIS } from "@/config/navegacao";
import { formatBRL, formatNumero } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { CabecalhoOrdenavel, ordenarPor, useOrdem } from "@/components/comum/CabecalhoOrdenavel";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { DialogImportarProdutos } from "@/components/anuncios/DialogImportarProdutos";
import { DialogFotoProduto } from "@/components/anuncios/DialogFotoProduto";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Anuncio, MarketplaceId, Produto } from "@/types";

export const Route = createFileRoute("/anuncios")({
  head: () => ({
    meta: [
      { title: "Anúncios por canal | Planeta97" },
      {
        name: "description",
        content: "Veja em quais marketplaces cada produto está anunciado e onde ainda falta anunciar.",
      },
    ],
  }),
  component: Anuncios,
});

/** SKU comparável: sem espaços nas pontas e sem diferença de maiúscula. */
const chaveSku = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();

const nomeCanal = (id: MarketplaceId) => CANAIS.find((c) => c.id === id)?.titulo ?? id;
/** "no Mercado Livre", "na Shopee"... */
const noCanal = (id: MarketplaceId) =>
  `${id === "mercado-livre" || id === "tiktok-shop" ? "no" : "na"} ${nomeCanal(id)}`;

/** Ordem de preferência da foto automática. */
const ORDEM_FOTO: MarketplaceId[] = ["mercado-livre", "shopee", "tiktok-shop", "amazon", "magalu", "shein"];

type LinhaProduto = {
  produto: Produto;
  anuncios: Anuncio[];
  canais: Set<MarketplaceId>;
  /** Maior estoque entre os anúncios (o mesmo estoque físico aparece em cada canal). */
  estoque: number | null;
  foto: string | null;
  vendas30: number;
};

type ChaveOrdem = "produto" | "cmv" | "estoque" | "vendas" | "canais";

type Filtro = "todos" | "sem-canal" | `falta:${MarketplaceId}`;

const LIMITE_PAGINA = 200;

function Anuncios() {
  const { sessao } = useAuth();
  const perfilId = sessao?.user.id ?? "";
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [versao, setVersao] = useState(0);
  // Os anúncios ficam em memória; mudar um vínculo mexe neles direto, e este
  // número força a tela a refazer as contas.
  const [mudancas] = useState(0);
  const [aba, setAba] = useState<"todos" | MarketplaceId>("todos");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(LIMITE_PAGINA);
  const [atualizando, setAtualizando] = useState<string | null>(null);
  const [importar, setImportar] = useState(false);
  const [fotoDe, setFotoDe] = useState<LinhaProduto | null>(null);
  const [verSemProduto, setVerSemProduto] = useState(false);

  const recarregarProdutos = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    if (!perfilId) return;
    let ativo = true;
    produtosService.listar(perfilId).then((lista) => {
      if (!ativo) return;
      produtosService.reconciliarComAnuncios(lista);
      setProdutos(lista);
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, [perfilId, versao]);

  const anuncios = anunciosService.listar();

  // Canais com conta realmente conectada ou com anúncio (na ordem do menu).
  const canais = useMemo(() => {
    const conectados = new Set(obterContasReais().filter((c) => c.conectada).map((c) => c.marketplaceId));
    for (const a of anuncios) conectados.add(a.marketplaceId);
    return CANAIS.map((c) => c.id).filter((id) => conectados.has(id));
  }, [anuncios]);

  // --- vínculo de cada anúncio --------------------------------------------
  const { linhas, semProduto, produtoDoAnuncio } = useMemo(() => {
    const porSku = new Map(produtos.map((p) => [chaveSku(p.sku), p]));
    const produtoDoAnuncio = new Map<string, Produto>();
    const grupos = new Map<string, Anuncio[]>();
    const semProduto: Anuncio[] = [];
    for (const a of anuncios) {
      // Vínculo só pelo SKU: SKU errado se corrige no anúncio, não aqui.
      const p = porSku.get(chaveSku(a.sku));
      if (!p) {
        semProduto.push(a);
        continue;
      }
      produtoDoAnuncio.set(a.id, p);
      const g = grupos.get(p.id) ?? [];
      g.push(a);
      grupos.set(p.id, g);
    }

    // Unidades vendidas nos últimos 30 dias, por produto.
    const limite30 = Date.now() - 30 * 86400000;
    const anuncioPorId = new Map(anuncios.map((a) => [a.id, a]));
    const vendas = new Map<string, number>();
    for (const v of vendasService.listar()) {
      if (v.status === "cancelado" || new Date(v.data).getTime() < limite30) continue;
      const a = v.anuncioId ? anuncioPorId.get(v.anuncioId) : undefined;
      const p = (a ? produtoDoAnuncio.get(a.id) : undefined) ?? porSku.get(chaveSku(v.sku));
      if (p) vendas.set(p.id, (vendas.get(p.id) ?? 0) + (v.quantidade || 0));
    }

    const linhas: LinhaProduto[] = produtos.map((p) => {
      const lista = grupos.get(p.id) ?? [];
      const estoques = lista.map((a) => a.estoque).filter((e): e is number => typeof e === "number");
      const ordenados = [...lista].sort(
        (x, y) => ORDEM_FOTO.indexOf(x.marketplaceId) - ORDEM_FOTO.indexOf(y.marketplaceId),
      );
      return {
        produto: p,
        anuncios: lista,
        canais: new Set(lista.map((a) => a.marketplaceId)),
        estoque: estoques.length ? Math.max(...estoques) : null,
        foto: p.fotoUrl ?? ordenados.find((a) => a.fotoUrl)?.fotoUrl ?? null,
        vendas30: vendas.get(p.id) ?? 0,
      };
    });
    return { linhas, semProduto, produtoDoAnuncio };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, anuncios, mudancas]);

  const linhaPorProduto = useMemo(() => new Map(linhas.map((l) => [l.produto.id, l])), [linhas]);

  // --- resumo ---------------------------------------------------------------
  const resumo = useMemo(() => {
    const porCanal = new Map<MarketplaceId, number>();
    let semCanal = 0;
    for (const l of linhas) {
      if (l.canais.size === 0) semCanal++;
      for (const c of l.canais) porCanal.set(c, (porCanal.get(c) ?? 0) + 1);
    }
    return { porCanal, semCanal };
  }, [linhas]);

  // --- filtros --------------------------------------------------------------
  const termo = busca.trim().toLowerCase();
  const confere = (texto: string, sku: string) =>
    !termo || texto.toLowerCase().includes(termo) || sku.toLowerCase().includes(termo);

  const { ordem, alternar } = useOrdem<ChaveOrdem>();

  const linhasFiltradas = useMemo(() => {
    let lista = linhas.filter((l) => confere(l.produto.nome, l.produto.sku));
    if (filtro === "sem-canal") lista = lista.filter((l) => l.canais.size === 0);
    else if (filtro.startsWith("falta:")) {
      const canal = filtro.slice(6) as MarketplaceId;
      lista = lista.filter((l) => !l.canais.has(canal));
    }
    // Mais vendidos primeiro: é onde subir num canal novo rende mais.
    const padrao = [...lista].sort((x, y) => y.vendas30 - x.vendas30 || x.produto.nome.localeCompare(y.produto.nome));
    return ordenarPor(padrao, ordem, (l, k) => {
      switch (k) {
        case "produto":
          return l.produto.nome;
        case "cmv":
          return l.produto.cmv > 0 ? l.produto.cmv : null;
        case "estoque":
          return l.estoque;
        case "vendas":
          return l.vendas30;
        case "canais":
          return l.canais.size;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linhas, filtro, termo, ordem]);

  const anunciosDaAba = useMemo(() => {
    if (aba === "todos") return [];
    return anuncios
      .filter((a) => a.marketplaceId === aba && confere(a.produto, a.sku))
      .sort((x, y) => (y.unidadesVendidas ?? 0) - (x.unidadesVendidas ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anuncios, aba, termo, mudancas]);

  useEffect(() => setLimite(LIMITE_PAGINA), [aba, filtro, termo]);

  // --- atualizar no canal ---------------------------------------------------
  /** Relê os canais. `idsMl` vazio = todos os anúncios do Mercado Livre. */
  const lerCanais = async (chave: string, idsMl: string[]) => {
    setAtualizando(chave);
    const tarefas: Promise<{ erro: string | null; resumo: string }>[] = [];
    if (canais.includes("mercado-livre")) tarefas.push(atualizarAnunciosDoCanal(idsMl));
    if (canais.includes("tiktok-shop")) tarefas.push(tiktokService.sincronizar());
    if (canais.includes("shopee")) tarefas.push(shopeeService.sincronizar());
    const resultados = await Promise.all(tarefas);
    setAtualizando(null);
    const erros = resultados.filter((r) => r.erro).map((r) => r.erro);
    if (erros.length) toast.error(erros.join(" · "));
    else toast.success("Canais lidos de novo.", { description: "Recarregando os vínculos..." });
    window.dispatchEvent(new Event("nexo:dados-reais"));
  };

  const atualizarTudo = () => lerCanais("topo", []);
  const atualizarProduto = (l: LinhaProduto) => {
    const idsMl = l.anuncios
      .filter((a) => a.marketplaceId === "mercado-livre" && a.idExterno)
      .map((a) => a.idExterno as string);
    // Sem anúncio no ML ainda, lê o ML inteiro (pra achar o anúncio novo).
    return lerCanais(l.produto.id, idsMl);
  };

  // --- fotos ----------------------------------------------------------------
  const puxarFotosDe = async (canal: MarketplaceId) => {
    const itens = linhas
      .map((l) => ({ id: l.produto.id, foto: l.anuncios.find((a) => a.marketplaceId === canal && a.fotoUrl)?.fotoUrl ?? null }))
      .filter((i): i is { id: string; foto: string } => Boolean(i.foto));
    if (!itens.length) {
      toast.error(`Nenhum produto tem anúncio com foto em ${nomeCanal(canal)}.`);
      return;
    }
    setAtualizando("fotos");
    const erro = await produtosService.definirFotos(itens);
    setAtualizando(null);
    if (erro) {
      toast.error(`Não consegui gravar as fotos: ${erro}`);
      return;
    }
    toast.success(`${formatNumero(itens.length)} foto(s) puxada(s) de ${nomeCanal(canal)}.`);
    recarregarProdutos();
  };

  const soltarFoto = async (l: LinhaProduto, e: DragEvent) => {
    e.preventDefault();
    const arquivo = e.dataTransfer.files?.[0];
    if (!arquivo || !perfilId) return;
    setAtualizando(`foto:${l.produto.id}`);
    const { erro } = await produtosService.enviarFoto(perfilId, l.produto.id, arquivo);
    setAtualizando(null);
    if (erro) toast.error(erro);
    else {
      toast.success("Foto trocada.");
      recarregarProdutos();
    }
  };

  // --- exportar ---------------------------------------------------------------
  const linhasExport = linhasFiltradas.map((l) => {
    const r: Record<string, string | number> = {
      SKU: l.produto.sku,
      Produto: l.produto.nome,
      CMV: l.produto.cmv,
      Estoque: l.estoque ?? "",
      "Vendas 30 dias": l.vendas30,
    };
    for (const c of canais) r[nomeCanal(c)] = l.canais.has(c) ? "Sim" : "Não";
    return r;
  });

  const ocupado = atualizando !== null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      {/* Resumo: quantos produtos há em cada canal */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Produtos no catálogo"
          valor={formatNumero(produtos.length)}
          detalhe={`${formatNumero(resumo.semCanal)} sem anúncio em nenhum canal`}
        />
        {canais.slice(0, 3).map((c) => (
          <CardKpi
            key={c}
            titulo={nomeCanal(c)}
            valor={`${formatNumero(resumo.porCanal.get(c) ?? 0)} produtos`}
            detalhe={`Faltam ${formatNumero(produtos.length - (resumo.porCanal.get(c) ?? 0))} para ter o catálogo todo`}
          />
        ))}
      </div>

      <Painel
        titulo="Anúncios por canal"
        descricao="Cada produto com os canais onde ele está anunciado. O ícone só aparece onde existe anúncio vinculado."
        acoes={
          <>
            <Button size="sm" variant="outline" onClick={atualizarTudo} disabled={ocupado}>
              <RefreshCw className={cn("size-3.5", atualizando === "topo" && "animate-spin")} />
              Atualizar vínculos
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={ocupado || canais.length === 0}>
                  {atualizando === "fotos" ? <Loader2 className="size-3.5 animate-spin" /> : <ImageDown className="size-3.5" />}
                  Puxar fotos de…
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-xs">Usar a foto do anúncio de:</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {canais.map((c) => (
                  <DropdownMenuItem key={c} onClick={() => puxarFotosDe(c)} className="gap-2 text-xs">
                    <LogoMarketplace id={c} tamanho="xs" />
                    {nomeCanal(c)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="outline" onClick={() => setImportar(true)}>
              <Upload className="size-3.5" />
              Importar planilha
            </Button>
            <ExportarDados nomeArquivo="anuncios-por-canal" linhas={linhasExport} />
          </>
        }
      >
        {/* Abas: Todos + uma por canal */}
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <div className="flex flex-wrap items-center gap-1 rounded-full bg-muted p-1">
            <BotaoAba ativo={aba === "todos"} onClick={() => setAba("todos")}>
              Todos
            </BotaoAba>
            {canais.map((c) => (
              <BotaoAba key={c} ativo={aba === c} onClick={() => setAba(c)}>
                <LogoMarketplace id={c} tamanho="xs" />
                {nomeCanal(c)}
              </BotaoAba>
            ))}
          </div>
          <div className="relative ml-auto w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por SKU ou nome..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {aba === "todos" && (
          <div className="flex flex-wrap items-center gap-1.5 border-b px-5 py-2.5">
            <span className="mr-1 text-[11px] font-semibold text-muted-foreground">Mostrar:</span>
            <Chip ativo={filtro === "todos"} onClick={() => setFiltro("todos")}>
              Todos ({formatNumero(linhas.length)})
            </Chip>
            {canais.map((c) => (
              <Chip key={c} ativo={filtro === `falta:${c}`} onClick={() => setFiltro(`falta:${c}`)}>
                Falta {noCanal(c)} ({formatNumero(produtos.length - (resumo.porCanal.get(c) ?? 0))})
              </Chip>
            ))}
            <Chip ativo={filtro === "sem-canal"} onClick={() => setFiltro("sem-canal")}>
              Sem nenhum canal ({formatNumero(resumo.semCanal)})
            </Chip>
            {semProduto.length > 0 && (
              <button
                type="button"
                onClick={() => setVerSemProduto((v) => !v)}
                className="ml-auto inline-flex items-center gap-1 rounded-full border border-warning/60 px-2.5 py-1 text-[11px] font-semibold text-warning transition-colors hover:bg-warning/10"
              >
                <Link2 className="size-3" />
                {formatNumero(semProduto.length)} anúncio(s) sem produto no catálogo
              </button>
            )}
          </div>
        )}

        {aba === "todos" && verSemProduto && semProduto.length > 0 && (
          <div className="border-b bg-warning/5 px-5 py-3">
            <p className="mb-2 text-xs font-semibold">
              Anúncios sem produto no catálogo: o SKU deles não bate com nenhum produto. Corrija o SKU no
              anúncio (ou refaça o anúncio com o SKU certo), ou suba o produto pela "Importar planilha".
            </p>
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {semProduto.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-md bg-card px-2 py-1.5 text-xs">
                  <LogoMarketplace id={a.marketplaceId} tamanho="xs" />
                  <FotoPequena url={a.fotoUrl ?? null} />
                  <span className="min-w-0 flex-1 truncate">{a.produto}</span>
                  <span className="num shrink-0 text-[11px] font-semibold text-foreground">SKU {a.sku || "vazio"}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {carregando ? (
          <div className="flex items-center justify-center gap-2 py-16 text-xs text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Carregando o catálogo...
          </div>
        ) : aba === "todos" ? (
          <div className="w-full">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <CabecalhoOrdenavel chave="produto" primeiro="asc" className="px-3" ordem={ordem} aoClicar={alternar}>Produto / SKU</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel chave="cmv" alinhar="right" ordem={ordem} aoClicar={alternar}>CMV</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel chave="estoque" alinhar="right" ordem={ordem} aoClicar={alternar}>Estoque</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel chave="vendas" alinhar="right" ordem={ordem} aoClicar={alternar}>Vendas 30 dias</CabecalhoOrdenavel>
                  <CabecalhoOrdenavel chave="canais" alinhar="center" ordem={ordem} aoClicar={alternar}>Canais</CabecalhoOrdenavel>
                  <th className="w-10 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {linhasFiltradas.slice(0, limite).map((l) => (
                  <tr key={l.produto.id} className="whitespace-nowrap transition-colors hover:bg-muted/30">
                    <td className="w-full max-w-0 px-3 py-2">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          title="Trocar a foto (clique, ou arraste uma imagem aqui)"
                          onClick={() => setFotoDe(l)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => soltarFoto(l, e)}
                          className="relative shrink-0 rounded-md transition-opacity hover:opacity-80"
                        >
                          <FotoPequena url={l.foto} grande />
                          {atualizando === `foto:${l.produto.id}` && (
                            <span className="absolute inset-0 grid place-items-center rounded-md bg-black/40">
                              <Loader2 className="size-4 animate-spin text-white" />
                            </span>
                          )}
                        </button>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{l.produto.nome}</p>
                          <p className="num text-[10px] text-muted-foreground">{l.produto.sku}</p>
                        </div>
                      </div>
                    </td>
                    <td className="num px-2 py-2 text-right text-xs">
                      {l.produto.cmv > 0 ? formatBRL(l.produto.cmv) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="num px-2 py-2 text-right text-xs" title={textoEstoque(l.anuncios)}>
                      {l.estoque === null ? <span className="text-muted-foreground">—</span> : formatNumero(l.estoque)}
                    </td>
                    <td className="num px-2 py-2 text-right text-xs">
                      {l.vendas30 > 0 ? formatNumero(l.vendas30) : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-2 py-2">
                      <IconesCanais canais={canais} anuncios={l.anuncios} />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => atualizarProduto(l)}
                        disabled={ocupado}
                        title="Ler de novo os canais deste produto (estoque, foto e anúncio novo)"
                        className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                      >
                        <RefreshCw className={cn("size-3.5", atualizando === l.produto.id && "animate-spin")} />
                      </button>
                    </td>
                  </tr>
                ))}
                {linhasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center text-xs text-muted-foreground">
                      {produtos.length === 0
                        ? "Seu catálogo está vazio. Use “Importar planilha” para subir todos os SKUs."
                        : "Nenhum produto neste filtro."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <MostrarMais total={linhasFiltradas.length} limite={limite} aoMostrar={() => setLimite((n) => n + LIMITE_PAGINA)} />
          </div>
        ) : (
          <div className="w-full">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-3 font-bold">Anúncio / SKU</th>
                  <th className="px-2 py-3 font-bold">Produto do catálogo</th>
                  <th className="px-2 py-3 text-right font-bold">CMV</th>
                  <th className="px-2 py-3 text-right font-bold">Estoque</th>
                  <th className="px-2 py-3 text-center font-bold">Também está em</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {anunciosDaAba.slice(0, limite).map((a) => {
                  const p = produtoDoAnuncio.get(a.id) ?? null;
                  const outros = p ? (linhaPorProduto.get(p.id)?.anuncios ?? []).filter((x) => x.marketplaceId !== a.marketplaceId) : [];
                  return (
                    <tr key={a.id} className="whitespace-nowrap transition-colors hover:bg-muted/30">
                      <td className="w-1/2 max-w-0 px-3 py-2">
                        <div className="flex items-center gap-3">
                          <FotoPequena url={a.fotoUrl ?? null} grande />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">{a.produto}</p>
                            <p className="num text-[10px] text-muted-foreground">
                              <span className="font-semibold text-foreground">{a.sku}</span>
                              {a.situacaoCanal ? ` · ${a.situacaoCanal}` : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="max-w-0 px-2 py-2 text-xs">
                        {p ? (
                          <span className="block truncate">{p.nome}</span>
                        ) : (
                          <span className="text-[11px] font-semibold text-warning" title="O SKU deste anúncio não está no catálogo">
                            SKU fora do catálogo
                          </span>
                        )}
                      </td>
                      <td className="num px-2 py-2 text-right text-xs">
                        {p && p.cmv > 0 ? formatBRL(p.cmv) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="num px-2 py-2 text-right text-xs">
                        {typeof a.estoque === "number" ? formatNumero(a.estoque) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2">
                        <IconesCanais canais={canais.filter((c) => c !== a.marketplaceId)} anuncios={outros} />
                      </td>
                    </tr>
                  );
                })}
                {anunciosDaAba.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-12 text-center text-xs text-muted-foreground">
                      Nenhum anúncio neste canal.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <MostrarMais total={anunciosDaAba.length} limite={limite} aoMostrar={() => setLimite((n) => n + LIMITE_PAGINA)} />
          </div>
        )}
      </Painel>

      {importar && (
        <DialogImportarProdutos
          produtos={produtos}
          semProduto={semProduto}
          aoFechar={() => setImportar(false)}
          aoConcluir={() => {
            setImportar(false);
            recarregarProdutos();
          }}
        />
      )}
      {fotoDe && (
        <DialogFotoProduto
          produto={fotoDe.produto}
          anuncios={fotoDe.anuncios}
          canais={canais}
          aoFechar={() => setFotoDe(null)}
          aoConcluir={() => {
            setFotoDe(null);
            recarregarProdutos();
          }}
        />
      )}
    </div>
  );
}

function textoEstoque(anuncios: Anuncio[]) {
  const partes = anuncios
    .filter((a) => typeof a.estoque === "number")
    .map((a) => `${nomeCanal(a.marketplaceId)}: ${a.estoque}`);
  return partes.length ? `Estoque em cada anúncio — ${partes.join(" · ")}` : "Sem anúncio com estoque informado";
}

/** Um espaço por canal: o ícone só aparece onde existe anúncio vinculado. */
function IconesCanais({ canais, anuncios }: { canais: MarketplaceId[]; anuncios: Anuncio[] }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {canais.map((c) => {
        const doCanal = anuncios.filter((a) => a.marketplaceId === c);
        if (doCanal.length === 0) return <span key={c} className="size-5" aria-hidden="true" />;
        const titulo = `${nomeCanal(c)}: ${doCanal.length} anúncio${doCanal.length === 1 ? "" : "s"}${
          doCanal.some((a) => typeof a.estoque === "number")
            ? ` · estoque ${doCanal.map((a) => a.estoque ?? "—").join(" / ")}`
            : ""
        }`;
        return (
          <span key={c} title={titulo} className="inline-flex">
            <LogoMarketplace id={c} tamanho="sm" />
          </span>
        );
      })}
    </div>
  );
}

function FotoPequena({ url, grande }: { url: string | null; grande?: boolean }) {
  const tamanho = grande ? "size-10" : "size-6";
  return url ? (
    <img src={url} alt="" loading="lazy" className={cn(tamanho, "shrink-0 rounded-md border bg-white object-contain")} />
  ) : (
    <div className={cn(tamanho, "shrink-0 rounded-md border bg-muted/40")} />
  );
}

function BotaoAba({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
        ativo ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Chip({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
        ativo ? "border-brand bg-brand/10 text-brand" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function MostrarMais({ total, limite, aoMostrar }: { total: number; limite: number; aoMostrar: () => void }) {
  if (total <= limite) return null;
  return (
    <div className="border-t px-3 py-3 text-center">
      <Button size="sm" variant="ghost" className="text-xs" onClick={aoMostrar}>
        Mostrar mais ({formatNumero(total - limite)} restantes)
      </Button>
    </div>
  );
}
