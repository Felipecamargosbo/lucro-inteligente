import { useMemo, useReducer, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Clock, Link2, Link2Off, Search } from "lucide-react";
import { anunciosService, produtosService } from "@/services";
import { calcularCobertura, raioXAnuncio } from "@/lib/finance";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { Painel } from "@/components/comum/Indicadores";
import { useConfiguracoes } from "@/context/configuracoes";
import { cn } from "@/lib/utils";
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
import type { Anuncio, ContaMarketplace, Produto } from "@/types";

type TipoPendencia = "sem-custo" | "sem-vinculo" | "taxa-estimada";

const TIPOS: Record<
  TipoPendencia,
  { rotulo: string; descricao: string; Icone: typeof CircleAlert; cor: string }
> = {
  "sem-custo": {
    rotulo: "Sem custo cadastrado",
    descricao:
      "Sem o custo do produto não existe margem — estes anúncios ficam fora de qualquer conta de lucro.",
    Icone: CircleAlert,
    cor: "text-loss",
  },
  "sem-vinculo": {
    rotulo: "Sem vínculo com produto",
    descricao:
      "O anúncio não está ligado a um produto do catálogo, então não há de onde puxar o custo.",
    Icone: Link2Off,
    cor: "text-foreground",
  },
  "taxa-estimada": {
    rotulo: "Taxa ainda estimada",
    descricao:
      "As taxas são projeção sobre o preço de hoje. O valor final muda quando o canal liquidar.",
    Icone: Clock,
    cor: "text-muted-foreground",
  },
};

function classificar(a: Anuncio): TipoPendencia[] {
  const lista: TipoPendencia[] = [];
  if (a.cmv === null) lista.push("sem-custo");
  if (!a.produtoId) lista.push("sem-vinculo");
  if (a.origemTaxas === "estimado") lista.push("taxa-estimada");
  return lista;
}

