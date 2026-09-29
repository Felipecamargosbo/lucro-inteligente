// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Check,
  Clock,
  FileText,
  Loader2,
  MessageCircle,
  Package,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { AlvoFicha } from "./ModalFicha";
import {
  ROTULO_CATEGORIA_SAC,
  ROTULO_SITUACAO_SAC,
  camposPreenchidosSac,
  classificarPergunta,
  frasesProibidasNoTexto,
  perguntasRepetidas,
  preencherModelo,
  situacaoDoPedido,
  type PerguntaRepetida,
} from "@/lib/sac";
import type {
  CategoriaSac,
  ConfiguracaoSac,
  Pedido,
  SituacaoSac,
  StatusSugestao,
  TicketSac,
} from "@/types";
import type { Aba } from "./comum";

const NOME_SAC = "Agente de SAC";

const ROTULO_TOM = { formal: "Formal", neutro: "Neutro", descontraido: "Descontraído" } as const;

const ESTILO_CATEGORIA: Record<CategoriaSac, string> = {
  "pre-venda": "bg-brand/15 text-brand",
  "pos-venda": "bg-warning-soft text-warning",
  reclamacao: "bg-loss-soft text-loss",
};

const ROTULO_STATUS_PEDIDO: Record<Pedido["status"], string> = {
  entregue: "Entregue",
  "em-transito": "Em trânsito",
  "aguardando-envio": "Aguardando envio",
  cancelado: "Cancelado",
};

type Decidir = (
  t: TicketSac,
  status: Extract<StatusSugestao, "aprovada" | "recusada">,
  textoFinal?: string,
) => void;

/** O aviso que aparece depois de o seller editar e aprovar uma mensagem. */
type Aviso =
  | {
      tipo: "aprender";
      ticket: TicketSac;
      original: string;
      editada: string;
      etapa: "perguntar" | "analisando" | "confirmar";
      regra: string;
    }
  | { tipo: "modelo"; situacao: SituacaoSac; texto: string };

/**
 * O painel de SAC. Cada mensagem de cliente é classificada sem IA:
 * - pré-venda: a IA sugere a resposta, já com o tom, a política, a ficha
 *   do produto e as regras que o seller ensinou;
 * - pós-venda: mensagem pronta pela situação do pedido (não gasta token);
 * - reclamação: em vermelho, o seller responde (a IA só faz rascunho se
 *   ele pedir).
 * Quando o seller edita uma resposta, o SAC pergunta se deve aprender
 * com a edição. E perguntas repetidas sobre o mesmo produto viram
 * sugestão pro Agente Criativo completar o anúncio.
 */
