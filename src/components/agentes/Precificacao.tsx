// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useState, type ReactNode } from "react";
import {
  Bot,
  Check,
  Clock,
  Loader2,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import { contasService } from "@/services";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import {
  CAPITAL_PRESO_ALTO,
  DEGRAUS_CORTE,
  DEGRAU_EXTRA_CAPITAL,
  DIAS_AVALIACAO_PRECO,
  type AvaliacaoCampanha,
  type PrecoPorCanalSku,
  type ResultadoMudancaPreco,
  type VereditoCampanha,
  type VereditoMudancaPreco,
} from "@/lib/finance";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EventoAgente, StatusSugestao } from "@/types";
import { ESTILO_SEMAFORO } from "./comum";

const NOME_AGENTE = "Agente de Precificação";

type AbaPreco = "sugestoes" | "campanhas" | "canal" | "resultados" | "historico";

const pct = (n: number) => formatPercentual(n);

/**
 * O painel de Precificação, com as cinco frentes:
 * 1. Subir preço quando vende rápido e o estoque vai acabar.
 * 2. Baixar preço de produto parado, com corte que cresce com o tempo
 *    parado e o dinheiro preso.
 * 3. Acompanhar o resultado de cada mudança aprovada.
 * 4. Dizer se vale entrar nas campanhas do marketplace.
 * 5. Mostrar o preço certo de cada canal.
 * Nada é aplicado sem o seller aprovar.
 */
