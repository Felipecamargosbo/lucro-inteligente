import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { usePeriodo } from "@/context/periodo";
import { vendasService } from "@/services";
import { MARKETPLACES } from "@/data/mock";
import { filtrarPorPeriodo, resumir } from "@/lib/finance";
import { formatBRL, formatData, formatDataHora, formatPercentual } from "@/lib/format";
import {
  CardKpi,
  Painel,
  SeloMargem,
  SeloMarketplace,
  StatusPedidoSelo,
} from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Pedido } from "@/types";

export const Route = createFileRoute("/vendas")({
  head: () => ({
    meta: [
      { title: "Vendas detalhadas | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "Consulte venda por venda e entenda como o preço virou lucro: CMV, comissão, taxas, impostos e margem.",
      },
      { property: "og:title", content: "Vendas detalhadas | NEXO Rentabilidade" },
      {
        property: "og:description",
        content: "Cada pedido com faturamento, custos e lucro líquido calculados.",
      },
    ],
  }),
  component: Vendas,
});

function Vendas() {
  const { periodo } = usePeriodo();
  const [marketplace, setMarketplace] = useState("todos");
  const [status, setStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<Pedido | null>(null);

  const pedidos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return filtrarPorPeriodo(vendasService.listar(), periodo).filter((p) => {
      if (marketplace !== "todos" && p.marketplaceId !== marketplace) return false;
      if (status !== "todos" && p.status !== status) return false;
      if (
        termo &&
        ![p.sku, p.produto, p.id, p.cliente].some((c) => c.toLowerCase().includes(termo))
      )
        return false;
      return true;
    });
  }, [periodo, marketplace, status, busca]);

  const resumo = resumir(pedidos);
  const visiveis = pedidos.slice(0, 100);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CardKpi titulo="Faturamento" valor={formatBRL(resumo.faturamento)} />
        <CardKpi titulo="Pedidos" valor={String(resumo.pedidos)} detalhe={`Ticket médio: ${formatBRL(resumo.ticketMedio)}`} />
        <CardKpi titulo="Lucro líquido" valor={formatBRL(resumo.lucroLiquido)} destaque />
        <CardKpi titulo="Margem líquida" valor={formatPercentual(resumo.margem)} />
      </div>

      <Painel
        titulo="Pedidos"
        descricao={`${pedidos.length} pedidos entre ${formatData(periodo.inicio)} e ${formatData(periodo.fim)} · clique numa linha para ver o detalhamento`}
        acoes={
          <ExportarDados
            nomeArquivo="vendas"
            linhas={pedidos.map((p) => ({
              Data: formatData(p.data),
              Pedido: p.id,
              Marketplace: p.marketplaceId,
              SKU: p.sku,
              Produto: p.produto,
              Quantidade: p.quantidade,
              "Preço de venda": p.precoUnitario.toFixed(2),
              Faturamento: p.faturamento.toFixed(2),
              CMV: p.cmv.toFixed(2),
              Comissão: p.comissao.toFixed(2),
              "Taxa fixa": p.taxaFixa.toFixed(2),
              Impostos: p.impostos.toFixed(2),
              Descontos: p.descontos.toFixed(2),
              "Outros custos": p.outrosCustos.toFixed(2),
              "Lucro líquido": p.lucroLiquido.toFixed(2),
              Margem: formatPercentual(p.margem),
              Status: p.status,
            }))}
          />
        }
      >
        <div className="grid gap-3 border-b p-4 md:grid-cols-3 xl:grid-cols-4">
          <Input
            placeholder="Buscar por SKU, produto, pedido ou cliente"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="xl:col-span-2"
          />
          <Select value={marketplace} onValueChange={setMarketplace}>
            <SelectTrigger>
              <SelectValue placeholder="Marketplace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os marketplaces</SelectItem>
              {MARKETPLACES.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="entregue">Entregue</SelectItem>
              <SelectItem value="em-transito">Em trânsito</SelectItem>
              <SelectItem value="aguardando-envio">Aguardando envio</SelectItem>
              <SelectItem value="cancelado">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-bold">Data</th>
                <th className="px-4 py-3 font-bold">Pedido</th>
                <th className="px-4 py-3 font-bold">Canal</th>
                <th className="px-4 py-3 font-bold">Produto / SKU</th>
                <th className="px-4 py-3 text-center font-bold">Qtd</th>
                <th className="px-4 py-3 text-right font-bold">Faturamento</th>
                <th className="px-4 py-3 text-right font-bold">CMV</th>
                <th className="px-4 py-3 text-right font-bold">Comissão</th>
                <th className="px-4 py-3 text-right font-bold">Taxas</th>
                <th className="px-4 py-3 text-right font-bold">Impostos</th>
                <th className="px-4 py-3 text-right font-bold">Lucro</th>
                <th className="px-4 py-3 text-center font-bold">Margem</th>
                <th className="px-4 py-3 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {visiveis.map((p) => (
                <tr
                  key={`${p.id}-${p.data}`}
                  onClick={() => setSelecionado(p)}
                  className="cursor-pointer transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-3 text-xs">{formatData(p.data)}</td>
                  <td className="num px-4 py-3 text-[11px] text-muted-foreground">#{p.id}</td>
                  <td className="px-4 py-3">
                    <SeloMarketplace id={p.marketplaceId} />
                  </td>
                  <td className="max-w-[240px] px-4 py-3">
                    <p className="truncate text-xs font-medium">{p.produto}</p>
                    <p className="num text-[10px] text-muted-foreground">{p.sku}</p>
                  </td>
                  <td className="num px-4 py-3 text-center text-xs">{p.quantidade}</td>
                  <td className="num px-4 py-3 text-right text-xs font-semibold">
                    {formatBRL(p.faturamento)}
                  </td>
                  <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatBRL(p.cmv)}
                  </td>
                  <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatBRL(p.comissao)}
                  </td>
                  <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatBRL(p.taxaFixa + p.outrosCustos)}
                  </td>
                  <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatBRL(p.impostos)}
                  </td>
                  <td
                    className={`num px-4 py-3 text-right text-xs font-bold ${
                      p.lucroLiquido >= 0 ? "text-profit" : "text-loss"
                    }`}
                  >
                    {formatBRL(p.lucroLiquido)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <SeloMargem margem={p.margem} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusPedidoSelo status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pedidos.length > visiveis.length && (
          <p className="border-t px-5 py-3 text-center text-[11px] text-muted-foreground">
            Mostrando os 100 pedidos mais recentes de {pedidos.length}. Use os filtros para refinar.
          </p>
        )}
      </Painel>

      <DetalheVenda pedido={selecionado} aoFechar={() => setSelecionado(null)} />
    </div>
  );
}

