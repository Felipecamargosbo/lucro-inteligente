import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { estoqueService } from "@/services";
import { formatBRL, formatNumero } from "@/lib/format";
import { CardKpi, Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ItemEstoqueDetalhado } from "@/types";

export const Route = createFileRoute("/estoque")({
  head: () => ({
    meta: [
      { title: "Estoque e cobertura | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "Acompanhe capital investido, cobertura de estoque em dias e alertas de ruptura dos seus SKUs nos marketplaces.",
      },
      { property: "og:title", content: "Estoque e cobertura | NEXO Rentabilidade" },
      {
        property: "og:description",
        content:
          "Inteligência de estoque: cobertura em dias, ruptura iminente e produtos sem giro.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Estoque,
});

type Aba = "todos" | "ativos" | "ruptura" | "sem-giro" | "esgotados";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "ativos", rotulo: "Ativos" },
  { id: "ruptura", rotulo: "Alerta de Ruptura (<10 un)" },
  { id: "sem-giro", rotulo: "Sem Giro (>60 dias)" },
  { id: "esgotados", rotulo: "Esgotados" },
];

function statusEstoque(item: ItemEstoqueDetalhado) {
  if (item.quantidade === 0)
    return { texto: "Esgotado", cor: "bg-loss-soft text-loss", acao: "Repor agora" };
  if (item.quantidade < 10)
    return {
      texto: "Ruptura (<10 un)",
      cor: "bg-loss-soft text-loss",
      acao: "Comprar estoque",
    };
  if (item.coberturaDias > 60)
    return {
      texto: "Estoque parado",
      cor: "bg-warning-soft text-foreground",
      acao: "Criar promoção",
    };
  if (item.coberturaDias >= 15 && item.coberturaDias <= 45)
    return { texto: "Estoque saudável", cor: "bg-profit-soft text-profit", acao: "Monitorar" };
  return { texto: "Atenção", cor: "bg-info-soft text-info", acao: "Planejar compra" };
}

function Estoque() {
  const itens = estoqueService.listarDetalhado();
  const resumo = estoqueService.resumo();
  const [aba, setAba] = useState<Aba>("todos");
  const [busca, setBusca] = useState("");

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let lista = itens;
    if (aba === "ativos") lista = lista.filter((i) => i.quantidade > 0);
    if (aba === "ruptura")
      lista = lista.filter((i) => i.quantidade > 0 && i.quantidade < 10);
    if (aba === "sem-giro") lista = lista.filter((i) => i.coberturaDias > 60);
    if (aba === "esgotados") lista = lista.filter((i) => i.quantidade === 0);
    if (termo)
      lista = lista.filter(
        (i) =>
          i.sku.toLowerCase().includes(termo) || i.produto.toLowerCase().includes(termo),
      );
    return lista;
  }, [itens, aba, busca]);

  const linhasExport = filtrados.map((i) => ({
    SKU: i.sku,
    Produto: i.produto,
    Quantidade: i.quantidade,
    "Vendas/dia": i.vendasDia,
    "Cobertura (dias)": i.coberturaDias,
    "Valor em estoque": i.valorEstoque,
    Status: statusEstoque(i).texto,
  }));

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Capital investido em estoque"
          valor={formatBRL(resumo.capitalInvestido)}
          detalhe="Soma do CMV de todas as unidades paradas em estoque"
          dica="É o dinheiro que está imobilizado em produtos ainda não vendidos."
        />
        <CardKpi
          titulo="SKUs ativos"
          valor={`${formatNumero(resumo.skusAtivos)} itens`}
          detalhe="Produtos com anúncio publicado em algum canal"
        />
        <CardKpi
          titulo="SKUs em alerta de ruptura"
          valor={`${resumo.skusRuptura} itens`}
          detalhe="Cobertura menor que 7 dias de venda"
        />
        <CardKpi
          titulo="Estoque parado / sem giro"
          valor={formatBRL(resumo.valorParado)}
          detalhe="Produtos com mais de 60 dias de cobertura"
        />
      </div>

      <Painel
        titulo="Produtos e cobertura de estoque"
        descricao="Quantos dias de venda ainda cabem no estoque atual"
        acoes={<ExportarDados nomeArquivo="estoque" linhas={linhasExport} />}
      >
        <div className="flex flex-wrap gap-2 border-b px-5 py-3">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
                aba === a.id
                  ? "bg-brand text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70",
              )}
            >
              {a.rotulo}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-bold">Produto / SKU</th>
                <th className="px-4 py-3 text-right font-bold">Qtd em estoque</th>
                <th className="px-4 py-3 text-right font-bold">Vendas/dia (média)</th>
                <th className="px-4 py-3 text-right font-bold">Cobertura (dias)</th>
                <th className="px-4 py-3 text-right font-bold">Valor em estoque</th>
                <th className="px-4 py-3 text-center font-bold">Status do estoque</th>
                <th className="px-4 py-3 text-right font-bold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtrados.map((i) => {
                const s = statusEstoque(i);
                return (
                  <tr key={i.sku} className="transition-colors hover:bg-muted/40">
                    <td className="max-w-[300px] px-4 py-3">
                      <p className="truncate text-xs font-medium">{i.produto}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="num text-[10px] text-muted-foreground">{i.sku}</span>
                        <SeloMarketplace id={i.marketplaceId} />
                      </div>
                    </td>
                    <td className="num px-4 py-3 text-right text-xs">
                      {formatNumero(i.quantidade)}
                    </td>
                    <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                      {i.vendasDia.toFixed(1).replace(".", ",")}
                    </td>
                    <td
                      className={cn(
                        "num px-4 py-3 text-right text-xs font-bold",
                        i.quantidade === 0 || i.coberturaDias < 7
                          ? "text-loss"
                          : i.coberturaDias > 60
                            ? "text-foreground"
                            : "text-profit",
                      )}
                    >
                      {i.quantidade === 0 ? "—" : `${i.coberturaDias} d`}
                    </td>
                    <td className="num px-4 py-3 text-right text-xs">
                      {formatBRL(i.valorEstoque)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={cn(
                          "inline-flex rounded px-2 py-1 text-[10px] font-bold",
                          s.cor,
                        )}
                      >
                        {s.texto}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() =>
                          toast.info(`${s.acao}: ${i.produto}`, {
                            description:
                              "No protótipo esta ação apenas registra a intenção. Com o backend ela vira pedido de compra ou campanha.",
                          })
                        }
                      >
                        {s.acao}
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    Nenhum produto neste filtro.
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