export function PainelPrecificacao({
  pendentes,
  decididos,
  aprovadas,
  carregando,
  aoDecidir,
  campanhas,
  precosPorCanal,
  resultados,
}: {
  pendentes: EventoAgente[];
  decididos: EventoAgente[];
  aprovadas: number;
  carregando: boolean;
  aoDecidir: (evento: EventoAgente, status: StatusSugestao) => void;
  campanhas: AvaliacaoCampanha[];
  precosPorCanal: PrecoPorCanalSku[];
  resultados: ResultadoMudancaPreco[];
}) {
  const [aba, setAba] = useState<AbaPreco>("sugestoes");
  const subir = pendentes.filter((e) => e.direcao === "subir").length;
  const baixar = pendentes.length - subir;
  const canaisAbaixo = precosPorCanal.reduce((s, p) => s + p.abaixoDoPiso, 0);

  const ABAS: [AbaPreco, string][] = [
    ["sugestoes", `Sugestões (${pendentes.length})`],
    ["campanhas", `Campanhas (${campanhas.length})`],
    ["canal", `Preço por canal${canaisAbaixo > 0 ? ` (${canaisAbaixo})` : ""}`],
    ["resultados", `Resultados (${resultados.length})`],
    ["historico", `Histórico (${decididos.length})`],
  ];

  return (
    <Painel
      titulo="Agentes"
      descricao="Cada decisão vem com o motivo, o antes e o depois. Nada é aplicado sem você aprovar"
    >
      {/* Indicadores */}
      <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
        <div className="rounded-lg bg-muted px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Esperando sua aprovação
          </p>
          <p className={cn("num text-lg font-bold", pendentes.length > 0 && "text-warning")}>
            {formatNumero(pendentes.length)}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {subir} pra subir · {baixar} pra baixar
          </p>
        </div>
        <div className="rounded-lg bg-muted px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Aprovadas nesta sessão
          </p>
          <p className="num text-lg font-bold text-profit">{formatNumero(aprovadas)}</p>
        </div>
        <div className="rounded-lg bg-muted px-3 py-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Regras ativas</p>
          <p className="text-[11px] font-semibold leading-snug">
            Parado: corta{" "}
            {DEGRAUS_CORTE.slice()
              .reverse()
              .map((d) => `${formatPercentual(d.degrau, 0)} (${d.dias}+ dias)`)
              .join(", ")}
            , +{formatPercentual(DEGRAU_EXTRA_CAPITAL, 0)} com mais de {formatBRL(CAPITAL_PRESO_ALTO)}{" "}
            presos
          </p>
          <p className="text-[11px] font-semibold leading-snug">
            Estoque acabando: sobe 5% a 8%
          </p>
        </div>
      </div>

      {/* Quem está trabalhando */}
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Bot className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{NOME_AGENTE}</p>
          <p className="text-[10px] text-muted-foreground">
            Sobe, baixa, avalia campanhas e acompanha o resultado — sem furar a sua margem mínima
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto border-b px-4 pt-3">
        {ABAS.map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              "shrink-0 rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
              aba === id
                ? "border-b-2 border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {carregando && (aba === "sugestoes" || aba === "historico") && (
        <div className="flex items-center justify-center gap-2 px-4 py-14 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Verificando seus produtos...
        </div>
      )}

      {!carregando && (aba === "sugestoes" || aba === "historico") && (
        <div className="divide-y">
          {(aba === "sugestoes" ? pendentes : decididos).map((e) => (
            <CardDecisao key={e.id} evento={e} aoDecidir={aoDecidir} />
          ))}
          {(aba === "sugestoes" ? pendentes : decididos).length === 0 && (
            <Vazio>
              {aba === "sugestoes"
                ? "Nada parado além do limite e nenhum estoque acabando. O agente não tem o que propor agora."
                : "Nenhuma decisão registrada ainda."}
            </Vazio>
          )}
        </div>
      )}

      {aba === "campanhas" && <ListaCampanhas campanhas={campanhas} />}
      {aba === "canal" && <ListaPrecoPorCanal lista={precosPorCanal} />}
      {aba === "resultados" && <ListaResultados resultados={resultados} />}

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        Sem API conectada, o agente sugere mas não executa: depois de aprovar, o preço precisa
        ser alterado no marketplace. A margem mínima e a ideal de cada conta vêm das metas em
        Configurações. Campanhas, estoque e os exemplos da aba Resultados ainda são fictícios.
      </div>
    </Painel>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-14 text-center">
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

function MiniDado({
  rotulo,
  valor,
  sub,
  cor,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  cor?: string;
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={cn("num text-sm font-semibold", cor)}>{valor}</p>
      {sub && <p className="num text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Frentes 1 e 2: sugestões de subir e baixar                          */
/* ------------------------------------------------------------------ */

function CardDecisao({
  evento,
  aoDecidir,
}: {
  evento: EventoAgente;
  aoDecidir: (e: EventoAgente, status: StatusSugestao) => void;
}) {
  const conta = contasService.buscar(evento.contaId);
  const sem = ESTILO_SEMAFORO[evento.semaforo];
  const sobe = evento.direcao === "subir";
  const diferenca = Math.abs(evento.precoSugerido - evento.precoAtual);
  const pendente = evento.status === "pendente";

  return (
    <div className={cn("px-4 py-4", !pendente && "opacity-70")}>
      <div className="flex gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            sobe ? "bg-profit-soft text-profit" : "bg-brand/15 text-brand",
          )}
        >
          {sobe ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">{NOME_AGENTE}</span>
            <span
              className={cn(
                "rounded px-2 py-0.5 text-[10px] font-semibold",
                sobe ? "bg-profit-soft text-profit" : "bg-brand/15 text-brand",
              )}
            >
              {sobe ? "Subir preço" : "Baixar preço"}
              {evento.degrau !== undefined && ` ${formatPercentual(evento.degrau, 0)}`}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="size-3" />
              {new Date(evento.data).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {evento.status === "aprovada" && (
              <span className="rounded bg-profit-soft px-2 py-0.5 text-[10px] font-semibold text-profit">
                aprovada
              </span>
            )}
            {evento.status === "recusada" && (
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                recusada
              </span>
            )}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <SeloMarketplace id={evento.marketplaceId} />
            <span className="truncate text-xs font-medium">{evento.produto}</span>
            <span className="num text-[10px] text-muted-foreground">
              {evento.sku} · {conta?.nome ?? "—"}
            </span>
          </div>

          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{evento.motivo}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
            <MiniDado
              rotulo="Preço hoje"
              valor={formatBRL(evento.precoAtual)}
              sub={`margem ${pct(evento.margemAtual)}`}
            />
            {sobe ? (
              <TrendingUp className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <TrendingDown className="size-4 shrink-0 text-muted-foreground" />
            )}
            <MiniDado
              rotulo="Sugerido"
              valor={formatBRL(evento.precoSugerido)}
              sub={`margem ${pct(evento.margemSugerida)}`}
              cor={cn("font-bold", sem.texto)}
            />
            <MiniDado rotulo={sobe ? "Aumento" : "Queda"} valor={`${sobe ? "+" : "−"}${formatBRL(diferenca)}`} />
            <MiniDado rotulo="Piso deste canal" valor={formatBRL(evento.precoMinimo)} />
            <span
              className={cn("ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold", sem.texto)}
            >
              <span className={cn("size-1.5 rounded-full", sem.ponto)} />
              {sem.rotulo}
            </span>
          </div>

          {evento.travadoNoPiso && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Travado no piso: o corte cheio passaria da sua margem mínima.
            </p>
          )}

          {pendente && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => aoDecidir(evento, "aprovada")}>
                <Check className="size-3.5" />
                Aprovar
              </Button>
              <Button size="sm" variant="outline" onClick={() => aoDecidir(evento, "recusada")}>
                <X className="size-3.5" />
                Recusar
              </Button>
            </div>
          )}
          {pendente && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Ao aprovar, o agente passa a acompanhar o resultado na aba Resultados.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Frente 4: campanhas do marketplace                                  */
/* ------------------------------------------------------------------ */

const ESTILO_CAMPANHA: Record<VereditoCampanha, { texto: string; cor: string; caixa: string }> = {
  entrar: { texto: "Pode entrar", cor: "bg-profit-soft text-profit", caixa: "bg-profit-soft text-profit" },
  "entrar-com-cuidado": {
    texto: "Entrar com cuidado",
    cor: "bg-warning-soft text-warning",
    caixa: "bg-warning-soft text-warning",
  },
  "nao-compensa": {
    texto: "Não compensa",
    cor: "bg-muted text-muted-foreground",
    caixa: "bg-muted text-muted-foreground",
  },
  "nao-entrar": { texto: "Não entre", cor: "bg-loss-soft text-loss", caixa: "bg-loss-soft text-loss" },
};

function ListaCampanhas({ campanhas }: { campanhas: AvaliacaoCampanha[] }) {
  if (campanhas.length === 0) {
    return <Vazio>Nenhum convite de campanha do marketplace no momento.</Vazio>;
  }
  return (
    <div className="divide-y">
      <p className="px-4 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        Convites de campanha dos marketplaces. O agente calcula a margem no preço da campanha, já
        com o que o canal banca (rebate), e cruza com o estoque: produto que já vende sozinho e está
        acabando não precisa de desconto. Quem entra ou não na campanha é você, no marketplace.
      </p>
      {campanhas.map((c) => {
        const e = ESTILO_CAMPANHA[c.veredito];
        const conta = c.anuncio ? contasService.buscar(c.anuncio.contaId) : null;
        return (
          <div key={c.promocao.id} className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <SeloMarketplace id={c.promocao.marketplaceId} />
              <span className="truncate text-xs font-medium">{c.promocao.produto}</span>
              <span className="num text-[10px] text-muted-foreground">
                {c.promocao.sku}
                {conta ? ` · ${conta.nome}` : ""}
              </span>
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                {c.promocao.tipo}
              </span>
              <span className={cn("ml-auto rounded px-2 py-0.5 text-[10px] font-semibold", e.cor)}>
                {e.texto}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
              <MiniDado
                rotulo="Preço hoje"
                valor={c.anuncio ? formatBRL(c.anuncio.precoAtual) : formatBRL(c.promocao.precoAtual)}
                sub={c.margemHoje !== null ? `margem ${pct(c.margemHoje)}` : undefined}
              />
              <MiniDado
                rotulo="Na campanha"
                valor={formatBRL(c.promocao.precoFinal)}
                sub={c.margemCampanha !== null ? `margem ${pct(c.margemCampanha)}` : undefined}
                cor={
                  c.margemCampanha !== null && c.margemCampanha < 0
                    ? "text-loss"
                    : c.margemCampanha !== null && c.margemCampanha < c.margemMinima
                      ? "text-warning"
                      : undefined
                }
              />
              <MiniDado rotulo="O canal banca" valor={formatBRL(c.promocao.rebate)} sub="rebate" />
              {c.lucroUnidadeHoje !== null && c.lucroUnidadeCampanha !== null && (
                <MiniDado
                  rotulo="Lucro por unidade"
                  valor={`${formatBRL(c.lucroUnidadeHoje)} → ${formatBRL(c.lucroUnidadeCampanha)}`}
                />
              )}
              <MiniDado rotulo="Sua mínima" valor={pct(c.margemMinima)} />
            </div>
            <p className={cn("mt-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed", e.caixa)}>
              {c.motivo}
            </p>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Frente 5: preço por canal                                           */
/* ------------------------------------------------------------------ */

function ListaPrecoPorCanal({ lista }: { lista: PrecoPorCanalSku[] }) {
  if (lista.length === 0) {
    return <Vazio>Nenhum produto vendido em mais de um canal.</Vazio>;
  }
  return (
    <div className="divide-y">
      <p className="px-4 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        O mesmo produto custa diferente em cada canal (comissão, taxa fixa, frete, Ads). Aqui está o
        preço que dá a sua margem mínima e o que dá a ideal em cada conta — em vez de um preço único
        pra todos. Em vermelho, o canal que está abaixo do piso: é onde subir o preço primeiro.
      </p>
      {lista.map((p) => (
        <div key={p.sku} className="px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-xs font-medium">{p.produto}</span>
            <span className="num text-[10px] text-muted-foreground">{p.sku}</span>
            {p.abaixoDoPiso > 0 && (
              <span className="rounded bg-loss-soft px-2 py-0.5 text-[10px] font-semibold text-loss">
                {p.abaixoDoPiso} canal{p.abaixoDoPiso > 1 ? "is" : ""} abaixo do piso
              </span>
            )}
            {p.diferencaIdeal > 0 && (
              <span className="text-[10px] text-muted-foreground">
                O preço ideal varia {formatBRL(p.diferencaIdeal)} entre os canais
              </span>
            )}
          </div>
          <div className="mt-2 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[520px] text-xs">
              <thead>
                <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2 text-left font-bold">Canal</th>
                  <th className="px-3 py-2 text-right font-bold">Preço hoje</th>
                  <th className="px-3 py-2 text-right font-bold">Margem</th>
                  <th className="px-3 py-2 text-right font-bold">Piso (mínima)</th>
                  <th className="px-3 py-2 text-right font-bold">Ideal</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {p.canais.map((c) => {
                  const conta = contasService.buscar(c.anuncio.contaId);
                  return (
                    <tr
                      key={c.anuncio.id}
                      className={cn(c.faixa === "abaixo-do-piso" && "bg-loss-soft/40")}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <SeloMarketplace id={c.anuncio.marketplaceId} />
                          <span className="text-[11px]">{conta?.nome ?? "—"}</span>
                        </div>
                      </td>
                      <td
                        className={cn(
                          "num px-3 py-2 text-right font-semibold",
                          c.faixa === "abaixo-do-piso" && "text-loss",
                          c.faixa === "abaixo-do-ideal" && "text-warning",
                          c.faixa === "ok" && "text-profit",
                        )}
                      >
                        {formatBRL(c.anuncio.precoAtual)}
                      </td>
                      <td className="num px-3 py-2 text-right">
                        {c.margemAtual === null ? "—" : pct(c.margemAtual)}
                      </td>
                      <td className="num px-3 py-2 text-right text-muted-foreground">
                        {c.precoMinimo === null ? "sem custo" : formatBRL(c.precoMinimo)}
                        <span className="block text-[9px]">{pct(c.metas.margemMinima)}</span>
                      </td>
                      <td className="num px-3 py-2 text-right text-muted-foreground">
                        {c.precoIdeal === null ? "—" : formatBRL(c.precoIdeal)}
                        <span className="block text-[9px]">{pct(c.metas.margemIdeal)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Frente 3: resultado das mudanças                                    */
/* ------------------------------------------------------------------ */

const ESTILO_RESULTADO: Record<VereditoMudancaPreco, { texto: string; cor: string }> = {
  acompanhando: { texto: "Acompanhando", cor: "bg-muted text-muted-foreground" },
  funcionou: { texto: "Funcionou", cor: "bg-profit-soft text-profit" },
  "nao-mudou": { texto: "Não mudou nada", cor: "bg-warning-soft text-warning" },
  piorou: { texto: "Piorou", cor: "bg-loss-soft text-loss" },
};

function ListaResultados({ resultados }: { resultados: ResultadoMudancaPreco[] }) {
  if (resultados.length === 0) {
    return <Vazio>Nenhuma mudança de preço aprovada ainda.</Vazio>;
  }
  const un = (n: number) => `${n.toFixed(1).replace(".", ",")}/dia`;
  return (
    <div className="divide-y">
      <p className="px-4 pt-3 text-[11px] leading-relaxed text-muted-foreground">
        Depois que você aprova uma mudança, o agente compara as vendas e o lucro (depois do Ads)
        do anúncio nos {DIAS_AVALIACAO_PRECO} dias antes e depois dela. Assim ele aprende o que
        funciona: se um corte não fez vender mais, o problema não é preço.
      </p>
      {resultados.map((r) => {
        const e = ESTILO_RESULTADO[r.veredito];
        const m = r.mudanca;
        const conta = contasService.buscar(m.contaId);
        return (
          <div key={m.id} className="px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <SeloMarketplace id={m.marketplaceId} />
              <span className="truncate text-xs font-medium">{m.produto}</span>
              <span className="num text-[10px] text-muted-foreground">
                {m.sku} · {conta?.nome ?? "—"}
              </span>
              {m.exemplo && (
                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  exemplo
                </span>
              )}
              <span className={cn("ml-auto rounded px-2 py-0.5 text-[10px] font-semibold", e.cor)}>
                {e.texto}
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
              <MiniDado
                rotulo={r.direcao === "subir" ? "Subiu" : "Baixou"}
                valor={`${formatBRL(m.precoAntes)} → ${formatBRL(m.precoDepois)}`}
                sub={`há ${r.diasDesde} dia${r.diasDesde !== 1 ? "s" : ""}`}
              />
              {r.veredito !== "acompanhando" && (
                <>
                  <MiniDado
                    rotulo="Vendas"
                    valor={`${un(r.unidadesDiaAntes)} → ${un(r.unidadesDiaDepois)}`}
                  />
                  <MiniDado
                    rotulo="Lucro após Ads"
                    valor={`${formatBRL(r.lucroDiaAntes)} → ${formatBRL(r.lucroDiaDepois)}`}
                    sub="por dia"
                  />
                </>
              )}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{r.explicacao}</p>
          </div>
        );
      })}
    </div>
  );
}
