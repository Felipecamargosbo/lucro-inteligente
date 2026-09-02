import { createFileRoute } from "@tanstack/react-router";
import { type ReactNode, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { usePeriodo } from "@/context/periodo";
import { useSelecaoContas } from "@/context/selecao-contas";
import { useConfiguracoes } from "@/context/configuracoes";
import { vendasService } from "@/services";
import { classificarFaixa, filtrarPorPeriodo, resumir } from "@/lib/finance";
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
import { cn } from "@/lib/utils";
import type { FaixaSaudeMargem, Pedido } from "@/types";

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

const ROTULO_FAIXA_MARGEM: Record<FaixaSaudeMargem, string> = {
  prejuizo: "Prejuízo",
  "abaixo-da-minima": "Abaixo da mínima",
  "entre-minima-e-ideal": "Entre mínima e ideal",
  saudavel: "Saudável",
  "sem-meta": "Sem meta definida",
  "sem-custo": "Sem cálculo",
};

// "sem-custo" não se aplica aqui: todo pedido já concluído tem CMV calculado,
// diferente de um anúncio ainda sem custo cadastrado.
const ORDEM_FAIXAS_MARGEM: FaixaSaudeMargem[] = [
  "prejuizo",
  "abaixo-da-minima",
  "entre-minima-e-ideal",
  "saudavel",
  "sem-meta",
];

type CampoOrdenacao =
  | "data"
  | "quantidade"
  | "faturamento"
  | "cmv"
  | "comissao"
  | "taxaFixa"
  | "descontos"
  | "outrosCustos"
  | "impostos"
  | "lucroLiquido"
  | "margem";

interface Ordenacao {
  campo: CampoOrdenacao;
  direcao: "asc" | "desc";
}

function valorOrdenavel(p: Pedido, campo: CampoOrdenacao): number {
  switch (campo) {
    case "data":
      return new Date(p.data).getTime();
    case "quantidade":
      return p.quantidade;
    case "faturamento":
      return p.faturamento;
    case "cmv":
      return p.cmv;
    case "comissao":
      return p.comissao;
    case "taxaFixa":
      return p.taxaFixa;
    case "descontos":
      return p.descontos;
    case "outrosCustos":
      return p.outrosCustos;
    case "impostos":
      return p.impostos;
    case "lucroLiquido":
      return p.lucroLiquido;
    case "margem":
      return p.margem;
  }
}

/** Cabeçalho de coluna clicável: 1º clique ordena crescente (seta pra cima),
 * 2º clique inverte pra decrescente (seta pra baixo), 3º clique volta ao
 * normal (sem ordenação, seta neutra). */
function CabecalhoOrdenavel({
  campo,
  ordenacao,
  onClick,
  className,
  children,
}: {
  campo: CampoOrdenacao;
  ordenacao: Ordenacao | null;
  onClick: (campo: CampoOrdenacao) => void;
  className?: string;
  children: ReactNode;
}) {
  const ativo = ordenacao?.campo === campo;
  return (
    <th className={className}>
      <button
        type="button"
        onClick={() => onClick(campo)}
        className={cn(
          "inline-flex items-center gap-1 font-bold uppercase tracking-wide transition-colors hover:text-foreground",
          ativo ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {children}
        {ativo && ordenacao.direcao === "asc" ? (
          <ArrowUp className="size-3" />
        ) : ativo && ordenacao.direcao === "desc" ? (
          <ArrowDown className="size-3" />
        ) : (
          <ArrowUpDown className="size-3 opacity-40" />
        )}
      </button>
    </th>
  );
}

function Vendas() {
  const { periodo } = usePeriodo();
  const { filtrarPorSelecao } = useSelecaoContas();
  const { contas } = useConfiguracoes();
  const [faixaMargem, setFaixaMargem] = useState<FaixaSaudeMargem | "todas">("todas");
  const [status, setStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao | null>(null);
  const [selecionado, setSelecionado] = useState<Pedido | null>(null);

  const contaPorId = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas]);

  function alternarOrdenacao(campo: CampoOrdenacao) {
    setOrdenacao((atual) => {
      if (!atual || atual.campo !== campo) return { campo, direcao: "asc" };
      if (atual.direcao === "asc") return { campo, direcao: "desc" };
      return null;
    });
  }

  const pedidos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const doPeriodo = filtrarPorPeriodo(filtrarPorSelecao(vendasService.listar()), periodo);
    return doPeriodo.filter((p) => {
      if (status !== "todos" && p.status !== status) return false;
      if (faixaMargem !== "todas") {
        const conta = contaPorId.get(p.contaId);
        const faixa = classificarFaixa(p.margem, conta?.metas ?? null, false);
        if (faixa !== faixaMargem) return false;
      }
      if (
        termo &&
        ![p.sku, p.produto, p.id, p.cliente].some((c) => c.toLowerCase().includes(termo))
      )
        return false;
      return true;
    });
  }, [periodo, faixaMargem, status, busca, filtrarPorSelecao, contaPorId]);

  const pedidosOrdenados = useMemo(() => {
    if (!ordenacao) return pedidos;
    const { campo, direcao } = ordenacao;
    const sinal = direcao === "asc" ? 1 : -1;
    return [...pedidos].sort((a, b) => (valorOrdenavel(a, campo) - valorOrdenavel(b, campo)) * sinal);
  }, [pedidos, ordenacao]);

  const resumo = resumir(pedidos);
  const visiveis = pedidosOrdenados.slice(0, 100);

  // Devolução é diferente de cancelado: a venda foi concluída e entregue, e
  // só DEPOIS o cliente devolveu o produto e pediu o dinheiro de volta.
  const devolucoes = useMemo(() => {
    const comDevolucao = pedidos.filter((p) => p.valorDevolvido > 0);
    return {
      quantidade: comDevolucao.length,
      valor: comDevolucao.reduce((s, p) => s + p.valorDevolvido, 0),
    };
  }, [pedidos]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <CardKpi titulo="Faturamento" valor={formatBRL(resumo.faturamento)} />
        <CardKpi titulo="Pedidos" valor={String(resumo.pedidos)} detalhe={`Ticket médio: ${formatBRL(resumo.ticketMedio)}`} />
        <CardKpi titulo="Lucro líquido" valor={formatBRL(resumo.lucroLiquido)} destaque />
        <CardKpi titulo="Margem líquida" valor={formatPercentual(resumo.margem)} />
        <CardKpi titulo="CMV" valor={formatBRL(resumo.cmv)} />
        <CardKpi titulo="Comissão" valor={formatBRL(resumo.comissoes)} />
        <CardKpi titulo="Cancelados" valor={String(resumo.pedidosCancelados)} />
        <CardKpi titulo="Vendas canceladas" valor={formatBRL(resumo.valorCancelado)} />
        <CardKpi
          titulo="Devoluções"
          valor={formatBRL(devolucoes.valor)}
          detalhe={`${devolucoes.quantidade} pedido${devolucoes.quantidade === 1 ? "" : "s"}`}
        />
      </div>

      <Painel
        titulo="Pedidos"
        descricao={`${pedidos.length} pedidos entre ${formatData(periodo.inicio)} e ${formatData(periodo.fim)} · clique numa linha para ver o detalhamento`}
        acoes={
          <ExportarDados
            nomeArquivo="vendas"
            linhas={pedidosOrdenados.map((p) => ({
              Data: formatData(p.data),
              Pedido: p.id,
              Marketplace: p.marketplaceId,
              Conta: contaPorId.get(p.contaId)?.nome ?? "—",
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
          <Select
            value={faixaMargem}
            onValueChange={(v) => setFaixaMargem(v as FaixaSaudeMargem | "todas")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Faixa de margem" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as faixas de margem</SelectItem>
              {ORDEM_FAIXAS_MARGEM.map((f) => (
                <SelectItem key={f} value={f}>
                  {ROTULO_FAIXA_MARGEM[f]}
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
          <table className="w-full min-w-[1560px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <CabecalhoOrdenavel campo="data" ordenacao={ordenacao} onClick={alternarOrdenacao} className="px-4 py-3">
                  Data
                </CabecalhoOrdenavel>
                <th className="px-4 py-3 font-bold">Pedido</th>
                <th className="px-4 py-3 font-bold">Canal</th>
                <th className="px-4 py-3 font-bold">Produto / SKU</th>
                <CabecalhoOrdenavel campo="quantidade" ordenacao={ordenacao} onClick={alternarOrdenacao} className="px-4 py-3 text-center">
                  Qtd
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel campo="faturamento" ordenacao={ordenacao} onClick={alternarOrdenacao} className="px-4 py-3 text-right">
                  Faturamento
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel campo="cmv" ordenacao={ordenacao} onClick={alternarOrdenacao} className="px-4 py-3 text-right">
                  CMV
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel campo="comissao" ordenacao={ordenacao} onClick={alternarOrdenacao} className="px-4 py-3 text-right">
                  Comissão
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel campo="taxaFixa" ordenacao={ordenacao} onClick={alternarOrdenacao} className="px-4 py-3 text-right">
                  Taxa fixa
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel campo="descontos" ordenacao={ordenacao} onClick={alternarOrdenacao} className="px-4 py-3 text-right">
                  Desconto
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel campo="outrosCustos" ordenacao={ordenacao} onClick={alternarOrdenacao} className="px-4 py-3 text-right">
                  Outros custos
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel campo="impostos" ordenacao={ordenacao} onClick={alternarOrdenacao} className="px-4 py-3 text-right">
                  Impostos
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel campo="lucroLiquido" ordenacao={ordenacao} onClick={alternarOrdenacao} className="px-4 py-3 text-right">
                  Lucro
                </CabecalhoOrdenavel>
                <CabecalhoOrdenavel campo="margem" ordenacao={ordenacao} onClick={alternarOrdenacao} className="px-4 py-3 text-center">
                  Margem
                </CabecalhoOrdenavel>
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
                    <p className="mt-1 truncate text-[10px] text-muted-foreground">
                      {contaPorId.get(p.contaId)?.nome ?? "—"}
                    </p>
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
                    {formatBRL(p.taxaFixa)}
                  </td>
                  <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatBRL(p.descontos)}
                  </td>
                  <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                    {formatBRL(p.outrosCustos)}
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
            Mostrando os 100 primeiros de {pedidos.length} pedidos
            {ordenacao ? "" : " (mais recentes primeiro)"}. Use os filtros ou a ordenação das
            colunas para refinar.
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
