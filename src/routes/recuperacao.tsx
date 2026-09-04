import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
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

/** Desenho oficial do WhatsApp — o lucide-react não tem ícone de marca, só
 * ícones genéricos, então esse é um SVG próprio (fill = currentColor, mesma
 * lógica dos ícones do lucide, então herda o "size-*" e a cor do texto). */
function IconeWhatsApp({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413" />
    </svg>
  );
}

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
                          className="gap-1.5 bg-profit text-white hover:bg-profit/90"
                          onClick={() => setContato({ oportunidade: o, canal: "whatsapp" })}
                        >
                          <IconeWhatsApp className="size-3.5" />
                          <span className="hidden sm:inline">WhatsApp</span>
                        </Button>
                        <Button
                          size="sm"
                          className="gap-1.5 bg-info text-white hover:bg-info/90"
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
              <IconeWhatsApp className="size-4 text-profit" />
            ) : (
              <Mail className="size-4 text-info" />
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
            <Button
              onClick={abrirWhatsApp}
              className="gap-2 bg-profit text-white hover:bg-profit/90"
            >
              <IconeWhatsApp className="size-3.5" />
              Abrir WhatsApp
            </Button>
          ) : (
            <Button
              onClick={abrirEmail}
              disabled={!emailCliente.trim()}
              className="gap-2 bg-info text-white hover:bg-info/90"
            >
              <Mail className="size-3.5" />
              Abrir e-mail
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
