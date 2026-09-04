import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Mail, MessageCircle } from "lucide-react";
import { recuperacaoService } from "@/services";
import { useSelecaoContas } from "@/context/selecao-contas";
import { getMarketplace } from "@/data/mock";
import { formatBRL, formatDataHora, formatPercentual } from "@/lib/format";
import { CardKpi, Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import type {
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
          "Recupere pedidos não pagos, cancelados ou pendentes falando direto com o cliente por WhatsApp ou e-mail.",
      },
      { property: "og:title", content: "Recuperação de vendas | NEXO Rentabilidade" },
      {
        property: "og:description",
        content:
          "Gestão de oportunidades de recuperação de vendas com contato direto ao cliente.",
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

/** Vermelho enquanto ninguém tocou na oportunidade, verde assim que o contato
 * foi feito. São os dois únicos estados possíveis: se o cliente vai pagar ou
 * não, isso o sistema não tem como saber sem integração real com o canal. */
const ROTULO_STATUS: Record<StatusOportunidadeRecuperacao, { texto: string; cor: string }> = {
  "aguardando-acao": { texto: "Aguardando ação", cor: "bg-loss-soft text-loss" },
  "mensagem-enviada": { texto: "Mensagem enviada", cor: "bg-profit-soft text-profit" },
};

type CanalContato = "whatsapp" | "email";

/** (11) 98765-4321 -> 5511987654321, formato que o link do WhatsApp espera. */
function telefoneParaWhatsApp(telefone: string) {
  return `55${telefone.replace(/\D/g, "")}`;
}

function montarMensagemWhatsApp(o: OportunidadeRecuperacao) {
  const canal = getMarketplace(o.marketplaceId).nome;
  return `Olá, ${o.cliente}! Tudo bem?

Aqui é da loja no ${canal}. Vi que o seu pedido ${o.pedidoId} (${o.produto}), no valor de ${formatBRL(o.valor)}, ficou com o pagamento pendente — o status por aqui está como "${ROTULO_TIPO[o.tipo]}".

Se tiver acontecido algum problema no pagamento ou se ficou alguma dúvida sobre o produto, me chama por aqui que eu te ajudo a finalizar.

Obrigado!`;
}

function montarAssuntoEmail(o: OportunidadeRecuperacao) {
  return `Sobre o seu pedido ${o.pedidoId} - ${o.produto}`;
}

function montarCorpoEmail(o: OportunidadeRecuperacao) {
  const canal = getMarketplace(o.marketplaceId).nome;
  return `Olá, ${o.cliente}!

Aqui é da loja no ${canal}. Vi que o seu pedido ${o.pedidoId} (${o.produto}), no valor de ${formatBRL(o.valor)}, ficou com o pagamento pendente — o status por aqui está como "${ROTULO_TIPO[o.tipo]}".

Se tiver acontecido algum problema no pagamento ou se ficou alguma dúvida sobre o produto, é só responder este e-mail que a gente te ajuda a finalizar a compra.

Obrigado!`;
}

function Recuperacao() {
  const { filtrarPorSelecao } = useSelecaoContas();
  const oportunidadesBase = filtrarPorSelecao(recuperacaoService.listar());

  const [status, setStatus] = useState<"todos" | StatusOportunidadeRecuperacao>("todos");
  const [tipo, setTipo] = useState<"todos" | TipoOportunidadeRecuperacao>("todos");
  const [busca, setBusca] = useState("");
  const [estados, setEstados] = useState<Record<string, StatusOportunidadeRecuperacao>>(() =>
    Object.fromEntries(oportunidadesBase.map((o) => [o.id, o.status])),
  );
  const [contato, setContato] = useState<{
    oportunidade: OportunidadeRecuperacao;
    canal: CanalContato;
  } | null>(null);

  const oportunidades = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return oportunidadesBase.filter((o) => {
      if (status !== "todos" && (estados[o.id] ?? o.status) !== status) return false;
      if (tipo !== "todos" && o.tipo !== tipo) return false;
      if (
        termo &&
        ![o.cliente, o.pedidoId, o.id, o.sku, o.produto].some((c) =>
          c.toLowerCase().includes(termo),
        )
      )
        return false;
      return true;
    });
  }, [oportunidadesBase, status, tipo, busca, estados]);

  const totalRecuperar = oportunidadesBase.reduce((acc, o) => acc + o.valor, 0);
  const contatadas = oportunidadesBase.filter(
    (o) => (estados[o.id] ?? o.status) === "mensagem-enviada",
  );
  // Valor que já está sendo trabalhado: mensagem foi mandada, resposta do
  // cliente é o que falta. Não é "recuperado" — isso a gente não tem como saber.
  const emTentativa = contatadas.reduce((acc, o) => acc + o.valor, 0);
  const taxaContato = oportunidadesBase.length
    ? contatadas.length / oportunidadesBase.length
    : 0;
  const aguardando = oportunidadesBase.filter(
    (o) => (estados[o.id] ?? o.status) === "aguardando-acao",
  ).length;

  const marcarContatado = (o: OportunidadeRecuperacao) => {
    setEstados((atual) => ({ ...atual, [o.id]: "mensagem-enviada" }));
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Vendas a recuperar"
          valor={formatBRL(totalRecuperar)}
          detalhe={`Sem contato ainda: ${formatBRL(totalRecuperar - emTentativa)}`}
        />
        <CardKpi
          titulo="Em tentativa de recuperação"
          valor={formatBRL(emTentativa)}
          destaque
          dica="Valor dos pedidos em que a mensagem já foi enviada e a resposta do cliente ainda está pendente."
        />
        <CardKpi
          titulo="Taxa de contato"
          valor={formatPercentual(taxaContato)}
          detalhe={`${contatadas.length} de ${oportunidadesBase.length} oportunidades`}
        />
        <CardKpi
          titulo="Pedidos pendentes"
          valor={`${aguardando}`}
          detalhe="Ainda sem nenhum contato feito"
        />
      </div>

      <Painel
        titulo="Oportunidades de recuperação"
        descricao="Ações rápidas para retomar pedidos que não foram concluídos"
      >
        <div className="grid gap-3 border-b p-4 md:grid-cols-3">
          <Input
            placeholder="Buscar por cliente, pedido ou SKU"
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
                      <span className="text-xs text-muted-foreground">{ROTULO_TIPO[o.tipo]}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="num text-xs text-muted-foreground">{o.tempoRestante}</span>
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
                    <td className="px-4 py-3">
                      {/* Os dois botões ficam sempre visíveis: dá pra chamar no
                          WhatsApp, mandar e-mail, ou repetir o contato depois. */}
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 border-profit/40 text-profit hover:bg-profit-soft"
                          onClick={() => setContato({ oportunidade: o, canal: "whatsapp" })}
                        >
                          <MessageCircle className="size-3.5" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => setContato({ oportunidade: o, canal: "email" })}
                        >
                          <Mail className="size-3.5" />
                          <span className="hidden sm:inline">E-mail</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Painel>

      <DialogContato
        contato={contato}
        onFechar={() => setContato(null)}
        onContatado={marcarContatado}
      />
    </div>
  );
}