function DetalheVenda({
  pedido,
  aoFechar,
}: {
  pedido: Pedido | null;
  aoFechar: () => void;
}) {
  if (!pedido) return null;

  const linhas = [
    { rotulo: "CMV (custo do produto)", valor: pedido.cmv },
    { rotulo: "Comissão do marketplace", valor: pedido.comissao },
    { rotulo: "Taxa fixa", valor: pedido.taxaFixa },
    { rotulo: "Impostos", valor: pedido.impostos },
    { rotulo: "Descontos", valor: pedido.descontos },
    { rotulo: "Outros custos", valor: pedido.outrosCustos },
  ];

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Detalhamento do pedido #{pedido.id}</DialogTitle>
          <DialogDescription>
            {formatDataHora(pedido.data)} · {pedido.cliente}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border p-4">
            <p className="text-xs font-semibold">{pedido.produto}</p>
            <p className="num text-[11px] text-muted-foreground">
              SKU {pedido.sku} · {pedido.quantidade} un. · {formatBRL(pedido.precoUnitario)} cada
            </p>
          </div>

          <div className="rounded-xl border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-xs font-semibold">Faturamento</span>
              <span className="num text-sm font-bold">{formatBRL(pedido.faturamento)}</span>
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
                {formatBRL(pedido.lucroLiquido)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
            <span className="text-xs font-medium">Margem líquida</span>
            <SeloMargem margem={pedido.margem} />
          </div>

          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Cálculo demonstrativo com dados fictícios. Com as APIs conectadas, os valores virão
            direto do marketplace.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
