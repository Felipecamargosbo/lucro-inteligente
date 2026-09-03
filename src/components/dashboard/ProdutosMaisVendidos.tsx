import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { usePeriodo } from "@/context/periodo";
import { useSelecaoContas } from "@/context/selecao-contas";
import { contasService, vendasService } from "@/services";
import { CANAIS } from "@/config/navegacao";
import { filtrarPorPeriodo } from "@/lib/finance";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { CardKpi, Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MarketplaceId, Pedido } from "@/types";

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
      porCanal: new Map<MarketplaceId, Set<string>>(),
    };
    atual.unidades += p.quantidade;
    atual.pedidos += 1;
    atual.faturamento += p.faturamento;
    atual.lucro += p.lucroLiquido;
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
                <tr key={p.sku} className="transition-colors hover:bg-muted/40">
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
    </div>
  );
}
