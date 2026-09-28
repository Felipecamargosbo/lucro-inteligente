// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardCopy,
  Loader2,
  Percent,
  ShieldCheck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL, formatData, formatNumero } from "@/lib/format";
import { ROTULO_ITEM_AUDITOR, resumirAuditoria } from "@/lib/finance";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  ItemDivergenteAuditor,
  OcorrenciaAuditor,
  StatusOcorrenciaAuditor,
} from "@/types";

/** Percentual com vírgula, do jeito que o seller lê. */
function fmtPercent(v: number): string {
  return `${(v * 100).toFixed(1).replace(".", ",")}%`;
}

function fmtValorCampo(campo: "comissaoPercentual" | "taxaFixa" | null, v: number): string {
  return campo === "comissaoPercentual" ? fmtPercent(v) : formatBRL(v);
}

const ROTULO_STATUS: Record<
  StatusOcorrenciaAuditor,
  { texto: string; cor: string; ponto: string }
> = {
  aberto: { texto: "Aberto", cor: "bg-loss-soft text-loss", ponto: "bg-loss" },
  "reclamacao-aberta": {
    texto: "Reclamação aberta",
    cor: "bg-warning/15 text-warning",
    ponto: "bg-warning",
  },
  reembolsado: { texto: "Reembolsado", cor: "bg-profit-soft text-profit", ponto: "bg-profit" },
  ignorado: { texto: "Ignorado", cor: "bg-muted text-muted-foreground", ponto: "bg-muted-foreground" },
};

/* ------------------------------------------------------------------ */
/* Texto pronto de reclamação                                          */
/* ------------------------------------------------------------------ */

/**
 * Monta a reclamação já com os dados reais do pedido preenchidos, pra o
 * seller só copiar e colar no canal de atendimento do marketplace. É um
 * modelo montado pelo código — não passa pela IA, então não gasta token.
 */