export function PendenciasCanal({ conta }: { conta: ContaMarketplace }) {
  const [filtro, setFiltro] = useState<TipoPendencia | "todas">("todas");
  const [emVinculo, setEmVinculo] = useState<Anuncio | null>(null);
  // O vínculo muda um array fora do React (o "catálogo" fictício em
  // src/data/mock.ts); este contador força a releitura depois de cada ação.
  const [, forcarAtualizacao] = useReducer((n: number) => n + 1, 0);
  const { metasPorConta, fiscal, custoOperacionalDetalhado } = useConfiguracoes();
  const metas = metasPorConta[conta.id] ?? null;

  const anuncios = useMemo(
    () => anunciosService.listar().filter((a) => a.contaId === conta.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conta.id, forcarAtualizacao],
  );

  const cobertura = calcularCobertura(anuncios);

  const pendentes = useMemo(
    () =>
      anuncios
        .map((a) => ({ anuncio: a, tipos: classificar(a) }))
        .filter((i) => i.tipos.length > 0)
        .filter((i) => filtro === "todas" || i.tipos.includes(filtro))
        // Faturamento perdido primeiro: resolver o que mais vende rende mais
        .sort(
          (a, b) =>
            b.anuncio.precoAtual * b.anuncio.unidadesVendidas -
            a.anuncio.precoAtual * a.anuncio.unidadesVendidas,
        ),
    [anuncios, filtro],
  );

  /** Faturamento que passa por anúncios sem custo — dinheiro sem margem conhecida. */
  const receitaCega = anuncios
    .filter((a) => a.cmv === null)
    .reduce((s, a) => s + a.precoAtual * a.unidadesVendidas, 0);

  const contagem: Record<TipoPendencia, number> = {
    "sem-custo": cobertura.semCusto,
    "sem-vinculo": cobertura.semVinculo,
    "taxa-estimada": cobertura.comTaxaEstimada,
  };

  if (pendentes.length === 0 && filtro === "todas") {
    return (
      <Painel titulo="Pendências" descricao="O que impede o cálculo confiável de margem">
        <div className="flex flex-col items-center px-5 py-12 text-center">
          <CheckCircle2 className="size-8 text-profit" />
          <p className="mt-3 text-sm font-medium">Nada pendente neste canal</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Todos os anúncios têm custo cadastrado, vínculo com produto e taxas liquidadas.
          </p>
        </div>
      </Painel>
    );
  }

  return (
    <div className="space-y-4">
      {/* O impacto, em dinheiro */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Catálogo com margem calculável
          </p>
          <p
            className={cn(
              "num mt-1 text-2xl font-bold",
              cobertura.percentualCalculavel >= 0.9 ? "text-profit" : "text-loss",
            )}
          >
            {formatPercentual(cobertura.percentualCalculavel)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {formatNumero(cobertura.comCusto)} de {formatNumero(cobertura.total)} anúncios
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Faturamento sem margem conhecida
          </p>
          <p className="num mt-1 text-2xl font-bold text-loss">{formatBRL(receitaCega)}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Dinheiro que entrou sem você saber se deu lucro
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Anúncios com taxa estimada
          </p>
          <p className="num mt-1 text-2xl font-bold">
            {formatNumero(cobertura.comTaxaEstimada)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Valores podem mudar até a liquidação
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFiltro("todas")}
          className={cn(
            "rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
            filtro === "todas"
              ? "border-brand bg-brand-soft text-brand"
              : "text-muted-foreground hover:bg-muted",
          )}
        >
          Todas
        </button>
        {(Object.keys(TIPOS) as TipoPendencia[]).map((t) => {
          if (contagem[t] === 0) return null;
          const meta = TIPOS[t];
          const Icone = meta.Icone;
          return (
            <button
              key={t}
              onClick={() => setFiltro(t)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors",
                filtro === t
                  ? "border-brand bg-brand-soft text-brand"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icone className="size-3" />
              {meta.rotulo} ({formatNumero(contagem[t])})
            </button>
          );
        })}
      </div>

      {filtro !== "todas" && (
        <p className="rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
          {TIPOS[filtro].descricao}
        </p>
      )}

      <Painel
        titulo="Anúncios pendentes"
        descricao="Ordenados por faturamento — resolver os de cima rende mais"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Produto / SKU</th>
                <th className="px-3 py-2 text-right font-medium">Preço</th>
                <th className="px-3 py-2 text-right font-medium">Un. vendidas</th>
                <th className="px-3 py-2 text-right font-medium">Faturamento</th>
                <th className="px-3 py-2 font-medium">Pendências</th>
                <th className="px-3 py-2 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {pendentes.map(({ anuncio, tipos }) => {
                const r = raioXAnuncio(anuncio, metas, anuncio.precoAtual, {
                  aliquotaImposto: fiscal.aliquota,
                  custosOperacionais: custoOperacionalDetalhado(anuncio.precoAtual),
                });
                const faturamento = anuncio.precoAtual * anuncio.unidadesVendidas;
                return (
                  <tr key={anuncio.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="max-w-[280px] px-4 py-3">
                      <p className="truncate text-xs font-medium">{anuncio.produto}</p>
                      <p className="num text-[10px] text-muted-foreground">{anuncio.sku}</p>
                    </td>
                    <td className="num px-3 py-3 text-right text-xs">
                      {formatBRL(r.precoVenda)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                      {formatNumero(anuncio.unidadesVendidas)}
                    </td>
                    <td className="num px-3 py-3 text-right text-xs font-semibold">
                      {formatBRL(faturamento)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {tipos.map((t) => {
                          const meta = TIPOS[t];
                          const Icone = meta.Icone;
                          return (
                            <span
                              key={t}
                              className={cn(
                                "inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium",
                                meta.cor,
                              )}
                            >
                              <Icone className="size-3" />
                              {meta.rotulo}
                            </span>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {!anuncio.produtoId && (
                        <Button size="sm" variant="outline" onClick={() => setEmVinculo(anuncio)}>
                          <Link2 className="size-3.5" />
                          Vincular
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {pendentes.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    Nenhum anúncio com esta pendência.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Painel>

      {emVinculo && (
        <DialogVincular
          anuncio={emVinculo}
          aoFechar={() => setEmVinculo(null)}
          aoConcluir={() => {
            setEmVinculo(null);
            forcarAtualizacao();
          }}
        />
      )}
    </div>
  );
}

/**
 * Vincula um anúncio pendente a um produto do catálogo — por busca (SKU, EAN
 * ou nome) — ou cria um produto novo a partir do próprio anúncio quando ele
 * ainda não existe no catálogo. Uma vez vinculado, o CMV passa a vir do
 * catálogo e some da fila de Pendências.
 */
function DialogVincular({
  anuncio,
  aoFechar,
  aoConcluir,
}: {
  anuncio: Anuncio;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [busca, setBusca] = useState(anuncio.sku);
  const [cmvNovoProduto, setCmvNovoProduto] = useState("");

  const resultados = useMemo<Produto[]>(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return [];
    return produtosService
      .listar()
      .filter(
        (p) =>
          p.sku.toLowerCase().includes(termo) ||
          p.nome.toLowerCase().includes(termo) ||
          (p.ean ?? "").includes(termo),
      )
      .slice(0, 8);
  }, [busca]);

  const vincularA = (produto: Produto) => {
    produtosService.vincular(anuncio.id, produto.id);
    toast.success(`Anúncio vinculado a "${produto.nome}" — CMV agora vem do catálogo.`);
    aoConcluir();
  };

  const criarNovo = () => {
    const cmv = Number(cmvNovoProduto.replace(",", ".")) || 0;
    const produto = produtosService.criarAPartirDeAnuncio(anuncio.id, { cmv });
    if (produto) {
      toast.success(`Produto "${produto.nome}" criado e vinculado.`);
      aoConcluir();
    }
  };

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular a um produto</DialogTitle>
          <DialogDescription>
            {anuncio.produto} · SKU {anuncio.sku}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">
              Buscar produto existente por SKU, EAN ou nome
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8"
                placeholder="SKU, EAN ou nome do produto"
              />
            </div>
          </div>

          <div className="max-h-56 space-y-1 overflow-y-auto">
            {resultados.length === 0 && (
              <p className="rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                Nenhum produto encontrado no catálogo com esse termo.
              </p>
            )}
            {resultados.map((p) => (
              <button
                key={p.id}
                onClick={() => vincularA(p)}
                className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
              >
                <span>
                  <span className="block font-medium">{p.nome}</span>
                  <span className="num block text-[10px] text-muted-foreground">
                    SKU {p.sku}
                    {p.ean ? ` · EAN ${p.ean}` : ""}
                  </span>
                </span>
                <span className="num text-[11px] font-semibold">{formatBRL(p.cmv)}</span>
              </button>
            ))}
          </div>

          <div className="border-t pt-4">
            <p className="text-[11px] font-medium text-muted-foreground">
              Não existe ainda? Crie um produto a partir deste anúncio
            </p>
            <div className="mt-2 flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">CMV inicial (R$)</Label>
                <Input
                  inputMode="decimal"
                  value={cmvNovoProduto}
                  onChange={(e) => setCmvNovoProduto(e.target.value)}
                  placeholder="0,00"
                  className="mt-1"
                />
              </div>
              <Button variant="outline" onClick={criarNovo}>
                Criar produto
              </Button>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            No protótipo o catálogo é fictício e vive apenas nesta sessão.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
