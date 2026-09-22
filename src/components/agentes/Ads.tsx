// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useState } from "react";
import { Check, Loader2, Target } from "lucide-react";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { Painel } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EventoAds } from "@/types";

/**
 * O painel de Ads: cada card mostra o veredito (vale ou não vale a pena)
 * em cima da margem de verdade, não só do ROAS — junto com as métricas
 * cruas (ROAS, ACOS, CTR, CPC) pra quem quiser conferir a conta.
 */
/**
 * O Agente de Ads, em duas janelas — cada uma responde uma pergunta
 * diferente:
 *
 * "Análise" — dos produtos que JÁ estão em Ads, quais valem a pena?
 * Uma tabela, tudo visível de uma vez: vendas por dia, quanto investiu,
 * quanto sobrou de lucro líquido no final, e um veredito colorido.
 *
 * "Sugestão" — quais produtos vendem bem SOZINHOS, sem nenhum Ads, e
 * são candidatos a começar a investir.
 *
 * De propósito, sem ROAS/ACOS/CTR/CPC aqui — essas métricas já têm
 * casa própria no Dashboard. Aqui é só o que decide "vale ou não vale".
 */
export function PainelAds({
  eventos,
  carregando,
  aoDispensar,
}: {
  eventos: EventoAds[];
  carregando: boolean;
  aoDispensar: (e: EventoAds) => void;
}) {
  const [janela, setJanela] = useState<"analise" | "sugestao">("analise");

  const analisePendente = eventos.filter((e) => e.status === "pendente" && e.tipo === "analise");
  const sugestaoPendente = eventos.filter((e) => e.status === "pendente" && e.tipo === "sugestao");
  const lista = janela === "analise" ? analisePendente : sugestaoPendente;

  return (
    <Painel
      titulo="Ads"
      descricao="Se o investimento em anúncio patrocinado está valendo a pena, pelo que sobra de lucro"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Target className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Agente de Ads</p>
          <p className="text-[10px] text-muted-foreground">
            Olha o lucro líquido depois do Ads, não só o retorno do anúncio
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      <div className="flex gap-1 border-b px-4 pt-3">
        {(
          [
            ["analise", `Análise (${analisePendente.length})`],
            ["sugestao", `Sugestão de anúncio (${sugestaoPendente.length})`],
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
          Avaliando os últimos 30 dias...
        </div>
      )}

      {!carregando && janela === "analise" && (
        <TabelaAnaliseAds itens={analisePendente} aoDispensar={aoDispensar} />
      )}

      {!carregando && janela === "sugestao" && (
        <TabelaSugestaoAds itens={sugestaoPendente} aoDispensar={aoDispensar} />
      )}

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        Investimento e vendas vêm do pedido real dos últimos 30 dias — o mesmo número que
        a tela de Ads do Dashboard já mostra.
      </div>
    </Painel>
  );
}

/** "Vale a pena" = sobrou lucro líquido positivo depois do Ads. Simples
 * assim de propósito: é a pergunta que o seller realmente faz. */
/** "Vale a pena" = sobrou lucro líquido positivo depois do Ads. Simples
 * assim de propósito: é a pergunta que o seller realmente faz. Mostra as
 * duas margens lado a lado — sem Ads e com Ads — pra ficar claro quanto
 * o investimento tirou do resultado, não só o número final. */
function TabelaAnaliseAds({
  itens,
  aoDispensar,
}: {
  itens: EventoAds[];
  aoDispensar: (e: EventoAds) => void;
}) {
  if (itens.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-xs text-muted-foreground">Nenhum produto em Ads pra avaliar agora.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-left">
        <thead>
          <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-bold">Produto / SKU</th>
            <th className="px-4 py-3 text-right font-bold">Vendas/dia</th>
            <th className="px-4 py-3 text-right font-bold">Faturamento</th>
            <th className="px-4 py-3 text-right font-bold">Investimento</th>
            <th className="px-4 py-3 text-right font-bold">Margem sem Ads</th>
            <th className="px-4 py-3 text-right font-bold">Margem com Ads</th>
            <th className="px-4 py-3 text-right font-bold">Lucro líquido</th>
            <th className="px-4 py-3 font-bold">Situação</th>
            <th className="px-4 py-3 text-right font-bold">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {itens.map((e) => (
            <tr key={e.id} className="transition-colors hover:bg-muted/40">
              <td className="max-w-[200px] px-4 py-3">
                <p className="truncate text-xs font-medium">{e.produto}</p>
                <p className="num text-[10px] text-muted-foreground">{e.sku}</p>
              </td>
              <td className="num px-4 py-3 text-right text-xs">
                {Math.round(e.unidadesPorDia)} un.
              </td>
              <td className="num px-4 py-3 text-right text-xs">{formatBRL(e.faturamento)}</td>
              <td className="num px-4 py-3 text-right text-xs">{formatBRL(e.investimento)}</td>
              <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                {formatPercentual(e.margemSemAds)}
              </td>
              <td
                className={cn(
                  "num px-4 py-3 text-right text-xs font-semibold",
                  e.valeAPena ? "text-profit" : "text-loss",
                )}
              >
                {formatPercentual(e.margemComAds)}
              </td>
              <td
                className={cn(
                  "num px-4 py-3 text-right text-xs font-bold",
                  e.valeAPena ? "text-profit" : "text-loss",
                )}
              >
                {formatBRL(e.lucroLiquido)}
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold",
                    e.valeAPena ? "bg-profit-soft text-profit" : "bg-loss-soft text-loss",
                  )}
                >
                  <span
                    className={cn("size-1.5 rounded-full", e.valeAPena ? "bg-profit" : "bg-loss")}
                  />
                  {e.valeAPena ? "Vale a pena" : "Está no prejuízo"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="outline" onClick={() => aoDispensar(e)}>
                  <Check className="size-3.5" />
                  Visto
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Vendeu bem sozinho, sem gastar nada em Ads — candidato a testar. */
function TabelaSugestaoAds({
  itens,
  aoDispensar,
}: {
  itens: EventoAds[];
  aoDispensar: (e: EventoAds) => void;
}) {
  if (itens.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-xs text-muted-foreground">
          Nenhum produto vendendo bem sem Ads no momento.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left">
        <thead>
          <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-bold">Produto / SKU</th>
            <th className="px-4 py-3 text-right font-bold">Vendas/dia</th>
            <th className="px-4 py-3 text-right font-bold">Total vendido</th>
            <th className="px-4 py-3 text-right font-bold">Faturamento</th>
            <th className="px-4 py-3 text-right font-bold">Margem atual</th>
            <th className="px-4 py-3 text-right font-bold">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {itens.map((e) => (
            <tr key={e.id} className="transition-colors hover:bg-muted/40">
              <td className="max-w-[220px] px-4 py-3">
                <p className="truncate text-xs font-medium">{e.produto}</p>
                <p className="num text-[10px] text-muted-foreground">{e.sku}</p>
              </td>
              <td className="num px-4 py-3 text-right text-xs font-semibold text-brand">
                {Math.round(e.unidadesPorDia)} un.
              </td>
              <td className="num px-4 py-3 text-right text-xs">{formatNumero(e.quantidade)} un.</td>
              <td className="num px-4 py-3 text-right text-xs">{formatBRL(e.faturamento)}</td>
              <td className="num px-4 py-3 text-right text-xs">
                {formatPercentual(e.margemSemAds)}
              </td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="outline" onClick={() => aoDispensar(e)}>
                  <Check className="size-3.5" />
                  Visto
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