export function montarReclamacao(o: OcorrenciaAuditor): string {
  const canal = o.contaNome ? `equipe ${o.contaNome}` : "equipe de atendimento";
  const linhas = o.itensDivergentes
    .map(
      (i) =>
        `- ${ROTULO_ITEM_AUDITOR[i.item]}: esperado ${formatBRL(i.esperado)}, cobrado ${formatBRL(i.cobrado)} (diferença de ${formatBRL(i.cobrado - i.esperado)}).`,
    )
    .join("\n");

  return [
    `Olá, ${canal}.`,
    "",
    `Identifiquei uma cobrança divergente no pedido ${o.pedidoId}, de ${formatData(o.data)}, do produto ${o.produto} (SKU ${o.sku}).`,
    "",
    linhas,
    "",
    `Diferença total: ${formatBRL(o.diferenca)}.`,
    "",
    "Peço, por favor, a revisão da cobrança e o estorno da diferença. Fico à disposição para enviar qualquer informação adicional.",
    "",
    "Obrigado.",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

type JanelaAuditor = "abertas" | "historico";

/**
 * O Agente Auditor: confere, todo dia, se o marketplace cobrou o que a
 * regra manda. Duas frentes:
 *
 * "Mudança de regra" — a comissão ou a taxa fixa DO ANÚNCIO mudou. Os
 * pedidos que saíram depois não estão errados, só ficaram mais caros:
 * ficam agrupados dentro da própria ocorrência.
 *
 * "Cobrança divergente" — UM pedido foi cobrado fora da regra que vale.
 * Um pedido com frete e comissão errados vira uma ocorrência só.
 *
 * O Auditor avisa e deixa a reclamação pronta; quem reclama é o seller.
 */
export function PainelAuditor({
  ocorrencias,
  carregando,
  aoAtualizarStatus,
}: {
  ocorrencias: OcorrenciaAuditor[];
  carregando: boolean;
  aoAtualizarStatus: (o: OcorrenciaAuditor, status: StatusOcorrenciaAuditor) => void;
}) {
  const [janela, setJanela] = useState<JanelaAuditor>("abertas");
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const resumo = useMemo(() => resumirAuditoria(ocorrencias), [ocorrencias]);
  const abertas = ocorrencias.filter(
    (o) => o.status === "aberto" || o.status === "reclamacao-aberta",
  );
  const encerradas = ocorrencias.filter(
    (o) => o.status === "reembolsado" || o.status === "ignorado",
  );
  const lista = janela === "abertas" ? abertas : encerradas;
  const detalhe = ocorrencias.find((o) => o.id === detalheId) ?? null;

  if (detalhe) {
    return (
      <DetalheOcorrencia
        ocorrencia={detalhe}
        aoVoltar={() => setDetalheId(null)}
        aoAtualizarStatus={aoAtualizarStatus}
      />
    );
  }

  return (
    <Painel
      titulo="Auditor"
      descricao="Confere se o marketplace cobrou o que a regra manda — e deixa a reclamação pronta quando não cobrou"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <ShieldCheck className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Agente Auditor</p>
          <p className="text-[10px] text-muted-foreground">
            Compara comissão, taxa fixa e frete de cada pedido com a regra da conta
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
        <CardResumo
          rotulo="Cobrado a mais no mês"
          valor={formatBRL(resumo.cobradoAMais)}
          cor="loss"
        />
        <CardResumo rotulo="Já recuperado" valor={formatBRL(resumo.recuperado)} cor="profit" />
        <CardResumo rotulo="Pendente" valor={formatBRL(resumo.pendente)} cor="warning" />
      </div>

      <div className="flex gap-1 border-b px-4 pt-3">
        {(
          [
            ["abertas", `Em aberto (${abertas.length})`],
            ["historico", `Histórico (${encerradas.length})`],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setJanela(id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
              janela === id
                ? "border-b-2 border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {carregando && (
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Conferindo as cobranças dos últimos 30 dias...
        </div>
      )}

      {!carregando && lista.length === 0 && (
        <div className="px-4 py-14 text-center">
          <p className="text-xs text-muted-foreground">
            {janela === "abertas"
              ? "Nenhuma divergência em aberto. Tudo que o canal cobrou bate com a regra."
              : "Nenhuma ocorrência encerrada ainda."}
          </p>
        </div>
      )}

      {!carregando && lista.length > 0 && (
        <div className="divide-y">
          {lista.map((o) => (
            <LinhaOcorrencia key={o.id} ocorrencia={o} aoAbrir={() => setDetalheId(o.id)} />
          ))}
        </div>
      )}

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        O Auditor confere os pedidos dos últimos 30 dias contra a comissão, a taxa fixa e o
        frete configurados na conta. Ele aponta e deixa o texto da reclamação pronto — quem
        abre a reclamação no marketplace é você.
      </div>
    </Painel>
  );
}

function CardResumo({
  rotulo,
  valor,
  cor,
}: {
  rotulo: string;
  valor: string;
  cor: "loss" | "profit" | "warning";
}) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "num text-lg font-bold",
          cor === "loss" && "text-loss",
          cor === "profit" && "text-profit",
          cor === "warning" && "text-warning",
        )}
      >
        {valor}
      </p>
    </div>
  );
}