/**
 * Uma janela por canal. Nada é enviado pelo sistema: o botão só abre o
 * WhatsApp ou o programa de e-mail do próprio seller já preenchido, e quem
 * aperta "enviar" é ele. Por isso não tem custo de API nenhum.
 */
function DialogContato({
  contato,
  onFechar,
  onContatado,
}: {
  contato: { oportunidade: OportunidadeRecuperacao; canal: CanalContato } | null;
  onFechar: () => void;
  onContatado: (o: OportunidadeRecuperacao) => void;
}) {
  const [mensagem, setMensagem] = useState("");
  const [assunto, setAssunto] = useState("");
  const [emailCliente, setEmailCliente] = useState("");

  // Recarrega o texto sempre que abrir outra oportunidade ou trocar de canal.
  useEffect(() => {
    if (!contato) return;
    const { oportunidade, canal } = contato;
    if (canal === "whatsapp") {
      setMensagem(montarMensagemWhatsApp(oportunidade));
    } else {
      setAssunto(montarAssuntoEmail(oportunidade));
      setMensagem(montarCorpoEmail(oportunidade));
      setEmailCliente("");
    }
  }, [contato]);

  if (!contato) return null;

  const { oportunidade: o, canal } = contato;
  const ehWhatsApp = canal === "whatsapp";

  const abrirWhatsApp = () => {
    const link = `https://wa.me/${telefoneParaWhatsApp(o.telefone)}?text=${encodeURIComponent(mensagem)}`;
    window.open(link, "_blank", "noopener,noreferrer");
    onContatado(o);
    toast.success("WhatsApp aberto com a mensagem pronta", {
      description: `${o.cliente} • pedido ${o.pedidoId}`,
    });
    onFechar();
  };

  const abrirEmail = () => {
    const link = `mailto:${emailCliente}?subject=${encodeURIComponent(
      assunto,
    )}&body=${encodeURIComponent(mensagem)}`;
    window.location.href = link;
    onContatado(o);
    toast.success("E-mail preparado no seu programa de e-mail", {
      description: `${o.cliente} • pedido ${o.pedidoId}`,
    });
    onFechar();
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {ehWhatsApp ? (
              <MessageCircle className="size-4 text-profit" />
            ) : (
              <Mail className="size-4 text-brand" />
            )}
            {ehWhatsApp ? "Falar no WhatsApp" : "Enviar e-mail"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">{o.cliente}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="num text-xs">{o.pedidoId}</span>
                <SeloMarketplace id={o.marketplaceId} />
                <span className="text-xs text-muted-foreground">
                  {ROTULO_TIPO[o.tipo]} · {formatBRL(o.valor)}
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground">
                {o.produto} <span className="num">({o.sku})</span>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {ehWhatsApp ? (
            <div className="space-y-1.5">
              <Label className="text-xs">Telefone do cliente</Label>
              <div className="num flex h-9 items-center rounded-md border bg-muted/40 px-3 text-xs">
                {o.telefone}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="email-cliente" className="text-xs">
                  E-mail do cliente
                </Label>
                <Input
                  id="email-cliente"
                  type="email"
                  placeholder="cliente@email.com"
                  value={emailCliente}
                  onChange={(e) => setEmailCliente(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assunto-email" className="text-xs">
                  Assunto
                </Label>
                <Input
                  id="assunto-email"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="mensagem-contato" className="text-xs">
              Mensagem (já preenchida, pode editar)
            </Label>
            <Textarea
              id="mensagem-contato"
              value={mensagem}
              onChange={(e) => setMensagem(e.target.value)}
              rows={10}
              className="resize-none text-xs leading-relaxed"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFechar}>
            Cancelar
          </Button>
          {ehWhatsApp ? (
            <Button onClick={abrirWhatsApp} className="gap-2">
              <MessageCircle className="size-3.5" />
              Abrir WhatsApp
            </Button>
          ) : (
            <Button onClick={abrirEmail} disabled={!emailCliente.trim()} className="gap-2">
              <Mail className="size-3.5" />
              Abrir e-mail
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
