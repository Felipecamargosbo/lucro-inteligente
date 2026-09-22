// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Check,
  Clock,
  Loader2,
  MousePointerClick,
  Target,
  Wand2,
  X,
} from "lucide-react";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import {
  CONVERSAO_MAXIMA_CANSADO,
  DIAS_TESTE_ADS,
  FOLGA_ROAS_ADS,
  contribuicaoAnuncio,
  diagnosticarAnunciosCansados,
  sugerirAjusteObjetivo,
  sugerirRealocacaoAds,
  type AnaliseRoasAnuncio,
  type OpcoesLimites,
} from "@/lib/finance";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type {
  AcaoAds,
  EventoAds,
  LadoRealocacaoAds,
  SemaforoDecisao,
  StatusSugestao,
} from "@/types";

/** ROAS sempre com uma casa decimal e vírgula, do jeito que o seller lê. */
function fmtRoas(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toFixed(1).replace(".", ",");
}

/* ------------------------------------------------------------------ */
/* Montagem das ações (usado pela varredura em agentes.tsx)            */
/* ------------------------------------------------------------------ */

export interface AcaoAdsNova {
  chave: string;
  acao: Omit<AcaoAds, "id" | "status" | "decididoEm" | "data">;
}

function lado(x: AnaliseRoasAnuncio): LadoRealocacaoAds {
  return {
    anuncioId: x.anuncio.id,
    sku: x.anuncio.sku,
    produto: x.anuncio.produto,
    classe: x.classe,
    roasAtual: x.roasAtual ?? 0,
    roasMinimo: x.contribuicao.roasMinimo ?? 0,
    investimento: x.investimento,
    diasSeguidosAbaixo: x.diasSeguidosAbaixo,
    coberturaEstoqueDias: x.coberturaEstoqueDias,
  };
}

/**
 * Transforma a análise de ROAS nas três ações do agente (realocação,
 * ajuste de objetivo e anúncio cansado), já com o motivo escrito em
 * português. Cada uma vem com uma `chave` — é ela que impede a mesma
 * sugestão de ser gravada de novo enquanto a anterior está pendente.
 */
export function montarAcoesAds(analises: AnaliseRoasAnuncio[]): AcaoAdsNova[] {
  const novas: AcaoAdsNova[] = [];

  const realocacoes = sugerirRealocacaoAds(analises);
  const emRealocacao = new Set<string>();
  for (const { fonte, destino } of realocacoes) {
    emRealocacao.add(fonte.anuncio.id);
    emRealocacao.add(destino.anuncio.id);
    novas.push({
      chave: `realocacao:${fonte.anuncio.id}->${destino.anuncio.id}`,
      acao: {
        contaId: fonte.anuncio.contaId,
        anuncioId: fonte.anuncio.id,
        sku: fonte.anuncio.sku,
        produto: fonte.anuncio.produto,
        marketplaceId: fonte.anuncio.marketplaceId,
        semaforo: "vermelho",
        motivo: `${fonte.anuncio.produto} (curva C) está abaixo do ROAS mínimo há ${fonte.diasSeguidosAbaixo} dias seguidos e gastou ${formatBRL(fonte.investimento)} em 14 dias. ${destino.anuncio.produto} (curva A) está com ROAS ${fmtRoas(destino.roasAtual)}, bem acima do mínimo de ${fmtRoas(destino.contribuicao.roasMinimo)}. Vale mover a verba de um pro outro.`,
        detalhe: { tipo: "realocacao", fonte: lado(fonte), destino: lado(destino) },
      },
    });
  }

  for (const s of sugerirAjusteObjetivo(analises, emRealocacao)) {
    const x = s.analise;
    const atual = x.roasAtual ?? 0;
    const minimo = x.contribuicao.roasMinimo ?? 0;
    const objetivo = x.anuncio.roasObjetivo ?? 0;
    novas.push({
      chave: `ajuste:${x.anuncio.id}:${s.direcao}`,
      acao: {
        contaId: x.anuncio.contaId,
        anuncioId: x.anuncio.id,
        sku: x.anuncio.sku,
        produto: x.anuncio.produto,
        marketplaceId: x.anuncio.marketplaceId,
        semaforo: s.direcao === "baixar" ? "verde" : atual < minimo ? "vermelho" : "amarelo",
        motivo:
          s.direcao === "subir"
            ? `ROAS dos últimos 14 dias em ${fmtRoas(atual)}, ${atual < minimo ? "abaixo" : "perto"} do mínimo de ${fmtRoas(minimo)}. O ROAS objetivo está em ${fmtRoas(objetivo)}, baixo demais pra proteger a margem. Suba pra ${fmtRoas(s.objetivoSugerido)}.`
            : `ROAS dos últimos 14 dias em ${fmtRoas(atual)}, mais que o dobro do mínimo de ${fmtRoas(minimo)}, e as vendas não cresceram na última semana. Dá pra baixar o ROAS objetivo de ${fmtRoas(objetivo)} pra ${fmtRoas(s.objetivoSugerido)} e ganhar volume sem sair do lucro.`,
        detalhe: {
          tipo: "ajuste_roas",
          direcao: s.direcao,
          roasAtual: atual,
          roasMinimo: minimo,
          roasObjetivoAtual: objetivo,
          roasObjetivoSugerido: s.objetivoSugerido,
        },
      },
    });
  }

  for (const x of diagnosticarAnunciosCansados(analises)) {
    const conversao = x.conversao ?? 0;
    novas.push({
      chave: `cansado:${x.anuncio.id}`,
      acao: {
        contaId: x.anuncio.contaId,
        anuncioId: x.anuncio.id,
        sku: x.anuncio.sku,
        produto: x.anuncio.produto,
        marketplaceId: x.anuncio.marketplaceId,
        semaforo: "vermelho",
        motivo: `${formatNumero(x.cliques)} cliques e ${formatNumero(x.vendas)} venda(s) nos últimos 14 dias, uma conversão de ${formatPercentual(conversao, 2)}. Você está pagando por visita que não compra. Revise o anúncio antes de continuar investindo.`,
        detalhe: {
          tipo: "anuncio_cansado",
          cliques: x.cliques,
          vendas: x.vendas,
          conversao,
          investimento: x.investimento,
        },
      },
    });
  }

  return novas;
}