function LinhaOcorrencia({
  ocorrencia: o,
  aoAbrir,
}: {
  ocorrencia: OcorrenciaAuditor;
  aoAbrir: () => void;
}) {
  const s = ROTULO_STATUS[o.status];
  const ehCobranca = o.tipo === "cobranca-divergente";
  return (
    <button
      onClick={aoAbrir}
      className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
        {ehCobranca ? (
          <AlertTriangle className="size-3.5 text-loss" />
        ) : (
          <Percent className="size-3.5 text-warning" />
        )}
      </div>
      <div className="min-w-[180px] flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <SeloMarketplace id={o.marketplaceId} />
          <span className="text-xs font-semibold">
            {ehCobranca ? "Cobrança divergente" : "Mudança de regra"}
          </span>
          <span className="text-[10px] text-muted-foreground">{formatData(o.data)}</span>
        </div>
        <p className="mt-0.5 truncate text-xs">{o.produto}</p>
        <p className="num text-[10px] text-muted-foreground">
          {o.sku}
          {o.pedidoId ? ` · pedido ${o.pedidoId}` : ""}
        </p>
      </div>
      <div className="text-right">
        <p
          className={cn(
            "num text-sm font-bold",
            o.diferenca > 0 ? "text-loss" : "text-muted-foreground",
          )}
        >
          {o.diferenca > 0 ? `+${formatBRL(o.diferenca)}` : formatBRL(o.diferenca)}
        </p>
        <span
          className={cn(
            "mt-0.5 inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-semibold",
            s.cor,
          )}
        >
          <span className={cn("size-1.5 rounded-full", s.ponto)} />
          {s.texto}
        </span>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Detalhe de uma ocorrência                                           */
/* ------------------------------------------------------------------ */

function DetalheOcorrencia({
  ocorrencia: o,
  aoVoltar,
  aoAtualizarStatus,
}: {
  ocorrencia: OcorrenciaAuditor;
  aoVoltar: () => void;
  aoAtualizarStatus: (o: OcorrenciaAuditor, status: StatusOcorrenciaAuditor) => void;
}) {
  const ehCobranca = o.tipo === "cobranca-divergente";
  const [texto, setTexto] = useState(() => (ehCobranca ? montarReclamacao(o) : ""));
  const s = ROTULO_STATUS[o.status];

  /** Copiar já muda o status pra "Reclamação aberta" — um clique a menos
   * pro seller, que é o que ele ia fazer em seguida de qualquer jeito. */
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Texto copiado. Cole no atendimento do marketplace.");
      if (o.status === "aberto") aoAtualizarStatus(o, "reclamacao-aberta");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto e copie manualmente.");
    }
  }

  return (
    <Painel
      titulo={ehCobranca ? "Cobrança divergente" : "Mudança de regra"}
      descricao={`${o.produto} · ${o.sku}`}
      acoes={
        <Button size="sm" variant="ghost" onClick={aoVoltar}>
          <ArrowLeft className="size-3.5" />
          Voltar
        </Button>
      }
    >
      <div className="space-y-5 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <SeloMarketplace id={o.marketplaceId} />
          {o.contaNome && (
            <span className="text-[10px] text-muted-foreground">{o.contaNome}</span>
          )}
          <span className="text-[10px] text-muted-foreground">{formatData(o.data)}</span>
          <span
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-semibold",
              s.cor,
            )}
          >
            <span className={cn("size-1.5 rounded-full", s.ponto)} />
            {s.texto}
          </span>
        </div>

        <p className="text-xs leading-relaxed">{o.motivo}</p>

        {ehCobranca && (
          <div>
            <p className="mb-2 text-xs font-semibold">A conta, linha por linha</p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left font-bold">Item</th>
                    <th className="px-3 py-2 text-right font-bold">Esperado</th>
                    <th className="px-3 py-2 text-right font-bold">Cobrado</th>
                    <th className="px-3 py-2 text-right font-bold">Diferença</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {o.itensDivergentes.map((i: ItemDivergenteAuditor) => (
                    <tr key={i.item}>
                      <td className="px-3 py-2">{ROTULO_ITEM_AUDITOR[i.item]}</td>
                      <td className="num px-3 py-2 text-right text-muted-foreground">
                        {formatBRL(i.esperado)}
                      </td>
                      <td className="num px-3 py-2 text-right">{formatBRL(i.cobrado)}</td>
                      <td className="num px-3 py-2 text-right font-bold text-loss">
                        {formatBRL(i.cobrado - i.esperado)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-muted/50">
                    <td className="px-3 py-2 font-semibold" colSpan={3}>
                      Diferença total
                    </td>
                    <td className="num px-3 py-2 text-right font-bold text-loss">
                      {formatBRL(o.diferenca)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!ehCobranca && (
          <div>
            <p className="mb-2 text-xs font-semibold">O que mudou</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <MiniDado
                rotulo="Antes"
                valor={o.valorAnterior === null ? "—" : fmtValorCampo(o.campo, o.valorAnterior)}
              />
              <MiniDado
                rotulo="Depois"
                valor={o.valorNovo === null ? "—" : fmtValorCampo(o.campo, o.valorNovo)}
                destaque
              />
              <MiniDado rotulo="Detectado em" valor={formatData(o.data)} />
            </div>
          </div>
        )}

        <p className="rounded-lg bg-muted px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {o.causaProvavel}
        </p>

        {!ehCobranca && (
          <div>
            <p className="mb-2 text-xs font-semibold">
              Pedidos que já saíram com a taxa nova ({formatNumero(o.pedidosAfetados.length)})
            </p>
            {o.pedidosAfetados.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">
                Nenhuma venda ainda desde a mudança.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 text-left font-bold">Pedido</th>
                      <th className="px-3 py-2 text-left font-bold">Data</th>
                      <th className="px-3 py-2 text-right font-bold">Faturamento</th>
                      <th className="px-3 py-2 text-right font-bold">Custo a mais</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {o.pedidosAfetados.slice(0, 10).map((p) => (
                      <tr key={p.pedidoId}>
                        <td className="num px-3 py-2">{p.pedidoId}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatData(p.data)}</td>
                        <td className="num px-3 py-2 text-right">{formatBRL(p.faturamento)}</td>
                        <td className="num px-3 py-2 text-right font-semibold text-loss">
                          {formatBRL(p.custoExtra)}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/50">
                      <td className="px-3 py-2 font-semibold" colSpan={3}>
                        Total pago a mais desde a mudança
                      </td>
                      <td className="num px-3 py-2 text-right font-bold text-loss">
                        {formatBRL(o.diferenca)}
                      </td>
                    </tr>
                  </tbody>
                </table>
                {o.pedidosAfetados.length > 10 && (
                  <p className="px-3 py-2 text-[10px] text-muted-foreground">
                    Mostrando os 10 mais recentes de {formatNumero(o.pedidosAfetados.length)}.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {ehCobranca && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold">Reclamação pronta</p>
              <Button size="sm" onClick={copiar}>
                <ClipboardCopy className="size-3.5" />
                Copiar
              </Button>
            </div>
            <Textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={12}
              className="text-xs"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Pode editar antes de copiar. Ao copiar, a ocorrência passa pra "Reclamação
              aberta" sozinha.
            </p>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold">Em que pé está</p>
          <div className="flex flex-wrap gap-2">
            {o.status !== "reclamacao-aberta" && ehCobranca && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => aoAtualizarStatus(o, "reclamacao-aberta")}
              >
                Marcar como reclamação aberta
              </Button>
            )}
            {o.status !== "reembolsado" && (
              <Button size="sm" onClick={() => aoAtualizarStatus(o, "reembolsado")}>
                <Check className="size-3.5" />
                {ehCobranca ? "O dinheiro voltou" : "Já tratei"}
              </Button>
            )}
            {o.status !== "ignorado" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => aoAtualizarStatus(o, "ignorado")}
              >
                <X className="size-3.5" />
                Ignorar
              </Button>
            )}
            {o.status !== "aberto" && (
              <Button size="sm" variant="ghost" onClick={() => aoAtualizarStatus(o, "aberto")}>
                Voltar pra aberto
              </Button>
            )}
          </div>
        </div>
      </div>
    </Painel>
  );
}

function MiniDado({
  rotulo,
  valor,
  destaque = false,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
}) {
  return (
    <div className={cn("rounded-lg px-3 py-2", destaque ? "bg-brand/10" : "bg-muted")}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={cn("num text-sm font-bold", destaque && "text-brand")}>{valor}</p>
    </div>
  );
}