export function PainelSac({
  tickets,
  carregando,
  gerandoId,
  rascunhos,
  aoMudarRascunho,
  aoGerar,
  aoDecidir,
  config,
  regrasAtivas,
  fichas,
  modelos,
  buscarPedido,
  aoAprender,
  aoSalvarRegra,
  aoSalvarModelo,
  aoEnviarParaCriativo,
  aoAbrirFicha,
}: {
  tickets: TicketSac[];
  carregando: boolean;
  gerandoId: string | null;
  rascunhos: Record<string, string>;
  aoMudarRascunho: (id: string, texto: string) => void;
  aoGerar: (t: TicketSac) => void;
  aoDecidir: Decidir;
  config: ConfiguracaoSac;
  regrasAtivas: number;
  fichas: Map<string, string>;
  modelos: Record<SituacaoSac, string>;
  buscarPedido: (id: string) => Pedido | null;
  aoAprender: (t: TicketSac, original: string, editada: string) => Promise<string | null>;
  aoSalvarRegra: (regra: string) => Promise<void>;
  aoSalvarModelo: (situacao: SituacaoSac, texto: string) => Promise<void>;
  aoEnviarParaCriativo: (g: PerguntaRepetida) => Promise<void>;
  /** Abre a janela da ficha do produto (a mesma do Criativo) */
  aoAbrirFicha: (alvo: AlvoFicha) => void;
}) {
  const [aba, setAba] = useState<Aba>("operacao");
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [enviadosCriativo, setEnviadosCriativo] = useState<Set<string>>(new Set());
  const pendentes = tickets.filter((t) => t.status === "pendente");
  const decididos = tickets.filter((t) => t.status !== "pendente");
  const lista = aba === "operacao" ? pendentes : decididos;

  const contagem = useMemo(() => {
    const c: Record<CategoriaSac, number> = { "pre-venda": 0, "pos-venda": 0, reclamacao: 0 };
    for (const t of pendentes) c[classificarPergunta(t.pergunta, t.pedidoId)]++;
    return c;
  }, [pendentes]);
  const repetidas = useMemo(
    () => perguntasRepetidas(tickets).filter((g) => !enviadosCriativo.has(g.chave)),
    [tickets, enviadosCriativo],
  );

  // Aprovar com edição: pergunta se deve aprender (IA) ou salvar a
  // mensagem pronta como padrão (pós-venda).
  const decidirComAprendizado: Decidir = (t, status, textoFinal) => {
    aoDecidir(t, status, textoFinal);
    if (status !== "aprovada") return;
    const categoria = classificarPergunta(t.pergunta, t.pedidoId);
    const pedido = t.pedidoId ? buscarPedido(t.pedidoId) : null;
    const situacao = categoria === "pos-venda" ? situacaoDoPedido(pedido) : null;
    const editada = (textoFinal ?? rascunhos[t.id] ?? t.resposta ?? "").trim();

    if (situacao && !t.resposta) {
      const padrao = preencherModelo(modelos[situacao], {
        cliente: t.cliente,
        pedido: t.pedidoId,
        produto: t.produto,
        assinatura: config.assinatura,
      });
      if (editada && editada !== padrao.trim()) {
        setAviso({ tipo: "modelo", situacao, texto: voltarParaModelo(editada, t, config) });
      }
      return;
    }
    if (t.resposta && editada && editada !== t.resposta.trim()) {
      setAviso({
        tipo: "aprender",
        ticket: t,
        original: t.resposta,
        editada,
        etapa: "perguntar",
        regra: "",
      });
    }
  };

  return (
    <Painel
      titulo="SAC"
      descricao="Mensagens de cliente — a IA sugere, você decide"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <MessageCircle className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{NOME_SAC}</p>
          <p className="text-[10px] text-muted-foreground">
            Separa pré-venda, pós-venda e reclamação; enviar ainda é manual até a API de mensagens
            conectar
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      {/* O que o SAC está usando pra responder */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b px-4 py-2 text-[10px] text-muted-foreground">
        <span>
          Tom: <strong className="text-foreground">{ROTULO_TOM[config.tom]}</strong>
        </span>
        <span>
          Personalização:{" "}
          <strong className="text-foreground">{camposPreenchidosSac(config)} de 5</strong> campos
        </span>
        <span>
          Regras ativas: <strong className="text-foreground">{regrasAtivas}</strong>
        </span>
        <span>
          Fichas de produto: <strong className="text-foreground">{fichas.size}</strong>
        </span>
        <span className="italic">Ajuste em Configurações › Atendimento (SAC)</span>
      </div>

      <div className="grid grid-cols-3 gap-3 border-b p-4">
        {(["pre-venda", "pos-venda", "reclamacao"] as const).map((c) => (
          <div key={c} className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {ROTULO_CATEGORIA_SAC[c]}
            </p>
            <p
              className={cn(
                "num text-lg font-bold",
                c === "reclamacao" && contagem[c] > 0 && "text-loss",
              )}
            >
              {contagem[c]}
            </p>
          </div>
        ))}
      </div>

      {aviso && (
        <PainelAviso
          aviso={aviso}
          aoMudar={setAviso}
          aoFechar={() => setAviso(null)}
          aoAprender={aoAprender}
          aoSalvarRegra={aoSalvarRegra}
          aoSalvarModelo={aoSalvarModelo}
        />
      )}

      {aba === "operacao" &&
        repetidas.map((g) => (
          <div
            key={g.chave}
            className="flex flex-wrap items-start gap-3 border-b bg-warning-soft/40 px-4 py-3"
          >
            <Wand2 className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold">
                {g.quantidade} clientes perguntaram sobre {g.assunto} — {g.produto}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Quando a mesma dúvida se repete, o anúncio provavelmente não explica isso. Ex.:{" "}
                {g.exemplos.map((e) => `"${e}"`).join(" · ")}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await aoEnviarParaCriativo(g);
                setEnviadosCriativo((atual) => new Set(atual).add(g.chave));
              }}
            >
              <Wand2 className="size-3.5" />
              Levar pro Criativo
            </Button>
          </div>
        ))}

      <div className="flex gap-1 border-b px-4 pt-3">
        {(
          [
            ["operacao", `Operação (${pendentes.length})`],
            ["historico", `Histórico (${decididos.length})`],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
              aba === id
                ? "border-b-2 border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="divide-y">
        {carregando && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Carregando mensagens...
          </div>
        )}

        {!carregando &&
          lista.map((t) => (
            <CardTicketSac
              key={t.id}
              ticket={t}
              pedido={t.pedidoId ? buscarPedido(t.pedidoId) : null}
              config={config}
              temFicha={fichas.has(t.sku)}
              aoAbrirFicha={() => aoAbrirFicha({ sku: t.sku, produto: t.produto })}
              regrasAtivas={regrasAtivas}
              modelos={modelos}
              gerando={gerandoId === t.id}
              rascunho={rascunhos[t.id]}
              aoMudarRascunho={(texto) => aoMudarRascunho(t.id, texto)}
              aoGerar={() => aoGerar(t)}
              aoDecidir={(status, texto) => decidirComAprendizado(t, status, texto)}
            />
          ))}

        {!carregando && lista.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-muted-foreground">
              {aba === "operacao"
                ? "Nenhuma mensagem pendente agora."
                : "Nenhuma decisão registrada ainda."}
            </p>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        As mensagens dos clientes ainda são de exemplo — não há API de mensagens conectada. A
        classificação e as mensagens prontas de pós-venda não usam IA (não gastam token); a resposta
        de pré-venda, essa é gerada de verdade por IA quando você pede.
      </div>
    </Painel>
  );
}

/** Transforma a mensagem editada de volta em modelo: troca o nome do
 * cliente, o pedido, o produto e a assinatura pelos campos {…}. */
function voltarParaModelo(texto: string, t: TicketSac, config: ConfiguracaoSac): string {
  let modelo = texto;
  if (t.pedidoId) modelo = modelo.replaceAll(t.pedidoId, "{pedido}");
  if (t.produto) modelo = modelo.replaceAll(t.produto, "{produto}");
  if (config.assinatura.trim()) modelo = modelo.replaceAll(config.assinatura.trim(), "{assinatura}");
  const nome = t.cliente?.split(" ")[0];
  if (nome) modelo = modelo.replaceAll(nome, "{cliente}");
  return modelo;
}

/* ------------------------------------------------------------------ */
/* Aviso depois de editar: aprender ou salvar como padrão               */
/* ------------------------------------------------------------------ */

function PainelAviso({
  aviso,
  aoMudar,
  aoFechar,
  aoAprender,
  aoSalvarRegra,
  aoSalvarModelo,
}: {
  aviso: Aviso;
  aoMudar: (a: Aviso) => void;
  aoFechar: () => void;
  aoAprender: (t: TicketSac, original: string, editada: string) => Promise<string | null>;
  aoSalvarRegra: (regra: string) => Promise<void>;
  aoSalvarModelo: (situacao: SituacaoSac, texto: string) => Promise<void>;
}) {
  if (aviso.tipo === "modelo") {
    return (
      <div className="border-b border-brand/40 bg-brand/5 px-4 py-3">
        <p className="text-xs font-semibold">
          Você editou a mensagem pronta de "{ROTULO_SITUACAO_SAC[aviso.situacao]}".
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Quer salvar essa versão como padrão pras próximas? O nome do cliente e o número do pedido
          viram campos que se preenchem sozinhos.
        </p>
        <Textarea
          value={aviso.texto}
          onChange={(e) => aoMudar({ ...aviso, texto: e.target.value })}
          className="mt-2 min-h-20 text-xs"
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={async () => {
              await aoSalvarModelo(aviso.situacao, aviso.texto);
              aoFechar();
            }}
          >
            <Check className="size-3.5" />
            Salvar como padrão
          </Button>
          <Button size="sm" variant="outline" onClick={aoFechar}>
            Só desta vez
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-brand/40 bg-brand/5 px-4 py-3">
      <div className="flex items-start gap-2">
        <Brain className="mt-0.5 size-4 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          {aviso.etapa === "perguntar" && (
            <>
              <p className="text-xs font-semibold">
                Você editou a resposta da IA. Quer que eu mude minhas próximas respostas com base
                nessa edição?
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                O Gestor compara a resposta sugerida com a sua e propõe uma regra pro SAC. Você vê a
                regra antes de salvar.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    aoMudar({ ...aviso, etapa: "analisando" });
                    const regra = await aoAprender(aviso.ticket, aviso.original, aviso.editada);
                    if (regra) aoMudar({ ...aviso, etapa: "confirmar", regra });
                    else aoFechar();
                  }}
                >
                  <Brain className="size-3.5" />
                  Sim, aprender
                </Button>
                <Button size="sm" variant="outline" onClick={aoFechar}>
                  Não, só desta vez
                </Button>
              </div>
            </>
          )}

          {aviso.etapa === "analisando" && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              O Gestor está comparando as duas versões...
            </p>
          )}

          {aviso.etapa === "confirmar" && (
            <>
              <p className="text-xs font-semibold">O Gestor sugeriu esta regra pro SAC:</p>
              <Input
                value={aviso.regra}
                onChange={(e) => aoMudar({ ...aviso, regra: e.target.value })}
                className="mt-2 h-9 text-xs"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                Pode ajustar o texto. Depois fica em Configurações › Atendimento (SAC), onde dá pra
                desligar ou apagar.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!aviso.regra.trim()}
                  onClick={async () => {
                    await aoSalvarRegra(aviso.regra.trim());
                    aoFechar();
                  }}
                >
                  <Check className="size-3.5" />
                  Salvar regra
                </Button>
                <Button size="sm" variant="outline" onClick={aoFechar}>
                  <X className="size-3.5" />
                  Descartar
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card de uma mensagem                                                */
/* ------------------------------------------------------------------ */

function CardTicketSac({
  ticket,
  pedido,
  config,
  temFicha,
  aoAbrirFicha,
  regrasAtivas,
  modelos,
  gerando,
  rascunho,
  aoMudarRascunho,
  aoGerar,
  aoDecidir,
}: {
  ticket: TicketSac;
  pedido: Pedido | null;
  config: ConfiguracaoSac;
  temFicha: boolean;
  aoAbrirFicha: () => void;
  regrasAtivas: number;
  modelos: Record<SituacaoSac, string>;
  gerando: boolean;
  rascunho: string | undefined;
  aoMudarRascunho: (texto: string) => void;
  aoGerar: () => void;
  aoDecidir: (status: Extract<StatusSugestao, "aprovada" | "recusada">, texto?: string) => void;
}) {
  const categoria = classificarPergunta(ticket.pergunta, ticket.pedidoId);
  const decidido = ticket.status !== "pendente";
  const situacao = categoria === "pos-venda" ? situacaoDoPedido(pedido) : null;
  // Pós-venda com pedido conhecido: a mensagem pronta é o ponto de partida.
  const usaModelo = situacao !== null && !ticket.resposta;
  const textoModelo = situacao
    ? preencherModelo(modelos[situacao], {
        cliente: ticket.cliente,
        pedido: ticket.pedidoId,
        produto: ticket.produto,
        assinatura: config.assinatura,
      })
    : "";
  const texto = rascunho ?? ticket.resposta ?? (usaModelo ? textoModelo : "");
  const proibidas = frasesProibidasNoTexto(texto, config);

  return (
    <div className="px-4 py-4">
      <div className="flex gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            ESTILO_CATEGORIA[categoria],
          )}
        >
          {categoria === "reclamacao" ? (
            <AlertTriangle className="size-3.5" />
          ) : categoria === "pos-venda" ? (
            <Package className="size-3.5" />
          ) : (
            <MessageCircle className="size-3.5" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeloMarketplace id={ticket.marketplaceId} />
            <span className="truncate text-xs font-medium">{ticket.produto}</span>
            <span className="num text-[10px] text-muted-foreground">{ticket.sku}</span>
            <span
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-semibold",
                ESTILO_CATEGORIA[categoria],
              )}
            >
              {ROTULO_CATEGORIA_SAC[categoria]}
            </span>
            {decidido && (
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-semibold",
                  ticket.status === "aprovada"
                    ? "bg-profit-soft text-profit"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {ticket.status === "aprovada" ? "aprovada" : "descartada"}
              </span>
            )}
            {decidido && ticket.decididoEm && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="size-3" />
                {new Date(ticket.decididoEm).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
              Mensagem do cliente{ticket.cliente ? ` · ${ticket.cliente}` : ""}
            </p>
            <p className="mt-0.5 text-xs">{ticket.pergunta}</p>
            {pedido && (
              <p className="num mt-1 text-[10px] text-muted-foreground">
                Pedido {pedido.id} · {ROTULO_STATUS_PEDIDO[pedido.status]} ·{" "}
                {new Date(pedido.data).toLocaleDateString("pt-BR")}
              </p>
            )}
          </div>

          {categoria === "reclamacao" && !decidido && (
            <p className="mt-2 rounded-lg bg-loss-soft px-3 py-2 text-[11px] leading-relaxed text-loss">
              Reclamação: é aqui que a sua reputação corre risco. Responda você mesmo — com calma,
              sem discutir e oferecendo uma solução. Se quiser, peça um rascunho à IA e ajuste.
            </p>
          )}

          {decidido ? (
            ticket.resposta && (
              <div className="mt-2 rounded-lg bg-muted/30 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  {ticket.status === "aprovada" ? "Resposta enviada" : "Resposta descartada"}
                </p>
                <p className="mt-0.5 whitespace-pre-line text-xs">{ticket.resposta}</p>
              </div>
            )
          ) : categoria === "pre-venda" && !ticket.resposta && !situacao ? (
            <div className="mt-3">
              <p className="mb-2 text-[10px] text-muted-foreground">
                A IA vai usar: {temFicha ? "a ficha do produto ✓" : "sem ficha do produto (a resposta pode sair vaga)"}{" "}
                · tom {ROTULO_TOM[config.tom].toLowerCase()} · {regrasAtivas} regra
                {regrasAtivas !== 1 ? "s" : ""} aprendida{regrasAtivas !== 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-2">
                {!temFicha && (
                  <Button size="sm" variant="outline" onClick={aoAbrirFicha}>
                    <FileText className="size-3.5" />
                    Adicionar ficha deste produto
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={aoGerar} disabled={gerando}>
                  {gerando ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  {gerando ? "Gerando..." : "Gerar resposta com IA"}
                </Button>
              </div>
              {!temFicha && (
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  Com a ficha, a IA responde com as características reais do produto. A mesma ficha
                  aparece no Agente Criativo.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                {usaModelo
                  ? `Mensagem pronta · ${ROTULO_SITUACAO_SAC[situacao!]} · sem IA, não gasta token`
                  : categoria === "reclamacao" && !ticket.resposta
                    ? "Sua resposta"
                    : "Resposta sugerida — pode editar antes de aprovar"}
              </p>
              <Textarea
                value={texto}
                onChange={(e) => aoMudarRascunho(e.target.value)}
                placeholder={categoria === "reclamacao" ? "Escreva a resposta pro cliente..." : ""}
                className="min-h-24 text-xs"
              />
              {proibidas.length > 0 && (
                <p className="text-[10px] font-medium text-loss">
                  Atenção: o texto usa {proibidas.length > 1 ? "frases" : "uma frase"} que você marcou
                  como proibida: {proibidas.map((f) => `"${f}"`).join(", ")}.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => aoDecidir("aprovada", texto)} disabled={!texto.trim()}>
                  <Check className="size-3.5" />
                  Aprovar
                </Button>
                <Button size="sm" variant="outline" onClick={() => aoDecidir("recusada")}>
                  <X className="size-3.5" />
                  Descartar
                </Button>
                {(categoria !== "pos-venda" || !situacao) && (
                  <Button size="sm" variant="ghost" onClick={aoGerar} disabled={gerando}>
                    {gerando ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    {ticket.resposta
                      ? "Gerar de novo"
                      : categoria === "reclamacao"
                        ? "Pedir um rascunho à IA"
                        : "Gerar com IA"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