/* ------------------------------------------------------------------ */
/* Painel                                                              */
/* ------------------------------------------------------------------ */

type JanelaAds = "acoes" | "roas" | "candidatos" | "historico";

/**
 * O Agente de Ads, em quatro janelas:
 *
 * "Ações" — o que o agente sugere fazer agora: ajustar o ROAS objetivo,
 * mover verba de um anúncio no prejuízo pra um saudável, ou revisar um
 * anúncio cansado. O seller aprova ou recusa; o NEXO não mexe em nada no
 * marketplace sozinho.
 *
 * "ROAS por anúncio" — a tabela de todos os anúncios em Ads, com o ROAS
 * atual ao lado do ROAS mínimo. Clicar numa linha abre o detalhe: gráfico
 * da trajetória, a conta aberta e o simulador de preço.
 *
 * "Candidatos a Ads" — produtos que vendem bem sozinhos, sem Ads.
 *
 * "Histórico" — as ações já aprovadas ou recusadas.
 */
export function PainelAds({
  analises,
  acoes,
  candidatos,
  carregando,
  opcoesCusto,
  aoDecidirAcao,
  aoDispensarCandidato,
  aoAbrirCriativo,
}: {
  analises: AnaliseRoasAnuncio[];
  acoes: AcaoAds[];
  candidatos: EventoAds[];
  carregando: boolean;
  opcoesCusto: OpcoesLimites;
  aoDecidirAcao: (acao: AcaoAds, status: Extract<StatusSugestao, "aprovada" | "recusada">) => void;
  aoDispensarCandidato: (e: EventoAds) => void;
  aoAbrirCriativo: () => void;
}) {
  const [janela, setJanela] = useState<JanelaAds>("acoes");
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const acoesPendentes = acoes.filter((a) => a.status === "pendente");
  const acoesDecididas = acoes.filter((a) => a.status !== "pendente");
  const candidatosPendentes = candidatos.filter(
    (e) => e.status === "pendente" && e.tipo === "sugestao",
  );
  const detalhe = analises.find((x) => x.anuncio.id === detalheId) ?? null;
  const idsComAnalise = new Set(analises.map((x) => x.anuncio.id));

  return (
    <Painel
      titulo="Ads"
      descricao="Até onde cada anúncio pode ir no Ads sem dar prejuízo, e o que fazer quando passa do limite"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Target className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Agente de Ads</p>
          <p className="text-[10px] text-muted-foreground">
            Compara o ROAS de cada anúncio com o ROAS mínimo que a margem dele aguenta
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b px-4 pt-3">
        {(
          [
            ["acoes", `Ações (${acoesPendentes.length})`],
            ["roas", `ROAS por anúncio (${analises.length})`],
            ["candidatos", `Candidatos a Ads (${candidatosPendentes.length})`],
            ["historico", `Histórico (${acoesDecididas.length})`],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setJanela(id)}
            className={cn(
              "shrink-0 rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
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
          Avaliando os anúncios em Ads...
        </div>
      )}

      {!carregando && janela === "acoes" && (
        <div className="divide-y">
          {acoesPendentes.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-muted-foreground">
                Nenhuma ação sugerida agora. Todos os anúncios em Ads estão dentro do esperado.
              </p>
            </div>
          )}
          {acoesPendentes.map((a) => (
            <CardAcaoAds
              key={a.id}
              acao={a}
              aoDecidir={(status) => aoDecidirAcao(a, status)}
              aoVerDetalhe={idsComAnalise.has(a.anuncioId) ? () => setDetalheId(a.anuncioId) : null}
              aoAbrirCriativo={aoAbrirCriativo}
            />
          ))}
        </div>
      )}

      {!carregando && janela === "roas" && (
        <TabelaRoas analises={analises} aoAbrir={(id) => setDetalheId(id)} />
      )}

      {!carregando && janela === "candidatos" && (
        <TabelaSugestaoAds itens={candidatosPendentes} aoDispensar={aoDispensarCandidato} />
      )}

      {!carregando && janela === "historico" && (
        <div className="divide-y">
          {acoesDecididas.length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-muted-foreground">Nenhuma ação decidida ainda.</p>
            </div>
          )}
          {acoesDecididas.map((a) => (
            <CardAcaoAds
              key={a.id}
              acao={a}
              aoDecidir={null}
              aoVerDetalhe={idsComAnalise.has(a.anuncioId) ? () => setDetalheId(a.anuncioId) : null}
              aoAbrirCriativo={aoAbrirCriativo}
            />
          ))}
        </div>
      )}

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        ROAS mínimo = 1 ÷ margem de contribuição (o que sobra de cada venda antes do Ads, já
        com CMV, comissão, taxa fixa, frete, imposto e promoção ativa). Abaixo dele, o Ads dá
        prejuízo. Janela de avaliação: últimos {DIAS_TESTE_ADS} dias. Sem API conectada, o
        agente sugere mas não altera nada no marketplace.
      </div>

      <DetalheAnuncioAds
        analise={detalhe}
        opcoesCusto={opcoesCusto}
        aoFechar={() => setDetalheId(null)}
      />
    </Painel>
  );
}

