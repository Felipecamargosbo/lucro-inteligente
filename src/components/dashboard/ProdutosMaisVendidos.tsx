import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { usePeriodo } from "@/context/periodo";
import { useSelecaoContas } from "@/context/selecao-contas";
import { contasService, vendasService } from "@/services";
import { CANAIS } from "@/config/navegacao";
import { filtrarPorPeriodo } from "@/lib/finance";
import { formatBRL, formatData, formatNumero, formatPercentual } from "@/lib/format";
import { CardKpi, Painel, SeloMarketplace, SeloMargem } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MarketplaceId, Pedido, Periodo } from "@/types";

/** Um canal em que o produto vendeu, com a(s) loja(s)/subconta(s) daquele
 * canal que efetivamente venderam — é essa parte que faltava: sem ela, dois
 * produtos vendidos em lojas diferentes do mesmo Mercado Livre pareciam a
 * mesma coisa, e não dava pra identificar qual loja vendeu o quê. */
interface CanalDoProduto {
  marketplaceId: MarketplaceId;
  lojas: string[];
}

interface ItemProduto {
  sku: string;
  produto: string;
  unidades: number;
  pedidos: number;
  faturamento: number;
  lucro: number;
  margem: number;
  canais: CanalDoProduto[];
  // Soma de cada custo, de TODOS os pedidos deste SKU no período/seleção
  // atual — é o que abre o detalhamento (o "de onde saiu essa margem?").
  cmv: number;
  comissao: number;
  taxaFixa: number;
  impostos: number;
  descontos: number;
  outrosCustos: number;
}

/** Agrupa os pedidos (já filtrados por período e pela seleção de contas lá de
 * cima) por SKU — uma linha por produto, com tudo que o seller precisa pra
 * decidir o que empurrar mais e o que já não vale a pena. */
function agruparProdutos(pedidos: Pedido[]): ItemProduto[] {
  const mapa = new Map<
    string,
    Omit<ItemProduto, "canais"> & { porCanal: Map<MarketplaceId, Set<string>> }
  >();
  for (const p of pedidos) {
    if (p.status === "cancelado") continue;
    const atual = mapa.get(p.sku) ?? {
      sku: p.sku,
      produto: p.produto,
      unidades: 0,
      pedidos: 0,
      faturamento: 0,
      lucro: 0,
      margem: 0,
      cmv: 0,
      comissao: 0,
      taxaFixa: 0,
      impostos: 0,
      descontos: 0,
      outrosCustos: 0,
      porCanal: new Map<MarketplaceId, Set<string>>(),
    };
    atual.unidades += p.quantidade;
    atual.pedidos += 1;
    atual.faturamento += p.faturamento;
    atual.lucro += p.lucroLiquido;
    atual.cmv += p.cmv;
    atual.comissao += p.comissao;
    atual.taxaFixa += p.taxaFixa;
    atual.impostos += p.impostos;
    atual.descontos += p.descontos;
    atual.outrosCustos += p.outrosCustos;
    const contasDoCanal = atual.porCanal.get(p.marketplaceId) ?? new Set<string>();
    contasDoCanal.add(p.contaId);
    atual.porCanal.set(p.marketplaceId, contasDoCanal);
    mapa.set(p.sku, atual);
  }
  return [...mapa.values()].map(({ porCanal, ...item }) => ({
    ...item,
    margem: item.faturamento ? item.lucro / item.faturamento : 0,
    canais: [...porCanal.entries()].map(([marketplaceId, contaIds]) => ({
      marketplaceId,
      lojas: [...contaIds].map((id) => contasService.buscar(id)?.nome ?? id),
    })),
  }));
}

type Coluna = "unidades" | "pedidos" | "faturamento" | "lucro" | "margem";

const COLUNAS: { id: Coluna; rotulo: string }[] = [
  { id: "unidades", rotulo: "Unidades" },
  { id: "pedidos", rotulo: "Pedidos" },
  { id: "faturamento", rotulo: "Faturamento" },
  { id: "lucro", rotulo: "Lucro líquido" },
  { id: "margem", rotulo: "Margem" },
];

