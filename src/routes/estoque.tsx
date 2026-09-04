import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { estoqueService } from "@/services";
import { formatBRL, formatNumero } from "@/lib/format";
import { CardKpi, Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { ModalPedidoCompra } from "@/components/estoque/ModalPedidoCompra";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search } from "lucide-react";
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

type Aba = "todos" | "ativos" | "esgotados";

const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "ativos", rotulo: "Ativos" },
  { id: "esgotados", rotulo: "Esgotados" },
];

const OPCOES_RUPTURA = [
  { valor: "7", rotulo: "Cobertura < 7 dias" },
  { valor: "15", rotulo: "Cobertura < 15 dias" },
  { valor: "30", rotulo: "Cobertura < 30 dias" },
  { valor: "60", rotulo: "Cobertura < 60 dias" },
];

const OPCOES_SEM_GIRO = [
  { valor: "7", rotulo: "Parado > 7 dias" },
  { valor: "15", rotulo: "Parado > 15 dias" },
  { valor: "30", rotulo: "Parado > 30 dias" },
  { valor: "60", rotulo: "Parado > 60 dias" },
];

type StatusOficial = {
  texto: "Atenção" | "Esgotado" | "Estoque Saudável" | "Sem Giro";
  cor: string;
  acao: "Comprar Estoque" | "Estoque Baixo" | "Suficiente";
};

/** Os 4 status oficiais do estoque, em ordem de prioridade. */
function statusEstoque(item: ItemEstoqueDetalhado): StatusOficial {
  if (item.quantidade === 0)
    return {
      texto: "Esgotado",
      cor: "bg-loss-soft text-loss",
      acao: "Comprar Estoque",
    };
  if (item.quantidade < 10 || item.coberturaDias < 10)
    return {
      texto: "Atenção",
      cor: "bg-warning-soft text-foreground",
      acao: "Estoque Baixo",
    };
  if (item.coberturaDias > 60)
    return {
      texto: "Sem Giro",
      cor: "bg-warning text-foreground",
      acao: "Suficiente",
    };
  return {
    texto: "Estoque Saudável",
    cor: "bg-profit-soft text-profit",
    acao: "Suficiente",
  };
}

function Estoque() {
  const itens = estoqueService.listarDetalhado();
  const resumo = estoqueService.resumo();
  const [aba, setAba] = useState<Aba>("todos");
  const [busca, setBusca] = useState("");
  const [filtroRuptura, setFiltroRuptura] = useState<string>("off");
  const [filtroSemGiro, setFiltroSemGiro] = useState<string>("off");
  const [itemPedido, setItemPedido] = useState<ItemEstoqueDetalhado | null>(null);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let lista = itens;
    if (aba === "ativos") lista = lista.filter((i) => i.quantidade > 0);
    if (aba === "esgotados") lista = lista.filter((i) => i.quantidade === 0);
    if (filtroRuptura !== "off") {
      const limite = Number(filtroRuptura);
      lista = lista.filter((i) => i.quantidade > 0 && i.coberturaDias < limite);
    }
    if (filtroSemGiro !== "off") {
      const limite = Number(filtroSemGiro);
      lista = lista.filter((i) => i.quantidade > 0 && i.coberturaDias > limite);
    }
    if (termo)
      lista = lista.filter(
        (i) =>
          i.sku.toLowerCase().includes(termo) || i.produto.toLowerCase().includes(termo),
      );
    return lista;
  }, [itens, aba, busca, filtroRuptura, filtroSemGiro]);

  const linhasExport = filtrados.map((i) => ({
    SKU: i.sku,
    Produto: i.produto,
    Quantidade: i.quantidade,
    "Vendas/dia": i.vendasDia,
    "Cobertura (dias)": i.coberturaDias,
    "Valor em estoque": i.valorEstoque,
    Status: statusEstoque(i).texto,
  }));

  const aoClicarAcao = (item: ItemEstoqueDetalhado) => {
    setItemPedido(item);
  };

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
          detalhe="Produtos com menos de 10 unidades em estoque"
          dica="Estoque baixo: risco de perder vendas por falta de produto."
        />
        <CardKpi
          titulo="Estoque parado / sem giro"
          valor={`${formatNumero(resumo.unidadesParadas)} un`}
          detalhe="Unidades com mais de 60 dias de cobertura"
        />
      </div>

      <Painel
        titulo="Produtos e cobertura de estoque"
        descricao="Quantos dias de venda ainda cabem no estoque atual"
        acoes={<ExportarDados nomeArquivo="estoque" linhas={linhasExport} />}
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por SKU ou Nome do Produto..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-1 rounded-full bg-muted p-1">
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAba(a.id)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                  aba === a.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {a.rotulo}
              </button>
            ))}
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Select value={filtroRuptura} onValueChange={setFiltroRuptura}>
              <SelectTrigger
                className={cn(
                  "h-8 w-auto gap-1.5 text-[11px] font-semibold",
                  filtroRuptura !== "off" && "border-loss/40 text-loss",
                )}
              >
                <SelectValue placeholder="Alerta de Ruptura" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Alerta de Ruptura: desativado</SelectItem>
                {OPCOES_RUPTURA.map((o) => (
                  <SelectItem key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filtroSemGiro} onValueChange={setFiltroSemGiro}>
              <SelectTrigger
                className={cn(
                  "h-8 w-auto gap-1.5 text-[11px] font-semibold",
                  filtroSemGiro !== "off" && "border-warning/60 text-foreground",
                )}
              >
                <SelectValue placeholder="Sem Giro" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off">Sem Giro: desativado</SelectItem>
                {OPCOES_SEM_GIRO.map((o) => (
                  <SelectItem key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
                        className="h-7 bg-brand text-[11px] text-brand-foreground hover:bg-brand/90"
                        onClick={() => aoClicarAcao(i)}
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

      <ModalPedidoCompra item={itemPedido} onFechar={() => setItemPedido(null)} />
    </div>
  );
}
