import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Mail, MessageCircle, Send, Smartphone } from "lucide-react";
import { recuperacaoService } from "@/services";
import { useSelecaoContas } from "@/context/selecao-contas";
import { MARKETPLACES } from "@/data/mock";
import { formatBRL, formatDataHora, formatPercentual } from "@/lib/format";
import { CardKpi, Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type {
  CanalRecuperacao,
  OportunidadeRecuperacao,
  StatusOportunidadeRecuperacao,
  TipoOportunidadeRecuperacao,
} from "@/types";

export const Route = createFileRoute("/recuperacao")({
  head: () => ({
    meta: [
      { title: "Recuperação de vendas | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "Recupere pedidos não pagos, cancelados ou pendentes com lembretes rápidos por WhatsApp, e-mail e SMS.",
      },
      { property: "og:title", content: "Recuperação de vendas | NEXO Rentabilidade" },
      {
        property: "og:description",
        content:
          "Gestão de oportunidades de recuperação de vendas com ações rápidas por canal.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Recuperacao,
});

const ROTULO_TIPO: Record<TipoOportunidadeRecuperacao, string> = {
  "boleto-pendente": "Boleto Pendente",
  "pix-nao-pago": "PIX Não Pago",
  "cancelamento-solicitado": "Cancelamento Solicitado",
};

const ROTULO_STATUS: Record<StatusOportunidadeRecuperacao, { texto: string; cor: string }> = {
  "aguardando-acao": { texto: "Aguardando ação", cor: "bg-warning-soft text-foreground" },
  "mensagem-enviada": { texto: "Mensagem enviada", cor: "bg-info-soft text-info" },
  recuperado: { texto: "Recuperado", cor: "bg-profit-soft text-profit" },
};

const ICONE_CANAL: Record<CanalRecuperacao, React.ElementType> = {
  whatsapp: MessageCircle,
  email: Mail,
  sms: Smartphone,
};

function Recuperacao() {
  const { filtrarPorSelecao } = useSelecaoContas();
  const oportunidadesBase = filtrarPorSelecao(recuperacaoService.listar());

  const [status, setStatus] = useState<"todos" | StatusOportunidadeRecuperacao>("todos");
  const [tipo, setTipo] = useState<"todos" | TipoOportunidadeRecuperacao>("todos");
  const [busca, setBusca] = useState("");
  const [estados, setEstados] = useState<Record<string, StatusOportunidadeRecuperacao>>(() =>
    Object.fromEntries(oportunidadesBase.map((o) => [o.id, o.status])),
  );

  const oportunidades = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return oportunidadesBase.filter((o) => {
      if (status !== "todos" && (estados[o.id] ?? o.status) !== status) return false;
      if (tipo !== "todos" && o.tipo !== tipo) return false;
      if (
        termo &&
        ![o.cliente, o.pedidoId, o.id].some((c) => c.toLowerCase().includes(termo))
      )
        return false;
      return true;
    });
  }, [oportunidadesBase, status, tipo, busca, estados]);

  const totalRecuperar = oportunidadesBase.reduce((acc, o) => acc + o.valor, 0);
  const recuperadoMes = oportunidadesBase
    .filter((o) => (estados[o.id] ?? o.status) === "recuperado")
    .reduce((acc, o) => acc + o.valor, 0);
  const taxaConversao = totalRecuperar ? recuperadoMes / totalRecuperar : 0;
  const pendentes = oportunidadesBase.filter(
    (o) => {
      const st = estados[o.id] ?? o.status;
      return st === "aguardando-acao" || st === "mensagem-enviada";
    },
  ).length;

  const enviarLembrete = (o: OportunidadeRecuperacao) => {
    setEstados((atual) => ({
      ...atual,
      [o.id]: atual[o.id] === "recuperado" ? "recuperado" : "mensagem-enviada",
    }));
    toast.success(
      `Lembrete enviado para ${o.cliente} sobre o pedido ${o.pedidoId} via ${o.canal}.`,
    );
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Vendas a recuperar"
          valor={formatBRL(totalRecuperar)}
          detalhe={`Em aberto: ${formatBRL(totalRecuperar - recuperadoMes)}`}
        />
        <CardKpi
          titulo="Total recuperado no mês"
          valor={formatBRL(recuperadoMes)}
          destaque
          dica="Soma dos pedidos que voltaram a ser pagos após ação de recuperação."
        />
        <CardKpi
          titulo="Taxa de conversão de recuperação"
          valor={formatPercentual(taxaConversao)}
          detalhe={`${oportunidadesBase.filter((o) => (estados[o.id] ?? o.status) === "recuperado").length} de ${oportunidadesBase.length} oportunidades`}
        />
        <CardKpi
          titulo="Pedidos pendentes"
          valor={`${pendentes}`}
          detalhe="Aguardando ação ou mensagem já enviada"
        />
      </div>

      <Painel
        titulo="Oportunidades de recuperação"
        descricao="Ações rápidas para retomar pedidos que não foram concluídos"
      >
        <div className="grid gap-3 border-b p-4 md:grid-cols-3">
          <Input
            placeholder="Buscar por cliente ou pedido"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              <SelectItem value="aguardando-acao">Aguardando ação</SelectItem>
              <SelectItem value="mensagem-enviada">Mensagem enviada</SelectItem>
              <SelectItem value="recuperado">Recuperado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os tipos</SelectItem>
              <SelectItem value="boleto-pendente">Boleto Pendente</SelectItem>
              <SelectItem value="pix-nao-pago">PIX Não Pago</SelectItem>
              <SelectItem value="cancelamento-solicitado">Cancelamento Solicitado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-bold">Cliente / Pedido</th>
                <th className="px-4 py-3 font-bold">Marketplace</th>
                <th className="px-4 py-3 text-right font-bold">Valor (R$)</th>
                <th className="px-4 py-3 font-bold">Tipo</th>
                <th className="px-4 py-3 font-bold">Tempo restante</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 text-right font-bold">Ação direta</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {oportunidades.map((o) => {
                const statusAtual = estados[o.id] ?? o.status;
                const s = ROTULO_STATUS[statusAtual];
                const IconeCanal = ICONE_CANAL[o.canal];
                return (
                  <tr key={o.id} className="transition-colors hover:bg-muted/40">
                    <td className="max-w-[260px] px-4 py-3">
                      <p className="truncate text-xs font-medium">{o.cliente}</p>
                      <p className="num text-[10px] text-muted-foreground">
                        {o.pedidoId} · {o.id}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {formatDataHora(o.dataCriacao)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <SeloMarketplace id={o.marketplaceId} />
                    </td>
                    <td className="num px-4 py-3 text-right text-xs font-semibold">
                      {formatBRL(o.valor)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">
                        {ROTULO_TIPO[o.tipo]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="num text-xs text-muted-foreground">
                        {statusAtual === "recuperado" ? "—" : o.tempoRestante}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wide",
                          s.cor,
                        )}
                      >
                        {s.texto}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        variant={statusAtual === "recuperado" ? "outline" : "default"}
                        disabled={statusAtual === "recuperado"}
                        onClick={() => enviarLembrete(o)}
                        className="gap-1.5"
                      >
                        <IconeCanal className="size-3.5" />
                        <Send className="size-3" />
                        <span className="hidden sm:inline">
                          {statusAtual === "mensagem-enviada" ? "Reenviar" : "Enviar lembrete"}
                        </span>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Painel>
    </div>
  );
}