/**
 * Todo produto que vendeu no período, ranqueado — por padrão pelo que mais
 * vendeu em unidades, mas qualquer coluna reordena com um clique. Respeita o
 * período e o filtro de canal/loja que já ficam no topo do Dashboard, então
 * "ver por um marketplace específico" é só trocar aquele filtro de sempre,
 * sem precisar de mais um seletor só pra esta tabela.
 */
export function ProdutosMaisVendidos() {
  const { periodo } = usePeriodo();
  const { filtrarPorSelecao } = useSelecaoContas();
  const [busca, setBusca] = useState("");
  const [ordenarPor, setOrdenarPor] = useState<Coluna>("unidades");
  const [direcao, setDirecao] = useState<"desc" | "asc">("desc");
  const [selecionado, setSelecionado] = useState<ItemProduto | null>(null);

  const pedidos = filtrarPorSelecao(vendasService.listar());
  const pedidosDoPeriodo = useMemo(
    () => filtrarPorPeriodo(pedidos, periodo),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pedidos, periodo.inicio, periodo.fim],
  );

  const produtos = useMemo(() => agruparProdutos(pedidosDoPeriodo), [pedidosDoPeriodo]);

  const totais = useMemo(
    () => ({
      skus: produtos.length,
      unidades: produtos.reduce((s, p) => s + p.unidades, 0),
      faturamento: produtos.reduce((s, p) => s + p.faturamento, 0),
      lucro: produtos.reduce((s, p) => s + p.lucro, 0),
    }),
    [produtos],
  );

  const alternarOrdenacao = (coluna: Coluna) => {
    if (ordenarPor === coluna) {
      setDirecao((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setOrdenarPor(coluna);
      setDirecao("desc");
    }
  };

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = termo
      ? produtos.filter(
          (p) => p.produto.toLowerCase().includes(termo) || p.sku.toLowerCase().includes(termo),
        )
      : produtos;
    const sinal = direcao === "desc" ? -1 : 1;
    return [...filtrados].sort((a, b) => sinal * (a[ordenarPor] - b[ordenarPor]));
  }, [produtos, busca, ordenarPor, direcao]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Produtos vendidos"
          valor={formatNumero(totais.skus)}
          detalhe="SKUs distintos no período"
        />
        <CardKpi titulo="Unidades vendidas" valor={formatNumero(totais.unidades)} />
        <CardKpi titulo="Faturamento" valor={formatBRL(totais.faturamento)} />
        <CardKpi
          titulo="Lucro líquido"
          valor={formatBRL(totais.lucro)}
          destaque={totais.lucro >= 0}
        />
      </div>

      <Painel
        titulo="Produtos mais vendidos"
        descricao="Cada produto que vendeu no período, com faturamento, lucro e margem — clique numa coluna pra reordenar"
        acoes={
          <ExportarDados
            nomeArquivo="produtos-mais-vendidos"
            linhas={linhas.map((p) => ({
              SKU: p.sku,
              Produto: p.produto,
              Unidades: p.unidades,
              Pedidos: p.pedidos,
              Faturamento: p.faturamento.toFixed(2),
              "Lucro líquido": p.lucro.toFixed(2),
              "Margem (%)": (p.margem * 100).toFixed(1),
              "Canais e lojas": p.canais
                .map((c) => {
                  const titulo = CANAIS.find((canal) => canal.id === c.marketplaceId)?.titulo ?? c.marketplaceId;
                  return `${titulo}: ${c.lojas.join("/")}`;
                })
                .join("; "),
            }))}
          />
        }
      >
        <div className="flex flex-wrap items-end gap-3 border-b p-4">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Buscar
            </p>
            <Input
              placeholder="SKU ou nome do produto"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="h-8 w-56 text-xs"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-bold">Produto / SKU</th>
                <th className="px-4 py-3 font-bold">Canais</th>
                {COLUNAS.map((c) => (
                  <th key={c.id} className="px-4 py-3 text-right font-bold">
                    <button
                      onClick={() => alternarOrdenacao(c.id)}
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors hover:text-foreground",
                        ordenarPor === c.id && "text-brand",
                      )}
                    >
                      {c.rotulo}
                      {ordenarPor === c.id ? (
                        direcao === "desc" ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ArrowUp className="size-3" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {linhas.map((p) => (
                <tr
                  key={p.sku}
                  onClick={() => setSelecionado(p)}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="max-w-[260px] px-4 py-3">
                    <p className="truncate text-xs font-medium">{p.produto}</p>
                    <p className="num text-[10px] text-muted-foreground">{p.sku}</p>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                      {p.canais.map((c) => (
                        <div key={c.marketplaceId} className="flex items-center gap-1.5">
                          <SeloMarketplace id={c.marketplaceId} />
                          <span className="text-[10px] text-muted-foreground">
                            {c.lojas.join(", ")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="num px-4 py-3 text-right text-xs font-semibold">
                    {formatNumero(p.unidades)}
                  </td>
                  <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatNumero(p.pedidos)}
                  </td>
                  <td className="num px-4 py-3 text-right text-xs font-semibold">
                    {formatBRL(p.faturamento)}
                  </td>
                  <td
                    className={cn(
                      "num px-4 py-3 text-right text-xs font-semibold",
                      p.lucro >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {formatBRL(p.lucro)}
                  </td>
                  <td
                    className={cn(
                      "num px-4 py-3 text-right text-xs font-medium",
                      p.margem >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {formatPercentual(p.margem)}
                  </td>
                </tr>
              ))}
              {linhas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    Nenhuma venda encontrada nesse período{busca ? " com esse termo de busca" : ""}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Painel>

      <DetalheProduto
        produto={selecionado}
        periodo={periodo}
        aoFechar={() => setSelecionado(null)}
      />
    </div>
  );
}

/**
 * Abre ao clicar numa linha da tabela — mesmo painel de "de onde saiu essa
 * margem" que já existe em Vendas para um pedido, só que aqui somado: o
 * produto pode ter vendido em vários pedidos, canais e lojas dentro do
 * período, então cada custo é a soma de todos eles, não um valor único.
 */
function DetalheProduto({
  produto,
  periodo,
  aoFechar,
}: {
  produto: ItemProduto | null;
  periodo: Periodo;
  aoFechar: () => void;
}) {
  if (!produto) return null;

  const linhas = [
    { rotulo: "CMV (custo do produto)", valor: produto.cmv },
    { rotulo: "Comissão do marketplace", valor: produto.comissao },
    { rotulo: "Taxa fixa", valor: produto.taxaFixa },
    { rotulo: "Impostos", valor: produto.impostos },
    { rotulo: "Descontos", valor: produto.descontos },
    { rotulo: "Outros custos", valor: produto.outrosCustos },
  ];
  const precoMedio = produto.unidades ? produto.faturamento / produto.unidades : 0;

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalhamento de {produto.produto}</DialogTitle>
          <DialogDescription>
            {formatData(periodo.inicio)} a {formatData(periodo.fim)} · soma de{" "}
            {formatNumero(produto.pedidos)} pedido{produto.pedidos > 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border p-4">
            <p className="text-xs font-semibold">{produto.produto}</p>
            <p className="num text-[11px] text-muted-foreground">
              SKU {produto.sku} · {formatNumero(produto.unidades)} un. ·{" "}
              {formatBRL(precoMedio)} em média cada
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
              {produto.canais.map((c) => (
                <div key={c.marketplaceId} className="flex items-center gap-1.5">
                  <SeloMarketplace id={c.marketplaceId} />
                  <span className="text-[10px] text-muted-foreground">
                    {c.lojas.join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-xs font-semibold">Faturamento</span>
              <span className="num text-sm font-bold">{formatBRL(produto.faturamento)}</span>
            </div>
            <div className="divide-y">
              {linhas.map((l) => (
                <div key={l.rotulo} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[11px] text-muted-foreground">− {l.rotulo}</span>
                  <span className="num text-[11px] text-loss">{formatBRL(l.valor)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t bg-profit-soft px-4 py-3">
              <span className="text-xs font-bold text-profit">Lucro líquido</span>
              <span className="num text-sm font-bold text-profit">
                {formatBRL(produto.lucro)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
            <span className="text-xs font-medium">Margem média no período</span>
            <SeloMargem margem={produto.margem} />
          </div>

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Soma de todos os pedidos deste produto no período e na seleção de contas atuais.
            Cálculo demonstrativo com dados fictícios — com as APIs conectadas, os valores virão
            direto do marketplace.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