/* ------------------------------------------------------------------ */
/* Card de ação                                                        */
/* ------------------------------------------------------------------ */

const COR_SEMAFORO: Record<SemaforoDecisao, string> = {
  verde: "bg-profit",
  amarelo: "bg-warning",
  vermelho: "bg-loss",
};

function CardAcaoAds({
  acao,
  aoDecidir,
  aoVerDetalhe,
  aoAbrirCriativo,
}: {
  acao: AcaoAds;
  /** null = modo histórico (só leitura) */
  aoDecidir: ((status: Extract<StatusSugestao, "aprovada" | "recusada">) => void) | null;
  aoVerDetalhe: (() => void) | null;
  aoAbrirCriativo: () => void;
}) {
  const d = acao.detalhe;
  const titulo =
    d.tipo === "realocacao"
      ? "Mover verba de Ads"
      : d.tipo === "anuncio_cansado"
        ? "Anúncio cansado"
        : d.direcao === "subir"
          ? "Subir o ROAS objetivo"
          : "Baixar o ROAS objetivo";
  const Icone =
    d.tipo === "realocacao"
      ? ArrowRightLeft
      : d.tipo === "anuncio_cansado"
        ? MousePointerClick
        : d.direcao === "subir"
          ? ArrowUpRight
          : ArrowDownRight;

  return (
    <div className="space-y-3 px-4 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("size-2 rounded-full", COR_SEMAFORO[acao.semaforo])} />
        <Icone className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold">{titulo}</span>
        {acao.marketplaceId && <SeloMarketplace id={acao.marketplaceId} />}
        {aoDecidir === null && (
          <span
            className={cn(
              "ml-auto rounded px-2 py-0.5 text-[10px] font-semibold",
              acao.status === "aprovada"
                ? "bg-profit-soft text-profit"
                : "bg-muted text-muted-foreground",
            )}
          >
            {acao.status === "aprovada" ? "Aprovada" : "Recusada"}
          </span>
        )}
      </div>

      {d.tipo !== "realocacao" && (
        <div>
          <p className="text-xs font-medium">{acao.produto}</p>
          <p className="num text-[10px] text-muted-foreground">{acao.sku}</p>
        </div>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">{acao.motivo}</p>

      {d.tipo === "ajuste_roas" && (
        <div className="grid gap-2 sm:grid-cols-4">
          <MiniDado rotulo="ROAS atual (14d)" valor={fmtRoas(d.roasAtual)} />
          <MiniDado rotulo="ROAS mínimo" valor={fmtRoas(d.roasMinimo)} />
          <MiniDado rotulo="Objetivo hoje" valor={fmtRoas(d.roasObjetivoAtual)} />
          <MiniDado
            rotulo="Objetivo sugerido"
            valor={fmtRoas(d.roasObjetivoSugerido)}
            destaque
          />
        </div>
      )}

      {d.tipo === "realocacao" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <LadoRealocacao titulo="Reduzir" lado={d.fonte} cor="loss" />
          <LadoRealocacao titulo="Aumentar" lado={d.destino} cor="profit" />
          <p className="text-[10px] leading-relaxed text-muted-foreground sm:col-span-2">
            <strong>Como fazer:</strong> no Ads do marketplace, suba o ROAS objetivo do anúncio
            que está no prejuízo (pra plataforma gastar menos nele) e baixe o do anúncio
            saudável (pra ele aparecer mais).
          </p>
        </div>
      )}

      {d.tipo === "anuncio_cansado" && (
        <div className="grid gap-2 sm:grid-cols-4">
          <MiniDado rotulo="Cliques (14d)" valor={formatNumero(d.cliques)} />
          <MiniDado rotulo="Vendas (14d)" valor={formatNumero(d.vendas)} />
          <MiniDado
            rotulo="Conversão"
            valor={formatPercentual(d.conversao, 2)}
            aviso={d.conversao < CONVERSAO_MAXIMA_CANSADO}
          />
          <MiniDado rotulo="Gasto (14d)" valor={formatBRL(d.investimento)} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {aoVerDetalhe && (
          <Button size="sm" variant="ghost" onClick={aoVerDetalhe}>
            Ver detalhes do anúncio
          </Button>
        )}
        {d.tipo === "anuncio_cansado" && (
          <Button size="sm" variant="outline" onClick={aoAbrirCriativo}>
            <Wand2 className="size-3.5" />
            Revisar no Criativo
          </Button>
        )}
        {aoDecidir && (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="outline" onClick={() => aoDecidir("recusada")}>
              <X className="size-3.5" />
              Recusar
            </Button>
            <Button size="sm" onClick={() => aoDecidir("aprovada")}>
              <Check className="size-3.5" />
              Aprovar
            </Button>
          </div>
        )}
        {aoDecidir === null && acao.decididoEm && (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="size-3" />
            {new Date(acao.decididoEm).toLocaleDateString("pt-BR")}
          </span>
        )}
      </div>
    </div>
  );
}

function MiniDado({
  rotulo,
  valor,
  destaque = false,
  aviso = false,
}: {
  rotulo: string;
  valor: string;
  destaque?: boolean;
  aviso?: boolean;
}) {
  return (
    <div className={cn("rounded-lg px-3 py-2", destaque ? "bg-brand/10" : "bg-muted")}>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "num text-sm font-bold",
          destaque && "text-brand",
          aviso && "text-loss",
        )}
      >
        {valor}
      </p>
    </div>
  );
}

function LadoRealocacao({
  titulo,
  lado: l,
  cor,
}: {
  titulo: string;
  lado: LadoRealocacaoAds;
  cor: "loss" | "profit";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-3 py-2",
        cor === "loss" ? "border-loss/30 bg-loss-soft" : "border-profit/30 bg-profit-soft",
      )}
    >
      <p
        className={cn(
          "text-[10px] font-bold uppercase tracking-wide",
          cor === "loss" ? "text-loss" : "text-profit",
        )}
      >
        {titulo} · curva {l.classe ?? "—"}
      </p>
      <p className="truncate text-xs font-medium">{l.produto}</p>
      <p className="num text-[10px] text-muted-foreground">{l.sku}</p>
      <p className="num mt-1 text-[11px]">
        ROAS {fmtRoas(l.roasAtual)} · mínimo {fmtRoas(l.roasMinimo)}
      </p>
      <p className="num text-[10px] text-muted-foreground">
        Gasto em 14 dias: {formatBRL(l.investimento)}
        {cor === "profit" && l.coberturaEstoqueDias !== null
          ? ` · estoque pra ${l.coberturaEstoqueDias} dias`
          : ""}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabela "ROAS por anúncio"                                           */
/* ------------------------------------------------------------------ */

function rotuloSituacao(x: AnaliseRoasAnuncio): { texto: string; cor: string; ponto: string } {
  if (!x.calculavel) {
    return {
      texto: "Sem custo cadastrado",
      cor: "bg-muted text-muted-foreground",
      ponto: "bg-muted-foreground",
    };
  }
  if (x.contribuicao.roasMinimo === null) {
    return { texto: "Prejuízo mesmo sem Ads", cor: "bg-loss-soft text-loss", ponto: "bg-loss" };
  }
  if (x.semaforo === "verde") {
    return { texto: "Saudável", cor: "bg-profit-soft text-profit", ponto: "bg-profit" };
  }
  if (x.semaforo === "amarelo") {
    return { texto: "Perto do mínimo", cor: "bg-warning/15 text-warning", ponto: "bg-warning" };
  }
  return { texto: "Abaixo do mínimo", cor: "bg-loss-soft text-loss", ponto: "bg-loss" };
}

function TabelaRoas({
  analises,
  aoAbrir,
}: {
  analises: AnaliseRoasAnuncio[];
  aoAbrir: (anuncioId: string) => void;
}) {
  // Quem está pior aparece primeiro: é onde o seller precisa olhar.
  const ordenadas = useMemo(() => {
    const peso: Record<SemaforoDecisao, number> = { vermelho: 0, amarelo: 1, verde: 2 };
    return [...analises].sort(
      (a, b) => peso[a.semaforo] - peso[b.semaforo] || b.investimento - a.investimento,
    );
  }, [analises]);

  if (analises.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-xs text-muted-foreground">Nenhum anúncio com Ads ativo agora.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[960px] text-left">
        <thead>
          <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-bold">Produto / SKU</th>
            <th className="px-4 py-3 font-bold">Curva</th>
            <th className="px-4 py-3 text-right font-bold">ROAS atual</th>
            <th className="px-4 py-3 text-right font-bold">ROAS mínimo</th>
            <th className="px-4 py-3 text-right font-bold">ROAS objetivo</th>
            <th className="px-4 py-3 text-right font-bold">Gasto (14d)</th>
            <th className="px-4 py-3 text-right font-bold">Lucro do Ads (14d)</th>
            <th className="px-4 py-3 font-bold">Situação</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {ordenadas.map((x) => {
            const s = rotuloSituacao(x);
            return (
              <tr
                key={x.anuncio.id}
                onClick={() => aoAbrir(x.anuncio.id)}
                className="cursor-pointer transition-colors hover:bg-muted/40"
              >
                <td className="max-w-[260px] px-4 py-3">
                  <div className="flex items-center gap-2">
                    <SeloMarketplace id={x.anuncio.marketplaceId} />
                    <p className="truncate text-xs font-medium">{x.anuncio.produto}</p>
                  </div>
                  <p className="num text-[10px] text-muted-foreground">{x.anuncio.sku}</p>
                </td>
                <td className="px-4 py-3 text-xs font-semibold">{x.classe ?? "—"}</td>
                <td
                  className={cn(
                    "num px-4 py-3 text-right text-xs font-bold",
                    x.semaforo === "verde"
                      ? "text-profit"
                      : x.semaforo === "amarelo"
                        ? "text-warning"
                        : "text-loss",
                  )}
                >
                  {fmtRoas(x.roasAtual)}
                </td>
                <td className="num px-4 py-3 text-right text-xs">
                  {x.calculavel ? fmtRoas(x.contribuicao.roasMinimo) : "—"}
                </td>
                <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                  {fmtRoas(x.anuncio.roasObjetivo)}
                </td>
                <td className="num px-4 py-3 text-right text-xs">{formatBRL(x.investimento)}</td>
                <td
                  className={cn(
                    "num px-4 py-3 text-right text-xs font-semibold",
                    x.lucroAds >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {x.calculavel ? formatBRL(x.lucroAds) : "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold",
                      s.cor,
                    )}
                  >
                    <span className={cn("size-1.5 rounded-full", s.ponto)} />
                    {s.texto}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[10px] text-muted-foreground">
        Clique num anúncio pra ver o gráfico, a conta aberta e simular outro preço. Saudável =
        ROAS pelo menos {formatPercentual(FOLGA_ROAS_ADS, 0)} acima do mínimo.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detalhe de um anúncio (painel lateral)                              */
/* ------------------------------------------------------------------ */

function DetalheAnuncioAds({
  analise,
  opcoesCusto,
  aoFechar,
}: {
  analise: AnaliseRoasAnuncio | null;
  opcoesCusto: OpcoesLimites;
  aoFechar: () => void;
}) {
  return (
    <Sheet open={analise !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {analise && <ConteudoDetalheAds analise={analise} opcoesCusto={opcoesCusto} />}
      </SheetContent>
    </Sheet>
  );
}

function ConteudoDetalheAds({
  analise: x,
  opcoesCusto,
}: {
  analise: AnaliseRoasAnuncio;
  opcoesCusto: OpcoesLimites;
}) {
  const [precoSimulado, setPrecoSimulado] = useState("");
  const minimo = x.contribuicao.roasMinimo;
  const c = x.contribuicao;

  const dadosGrafico = x.trajetoria.map((p) => ({
    dia: `${p.data.slice(8, 10)}/${p.data.slice(5, 7)}`,
    roas: p.roas === null ? null : Math.round(p.roas * 10) / 10,
  }));

  const precoNumero = Number(precoSimulado.replace(",", "."));
  const simulacao =
    precoSimulado.trim() !== "" && Number.isFinite(precoNumero) && precoNumero > 0
      ? contribuicaoAnuncio(x.anuncio, precoNumero, opcoesCusto)
      : null;

  const linhas: { rotulo: string; valor: number }[] = [
    { rotulo: "(−) CMV", valor: c.cmv },
    { rotulo: "(−) Comissão", valor: c.comissao },
    { rotulo: "(−) Taxa fixa", valor: c.taxaFixa },
    { rotulo: "(−) Frete", valor: c.frete },
    { rotulo: "(−) Imposto", valor: c.impostos },
  ];
  if (c.afiliados > 0) linhas.push({ rotulo: "(−) Afiliados", valor: c.afiliados });
  if (c.custosOperacionais > 0) {
    linhas.push({ rotulo: "(−) Custos operacionais", valor: c.custosOperacionais });
  }

  return (
    <div className="space-y-5">
      <SheetHeader>
        <div className="flex items-center gap-2">
          <SeloMarketplace id={x.anuncio.marketplaceId} />
          <span className="text-[10px] text-muted-foreground">Curva {x.classe ?? "—"}</span>
        </div>
        <SheetTitle className="text-base">{x.anuncio.produto}</SheetTitle>
        <SheetDescription className="num">{x.anuncio.sku}</SheetDescription>
      </SheetHeader>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniDado rotulo="ROAS atual" valor={fmtRoas(x.roasAtual)} destaque />
        <MiniDado rotulo="ROAS mínimo" valor={x.calculavel ? fmtRoas(minimo) : "—"} />
        <MiniDado rotulo="ROAS objetivo" valor={fmtRoas(x.anuncio.roasObjetivo)} />
        <MiniDado
          rotulo="Conversão"
          valor={x.conversao === null ? "—" : formatPercentual(x.conversao, 2)}
        />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold">Trajetória do ROAS</p>
        <p className="mb-2 text-[10px] text-muted-foreground">
          Cada ponto é o ROAS dos 7 dias anteriores, pra um dia ruim isolado não parecer queda.
          A linha tracejada é o ROAS mínimo: abaixo dela, o Ads dá prejuízo.
        </p>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dadosGrafico}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
              <YAxis tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" width={32} />
              <ChartTooltip
                formatter={(v) => [fmtRoas(typeof v === "number" ? v : Number(v)), "ROAS"]}
                contentStyle={{ fontSize: 11 }}
              />
              {x.calculavel && minimo !== null && (
                <ReferenceLine
                  y={minimo}
                  stroke="var(--loss)"
                  strokeDasharray="6 4"
                  label={{
                    value: `mínimo ${fmtRoas(minimo)}`,
                    fontSize: 10,
                    fill: "var(--loss)",
                    position: "insideTopRight",
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="roas"
                stroke="var(--brand)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold">Últimos {DIAS_TESTE_ADS} dias</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <MiniDado rotulo="Gasto em Ads" valor={formatBRL(x.investimento)} />
          <MiniDado rotulo="Faturamento via Ads" valor={formatBRL(x.faturamento)} />
          <MiniDado
            rotulo="Lucro do Ads"
            valor={x.calculavel ? formatBRL(x.lucroAds) : "—"}
            aviso={x.calculavel && x.lucroAds < 0}
          />
          <MiniDado rotulo="Cliques" valor={formatNumero(x.cliques)} />
          <MiniDado rotulo="Vendas via Ads" valor={formatNumero(x.vendas)} />
          <MiniDado rotulo="Dias seguidos abaixo" valor={formatNumero(x.diasSeguidosAbaixo)} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold">De onde sai o ROAS mínimo (por venda)</p>
        {!x.calculavel && (
          <p className="mb-2 rounded-lg bg-muted px-3 py-2 text-[11px] text-warning">
            Este anúncio está sem custo (CMV) cadastrado. Sem ele, o ROAS mínimo não é
            confiável. Cadastre o custo em Custos.
          </p>
        )}
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-xs">
            <tbody className="divide-y">
              <tr>
                <td className="px-3 py-2">Preço de venda</td>
                <td className="num px-3 py-2 text-right font-semibold">{formatBRL(c.preco)}</td>
              </tr>
              {linhas.map((l) => (
                <tr key={l.rotulo}>
                  <td className="px-3 py-2 text-muted-foreground">{l.rotulo}</td>
                  <td className="num px-3 py-2 text-right text-muted-foreground">
                    {formatBRL(l.valor)}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/50">
                <td className="px-3 py-2 font-semibold">= Margem de contribuição</td>
                <td
                  className={cn(
                    "num px-3 py-2 text-right font-bold",
                    c.contribuicao > 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {formatBRL(c.contribuicao)} ({formatPercentual(c.margemContribuicao)})
                </td>
              </tr>
              <tr className="bg-muted/50">
                <td className="px-3 py-2 font-semibold">ROAS mínimo (1 ÷ margem)</td>
                <td className="num px-3 py-2 text-right font-bold">
                  {minimo === null ? "Prejuízo mesmo sem Ads" : fmtRoas(minimo)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {x.anuncio.emPromocao && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Este anúncio está em promoção: a conta já usa o preço promocional, por isso o ROAS
            mínimo fica mais alto enquanto a promoção durar.
          </p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold">Simular outro preço</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">R$</span>
          <Input
            inputMode="decimal"
            placeholder={c.preco.toFixed(2).replace(".", ",")}
            value={precoSimulado}
            onChange={(e) => setPrecoSimulado(e.target.value)}
            className="max-w-[140px]"
          />
        </div>
        {simulacao && (
          <p className="mt-2 text-xs leading-relaxed">
            Nesse preço, a margem de contribuição fica em{" "}
            <strong>{formatPercentual(simulacao.margemContribuicao)}</strong> e o ROAS mínimo
            vai pra{" "}
            <strong>
              {simulacao.roasMinimo === null
                ? "— (prejuízo mesmo sem Ads)"
                : fmtRoas(simulacao.roasMinimo)}
            </strong>
            {minimo !== null && simulacao.roasMinimo !== null && (
              <span className="text-muted-foreground"> (hoje é {fmtRoas(minimo)})</span>
            )}
            .
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Candidatos a Ads (a antiga "Sugestão de anúncio")                   */
/* ------------------------------------------------------------------ */

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
