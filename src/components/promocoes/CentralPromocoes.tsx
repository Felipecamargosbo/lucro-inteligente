/**
 * Central de promoções do Planeta97: o reflexo da Precificação.
 *
 * - Para cada anúncio: a situação da promoção (verde = ativa no preço
 *   planejado; amarelo = ativa em outro valor; vermelho = sem promoção, o
 *   cliente paga o cheio) — a MESMA da linha da Precificação.
 * - As propostas do canal (campanhas do ML) com o lucro e a margem de
 *   verdade (CMV, comissão, frete do canal, imposto...) e se "cabe" na
 *   margem mínima. "Participar" manda direto pro canal.
 * - Criar promoção (desconto por %) pelo próprio painel.
 */
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, ExternalLink, Loader2, Plus, Search } from "lucide-react";
import { anunciosService, precosMlService, promocoesService } from "@/services";
import { useBasePrecificacao } from "@/hooks/use-base-precificacao";
import { pedirCustos, custosEm, useVersaoCustos } from "@/lib/custos-canal";
import {
  DESCONTO_MAX_ML,
  DESCONTO_MIN_ML,
  PROMOCAO_COM_PRECO,
  ROTULO_TIPO_PROMOCAO,
  anunciosVisiveis,
  centavos,
  type ContaDaLinha,
} from "@/lib/linha-preco";
import { lerNumero } from "@/lib/precificacao";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { CardKpi, Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import type { Anuncio, Promocao } from "@/types";

/** Telas do Mercado Livre para o que a API não cria. */
const LINK_ML = {
  central: "https://vendedores.mercadolivre.com.br/anuncios/lista/promos",
  quantidade: "https://vendedores.mercadolivre.com.br/anuncios/lista/promos/campanhas/crio/quantidade",
  cupom: "https://vendedores.mercadolivre.com.br/anuncios/lista/promos/coupon-manager/criar/all_users",
};

const POR_PAGINA = 25;

const dataCurta = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";

const diasAte = (iso: string | null | undefined) =>
  iso ? Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000) : null;

type FiltroSituacao = "todos" | "sem-promocao" | "ativa" | "outro-valor" | "com-propostas" | "vencendo";

type NoPreco = (a: Anuncio, preco: number) => { lucro: number; margem: number };

interface ItemPromocao {
  anuncio: Anuncio;
  conta: ContaDaLinha;
  propostas: Promocao[];
  margemMinima: number;
}

export function CentralPromocoes() {
  const base = useBasePrecificacao();
  const versaoCustos = useVersaoCustos();
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<FiltroSituacao>("todos");
  const [campanhaFiltro, setCampanhaFiltro] = useState<string>("todas");
  const [pagina, setPagina] = useState(0);
  const [criarAberto, setCriarAberto] = useState(false);
  const [tick, setTick] = useState(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const anuncios = useMemo(() => anunciosVisiveis(anunciosService.listar()), [tick, base.pronto]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const promocoes = useMemo(() => promocoesService.listar(), [tick]);

  const itens = useMemo<ItemPromocao[]>(() => {
    const porAnuncio = new Map<string, Promocao[]>();
    const porSku = new Map<string, Promocao[]>();
    for (const p of promocoes) {
      if (p.anuncioId) porAnuncio.set(p.anuncioId, [...(porAnuncio.get(p.anuncioId) ?? []), p]);
      else porSku.set(p.sku, [...(porSku.get(p.sku) ?? []), p]);
    }
    return anuncios
      .map((a) => ({
        anuncio: a,
        conta: base.linha(a),
        propostas: porAnuncio.get(a.id) ?? porSku.get(a.sku) ?? [],
        margemMinima: base.margemMinimaDe(a),
      }))
      .filter((i) => i.propostas.length > 0 || i.conta.estadoPromocao !== "nenhuma");
    // versaoCustos: o lucro de cada proposta usa o frete do canal naquele preço
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anuncios, promocoes, base.linha, base.margemMinimaDe, versaoCustos]);

  const campanhas = useMemo(() => {
    const mapa = new Map<
      string,
      { id: string; nome: string; tipo: string | null; inicio: string | null; fim: string | null; prazo: string | null; disponiveis: number; participando: number }
    >();
    for (const p of promocoes) {
      const id = p.idPromocao ?? p.campanha ?? p.tipo;
      const c = mapa.get(id) ?? {
        id,
        nome: p.campanha ?? p.tipo,
        tipo: p.tipoPromocao ?? null,
        inicio: p.inicio ?? null,
        fim: p.fim ?? null,
        prazo: p.prazoAdesao ?? null,
        disponiveis: 0,
        participando: 0,
      };
      if (p.situacao === "participando") c.participando++;
      else c.disponiveis++;
      mapa.set(id, c);
    }
    return [...mapa.values()].sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""));
  }, [promocoes]);

  /** Cada proposta já com lucro e margem de verdade. */
  const avaliar = (i: ItemPromocao, p: Promocao) => {
    const preco = p.precoFinal;
    const det = base.noPreco(i.anuncio, preco);
    const desconto = i.conta.cheioCanal > 0 ? 1 - preco / i.conta.cheioCanal : 0;
    return {
      preco,
      det,
      desconto,
      voceRecebe: preco - det.comissao - det.taxaFixa - det.frete,
      cabe: det.margem >= i.margemMinima,
      prejuizo: det.lucro < 0,
    };
  };

  // Avisos (o que o seller precisa olhar hoje)
  const semPromocao = itens.filter((i) => i.conta.estadoPromocao === "sem-promocao");
  const outroValor = itens.filter((i) => i.conta.estadoPromocao === "outro-valor");
  const ativas = itens.filter((i) => i.anuncio.promocaoAtiva);
  const vencendo = ativas.filter((i) => {
    const d = diasAte(i.anuncio.promocaoAtiva?.fim);
    return d !== null && d >= 0 && d <= 2;
  });
  const ativasAbaixo = ativas.filter((i) => i.conta.det.margem < i.margemMinima && !i.conta.simulacao);
  const propostasDisponiveis = itens.flatMap((i) =>
    i.propostas.filter((p) => p.situacao !== "participando").map((p) => ({ i, p, r: avaliar(i, p) })),
  );
  const cabem = propostasDisponiveis.filter((x) => x.r.cabe).length;
  const naoCabem = propostasDisponiveis.length - cabem;
  const margemMediaAtivas =
    ativas.length > 0 ? ativas.reduce((s, i) => s + (i.conta.simulacao ? i.conta.detAgora : i.conta.det).margem, 0) / ativas.length : 0;

  const termo = busca.trim().toLowerCase();
  const filtrados = itens.filter((i) => {
    if (termo && !`${i.anuncio.produto} ${i.anuncio.sku} ${i.anuncio.idExterno ?? ""}`.toLowerCase().includes(termo)) return false;
    if (campanhaFiltro !== "todas" && !i.propostas.some((p) => (p.idPromocao ?? p.campanha ?? p.tipo) === campanhaFiltro)) return false;
    switch (filtro) {
      case "sem-promocao":
      case "ativa":
      case "outro-valor":
        return i.conta.estadoPromocao === filtro;
      case "com-propostas":
        return i.propostas.some((p) => p.situacao !== "participando");
      case "vencendo":
        return vencendo.includes(i);
      default:
        return true;
    }
  });
  // Primeiro o que pede ação: sem promoção, depois outro valor, depois o resto.
  const ordem = { "sem-promocao": 0, "outro-valor": 1, ativa: 2, nenhuma: 3 } as const;
  filtrados.sort((x, y) => ordem[x.conta.estadoPromocao] - ordem[y.conta.estadoPromocao]);
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtrados.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);

  // Frete do canal no preço de cada proposta da página.
  useEffect(() => {
    for (const i of visiveis) {
      for (const p of i.propostas) if (Math.abs(p.precoFinal - i.anuncio.precoAtual) >= 0.005) pedirCustos(i.anuncio.id, p.precoFinal);
      if (i.conta.planoPromo) pedirCustos(i.anuncio.id, i.conta.planoPromo);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiveis.map((i) => i.anuncio.id).join(",")]);

  const mudarFiltro = (f: FiltroSituacao) => {
    setFiltro(f);
    setPagina(0);
  };

  const aposAcao = () => {
    setTick((t) => t + 1);
    toast("Pode levar alguns minutos para aparecer no Mercado Livre.", {
      description: "Use \"Atualizar anúncios\" na Precificação para confirmar a situação.",
    });
  };

  if (!base.pronto) {
    return (
      <div className="flex items-center gap-2 py-16 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando promoções...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Anúncios em promoção agora"
          valor={formatNumero(ativas.length)}
          detalhe={`Margem média real: ${formatPercentual(margemMediaAtivas)}`}
        />
        <CardKpi
          titulo="Sem promoção ativa"
          valor={formatNumero(semPromocao.length)}
          detalhe="Têm desconto planejado na Precificação, mas o cliente paga o cheio"
        />
        <CardKpi
          titulo="Propostas do canal que cabem"
          valor={`${formatNumero(cabem)} de ${formatNumero(propostasDisponiveis.length)}`}
          detalhe="Acima da margem mínima, com CMV, frete e taxas"
          destaque
        />
        <CardKpi
          titulo="Campanhas abertas"
          valor={formatNumero(campanhas.length)}
          detalhe={`${formatNumero(vencendo.length)} promoção(ões) vencem em até 2 dias`}
        />
      </div>

      {/* Avisos */}
      {(semPromocao.length > 0 || vencendo.length > 0 || ativasAbaixo.length > 0 || outroValor.length > 0 || naoCabem > 0) && (
        <Painel titulo="Avisos" descricao="O que pede atenção nas suas promoções hoje">
          <div className="divide-y text-xs">
            {semPromocao.length > 0 && (
              <Aviso
                cor="loss"
                texto={`${semPromocao.length} anúncio(s) com desconto planejado e nenhuma promoção valendo: o cliente está pagando o preço cheio.`}
                acao="Ver e criar promoção"
                aoClicar={() => mudarFiltro("sem-promocao")}
              />
            )}
            {vencendo.length > 0 && (
              <Aviso
                cor="warning"
                texto={`${vencendo.length} promoção(ões) vencem em até 2 dias. Quando vencer, o preço volta para o cheio.`}
                acao="Ver quais"
                aoClicar={() => mudarFiltro("vencendo")}
              />
            )}
            {outroValor.length > 0 && (
              <Aviso
                cor="warning"
                texto={`${outroValor.length} anúncio(s) em promoção num valor diferente do planejado (a margem mostrada é a do preço real).`}
                acao="Ver quais"
                aoClicar={() => mudarFiltro("outro-valor")}
              />
            )}
            {ativasAbaixo.length > 0 && (
              <Aviso
                cor="loss"
                texto={`${ativasAbaixo.length} anúncio(s) em promoção abaixo da margem mínima da conta.`}
                acao="Ver quais"
                aoClicar={() => mudarFiltro("ativa")}
              />
            )}
            {naoCabem > 0 && (
              <Aviso
                cor="muted"
                texto={`${naoCabem} proposta(s) do canal ficam abaixo da margem mínima — não vale entrar sem rever o preço cheio.`}
                acao="Ver propostas"
                aoClicar={() => mudarFiltro("com-propostas")}
              />
            )}
          </div>
        </Painel>
      )}

      {/* Campanhas (calendário) */}
      <Painel
        titulo="Campanhas"
        descricao="As do Mercado Livre e as suas, com as datas"
        acoes={
          <Button size="sm" onClick={() => setCriarAberto(true)}>
            <Plus className="size-3.5" />
            Criar promoção
          </Button>
        }
      >
        {campanhas.length === 0 ? (
          <p className="p-5 text-xs text-muted-foreground">Nenhuma campanha aberta no canal agora.</p>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {campanhas.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setCampanhaFiltro(campanhaFiltro === c.id ? "todas" : c.id);
                  setPagina(0);
                }}
                className={cn(
                  "rounded-lg border p-3 text-left transition-colors hover:bg-muted/40",
                  campanhaFiltro === c.id && "border-brand bg-brand/5",
                )}
              >
                <p className="truncate text-xs font-semibold">{c.nome}</p>
                <p className="text-[10px] text-muted-foreground">
                  {c.tipo ? (ROTULO_TIPO_PROMOCAO[c.tipo] ?? c.tipo) : "Campanha"}
                </p>
                <p className="mt-1.5 flex items-center gap-1 text-[11px]">
                  <CalendarDays className="size-3 text-muted-foreground" />
                  {dataCurta(c.inicio)} → {dataCurta(c.fim)}
                </p>
                {c.prazo && c.disponiveis > 0 && (
                  <p className="text-[10px] text-muted-foreground">Entrar até {dataCurta(c.prazo)}</p>
                )}
                <p className="mt-1 text-[10px]">
                  <span className="font-semibold text-profit">{c.participando} participando</span>
                  {" · "}
                  <span className="text-muted-foreground">{c.disponiveis} podem entrar</span>
                </p>
              </button>
            ))}
          </div>
        )}
      </Painel>

      {/* Por anúncio */}
      <Painel
        titulo="Por anúncio"
        descricao="A situação de cada anúncio (igual à Precificação) e as propostas do canal com o lucro de verdade"
      >
        <div className="flex flex-wrap items-end gap-3 border-b p-4">
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2 size-3.5 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  setPagina(0);
                }}
                placeholder="Nome, SKU ou MLB"
                className="h-8 w-52 pl-7 text-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Situação</Label>
            <Select value={filtro} onValueChange={(v) => mudarFiltro(v as FiltroSituacao)}>
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="sem-promocao">Sem promoção ativa</SelectItem>
                <SelectItem value="ativa">Promoção ativa</SelectItem>
                <SelectItem value="outro-valor">Ativa em outro valor</SelectItem>
                <SelectItem value="vencendo">Vencendo em até 2 dias</SelectItem>
                <SelectItem value="com-propostas">Com proposta do canal pra entrar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {campanhaFiltro !== "todas" && (
            <Button size="sm" variant="ghost" className="h-8 text-[11px]" onClick={() => setCampanhaFiltro("todas")}>
              Todas as campanhas
            </Button>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">
            {formatNumero(filtrados.length)} anúncio(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1250px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[9px] uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2.5 font-bold">Promoção</th>
                <th className="px-2 py-2.5 font-bold">Período</th>
                <th className="px-2 py-2.5 text-right font-bold">Desconto</th>
                <th className="px-2 py-2.5 text-right font-bold">Preço final</th>
                <th className="px-2 py-2.5 text-right font-bold">ML ajuda</th>
                <th className="px-2 py-2.5 text-right font-bold">Você recebe</th>
                <th className="px-2 py-2.5 text-right font-bold">Lucro</th>
                <th className="px-2 py-2.5 text-right font-bold">Margem</th>
                <th className="px-2 py-2.5 text-center font-bold">Cabe?</th>
                <th className="px-3 py-2.5 text-right font-bold">Ação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((i) => (
                <BlocoAnuncio key={i.anuncio.id} item={i} avaliar={avaliar} aoAgir={aposAcao} noPreco={base.noPreco} />
              ))}
              {visiveis.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    Nenhum anúncio com esses filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {totalPaginas > 1 && (
          <div className="flex items-center justify-end gap-2 border-t px-4 py-2 text-[11px]">
            <Button size="sm" variant="outline" className="h-7" disabled={paginaAtual === 0} onClick={() => setPagina(paginaAtual - 1)}>
              Anterior
            </Button>
            <span>
              {paginaAtual + 1} de {totalPaginas}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={paginaAtual >= totalPaginas - 1}
              onClick={() => setPagina(paginaAtual + 1)}
            >
              Próxima
            </Button>
          </div>
        )}
        <p className="border-t px-4 py-3 text-[10px] text-muted-foreground">
          <strong>Lucro e margem</strong> já descontam CMV, comissão, frete que o Mercado Livre cobra nesse preço,
          imposto, Ads e outros custos — os mesmos da Precificação. <strong>Cabe</strong> = fica acima da margem
          mínima da conta. <strong>ML ajuda</strong> = parte do desconto que o Mercado Livre banca.
        </p>
      </Painel>

      {criarAberto && (
        <DialogCriarPromocao
          itens={itens}
          noPreco={base.noPreco}
          aoFechar={() => setCriarAberto(false)}
          aoConcluir={() => {
            setCriarAberto(false);
            aposAcao();
          }}
        />
      )}
    </div>
  );
}

function Aviso({
  cor,
  texto,
  acao,
  aoClicar,
}: {
  cor: "loss" | "warning" | "muted";
  texto: string;
  acao: string;
  aoClicar: () => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <AlertTriangle
        className={cn(
          "size-4 shrink-0",
          cor === "loss" ? "text-loss" : cor === "warning" ? "text-warning" : "text-muted-foreground",
        )}
      />
      <span className="flex-1">{texto}</span>
      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={aoClicar}>
        {acao}
      </Button>
    </div>
  );
}

/** Um anúncio: a situação (igual à Precificação) e as propostas do canal. */
function BlocoAnuncio({
  item: i,
  avaliar,
  aoAgir,
  noPreco,
}: {
  noPreco: NoPreco;
  item: ItemPromocao;
  avaliar: (i: ItemPromocao, p: Promocao) => {
    preco: number;
    det: { lucro: number; margem: number };
    desconto: number;
    voceRecebe: number;
    cabe: boolean;
    prejuizo: boolean;
  };
  aoAgir: () => void;
}) {
  const a = i.anuncio;
  const c = i.conta;
  const ativa = a.promocaoAtiva ?? null;
  const real = c.simulacao ? c.detAgora : c.det;
  const estilo = {
    ativa: "border-l-profit",
    "outro-valor": "border-l-warning",
    "sem-promocao": "border-l-loss",
    nenhuma: "border-l-transparent",
  }[c.estadoPromocao];

  return (
    <>
      <tr className={cn("border-t-2 border-border border-l-4 bg-muted/30", estilo)}>
        <td colSpan={10} className="px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="max-w-[380px] truncate text-xs font-bold" title={a.produto}>
              {a.produto}
            </span>
            <span className="num text-[10px] text-muted-foreground">SKU {a.sku}</span>
            <SeloMarketplace id={a.marketplaceId} />
            {a.catalogo !== undefined && a.catalogo !== null && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase">
                {a.catalogo ? "Catálogo" : "Tradicional"}
              </span>
            )}
            {c.estadoPromocao === "ativa" && ativa && (
              <span className="rounded bg-profit/10 px-2 py-0.5 text-[11px] font-semibold text-profit">
                Em promoção · {ativa.nome}
                {ativa.fim ? ` até ${dataCurta(ativa.fim)}` : ""} · cliente paga {formatBRL(ativa.preco)}
              </span>
            )}
            {c.estadoPromocao === "outro-valor" && ativa && (
              <span className="rounded bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning">
                Em promoção a {formatBRL(ativa.preco)} · planejado {formatBRL(c.planoPromo ?? 0)}
              </span>
            )}
            {c.estadoPromocao === "sem-promocao" && (
              <span className="inline-flex items-center gap-1 rounded bg-loss-soft/50 px-2 py-0.5 text-[11px] font-semibold text-loss">
                <AlertTriangle className="size-3" /> Sem promoção ativa · cliente paga o cheio {formatBRL(c.precoCliente)}
                {c.planoPromo ? ` (planejado ${formatBRL(c.planoPromo)})` : ""}
              </span>
            )}
            <span className="ml-auto text-[11px] text-muted-foreground">
              Cheio no canal <strong className="num text-foreground">{formatBRL(c.cheioCanal)}</strong>
              {c.planoCheio && Math.abs(c.planoCheio - c.cheioCanal) >= 0.01 && (
                <span className="text-brand"> (planejado {formatBRL(c.planoCheio)}, falta lançar)</span>
              )}
              {" · "}agora: lucro{" "}
              <strong className={cn("num", real.lucro < 0 ? "text-loss" : "text-foreground")}>{formatBRL(real.lucro)}</strong>
              {" · "}margem{" "}
              <strong className={cn("num", real.margem < i.margemMinima ? "text-loss" : "text-profit")}>
                {formatPercentual(real.margem)}
              </strong>
            </span>
          </div>
        </td>
      </tr>
      {i.propostas.length === 0 && (
        <tr className="border-t border-border/40">
          <td colSpan={10} className="px-6 py-2 text-[11px] text-muted-foreground">
            Nenhuma campanha do canal para este anúncio agora. Crie uma promoção em “Criar promoção”.
          </td>
        </tr>
      )}
      {i.propostas.map((p) => (
        <LinhaProposta key={p.id} item={i} p={p} r={avaliar(i, p)} aoAgir={aoAgir} noPreco={noPreco} />
      ))}
    </>
  );
}

function LinhaProposta({
  item: i,
  p,
  r,
  aoAgir,
  noPreco,
}: {
  noPreco: NoPreco;
  item: ItemPromocao;
  p: Promocao;
  r: { preco: number; det: { lucro: number; margem: number }; desconto: number; voceRecebe: number; cabe: boolean; prejuizo: boolean };
  aoAgir: () => void;
}) {
  const [enviando, setEnviando] = useState(false);
  const participando = p.situacao === "participando";
  const tipo = p.tipoPromocao ?? null;
  const freteCarregando =
    Math.abs(r.preco - i.anuncio.precoAtual) >= 0.005 && custosEm(i.anuncio.id, r.preco) === undefined;

  const sair = async () => {
    if (!p.idPromocao || !tipo || !i.anuncio.id) return;
    setEnviando(true);
    const erro = await precosMlService.sair({ anuncioId: i.anuncio.id, idPromocao: p.idPromocao, tipo, offerId: p.offerId });
    setEnviando(false);
    if (erro) toast.error(erro);
    else {
      p.situacao = "disponivel";
      toast.success(`${i.anuncio.produto}: saiu de "${p.campanha ?? p.tipo}".`);
      aoAgir();
    }
  };

  return (
    <tr className="border-t border-border/40 text-xs hover:bg-muted/20">
      <td className="px-3 py-2 pl-6">
        <p className="font-medium">{p.campanha ?? p.tipo}</p>
        <p className="text-[10px] text-muted-foreground">
          {tipo ? (ROTULO_TIPO_PROMOCAO[tipo] ?? tipo) : "Campanha"} · {participando ? "Participando" : "Pode entrar"}
        </p>
      </td>
      <td className="px-2 py-2 text-[11px]">
        {dataCurta(p.inicio)} → {dataCurta(p.fim)}
        {!participando && p.prazoAdesao && (
          <span className="block text-[10px] text-muted-foreground">entrar até {dataCurta(p.prazoAdesao)}</span>
        )}
      </td>
      <td className="num px-2 py-2 text-right">{formatPercentual(r.desconto)}</td>
      <td className="num px-2 py-2 text-right font-semibold">
        {formatBRL(r.preco)}
        {p.precoMinimo && p.precoMaximo && !participando && (
          <span className="block text-[9px] font-normal text-muted-foreground">
            aceita {formatBRL(p.precoMinimo)} a {formatBRL(p.precoMaximo)}
          </span>
        )}
      </td>
      <td className="num px-2 py-2 text-right text-muted-foreground">
        {p.descontoCanalPercentual ? `${formatNumero(p.descontoCanalPercentual)}%` : "—"}
      </td>
      <td className="num px-2 py-2 text-right">
        {freteCarregando ? <Loader2 className="ml-auto size-3 animate-spin" /> : formatBRL(r.voceRecebe)}
      </td>
      <td className={cn("num px-2 py-2 text-right font-bold", r.prejuizo && "text-loss")}>{formatBRL(r.det.lucro)}</td>
      <td
        className={cn(
          "num px-2 py-2 text-right font-bold",
          r.prejuizo ? "text-loss" : r.cabe ? "text-profit" : "text-warning",
        )}
      >
        {formatPercentual(r.det.margem)}
      </td>
      <td className="px-2 py-2 text-center">
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-bold",
            r.prejuizo ? "bg-loss-soft text-loss" : r.cabe ? "bg-profit-soft text-profit" : "bg-warning/15 text-warning",
          )}
          title={`Margem mínima da conta: ${formatPercentual(i.margemMinima)}`}
        >
          {r.prejuizo ? "Prejuízo" : r.cabe ? "Cabe" : "Não cabe"}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        {participando ? (
          <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={enviando} onClick={sair}>
            {enviando && <Loader2 className="size-3.5 animate-spin" />}
            Sair
          </Button>
        ) : (
          <PopoverParticipar item={i} p={p} aoAgir={aoAgir} noPreco={noPreco} />
        )}
      </td>
    </tr>
  );
}

/** Participar de uma proposta do canal (com o preço, quando o ML deixa escolher). */
function PopoverParticipar({
  item: i,
  p,
  aoAgir,
  noPreco,
}: {
  item: ItemPromocao;
  p: Promocao;
  aoAgir: () => void;
  noPreco: NoPreco;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState(p.precoFinal.toFixed(2).replace(".", ","));
  const [enviando, setEnviando] = useState(false);
  const tipo = p.tipoPromocao ?? "";
  const comPreco = PROMOCAO_COM_PRECO.has(tipo);
  const preco = comPreco ? (lerNumero(texto) ?? 0) : p.precoFinal;
  const det = preco > 0 ? noPreco(i.anuncio, preco) : null;
  const foraDaFaixa =
    comPreco && ((p.precoMinimo && preco < p.precoMinimo) || (p.precoMaximo && preco > p.precoMaximo));

  useEffect(() => {
    if (aberto && preco > 0) pedirCustos(i.anuncio.id, preco);
  }, [aberto, preco, i.anuncio.id]);

  const confirmar = async () => {
    if (!p.idPromocao || !tipo) {
      toast.error("Esta proposta não tem os dados do canal. Atualize os anúncios e tente de novo.");
      return;
    }
    setEnviando(true);
    const erro = await precosMlService.participar({
      anuncioId: i.anuncio.id,
      idPromocao: p.idPromocao,
      tipo,
      preco: comPreco ? centavos(preco) : undefined,
      offerId: p.offerId,
    });
    setEnviando(false);
    if (erro) {
      toast.error(erro);
      return;
    }
    p.situacao = "participando";
    if (comPreco) p.precoFinal = centavos(preco);
    setAberto(false);
    toast.success(`${i.anuncio.produto} entrou em "${p.campanha ?? p.tipo}".`);
    aoAgir();
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button size="sm" className="h-7 text-[11px]">
          Participar
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3 text-xs">
        <p className="font-semibold">{p.campanha ?? p.tipo}</p>
        {comPreco ? (
          <div className="space-y-1">
            <Label className="text-[11px]">Preço com desconto</Label>
            <Input value={texto} onChange={(e) => setTexto(e.target.value)} inputMode="decimal" className="num h-8 text-right" />
            {p.precoMinimo && p.precoMaximo && (
              <p className={cn("text-[10px]", foraDaFaixa ? "text-loss" : "text-muted-foreground")}>
                O canal aceita de {formatBRL(p.precoMinimo)} a {formatBRL(p.precoMaximo)}.
              </p>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground">
            Preço definido pelo Mercado Livre: <strong className="text-foreground">{formatBRL(p.precoFinal)}</strong>
            {p.descontoCanalPercentual ? ` (o ML banca ${formatNumero(p.descontoCanalPercentual)}% do desconto)` : ""}.
          </p>
        )}
        {det && (
          <p>
            Lucro <strong className={cn("num", det.lucro < 0 && "text-loss")}>{formatBRL(det.lucro)}</strong> · margem{" "}
            <strong className={cn("num", det.margem < i.margemMinima ? "text-loss" : "text-profit")}>
              {formatPercentual(det.margem)}
            </strong>
          </p>
        )}
        <Button className="w-full" size="sm" disabled={enviando || !!foraDaFaixa || preco <= 0} onClick={confirmar}>
          {enviando && <Loader2 className="size-3.5 animate-spin" />}
          Entrar na promoção
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Criar promoção pelo painel. Desconto por % vai direto pro canal; os
 * outros tipos abrem a tela certa do Mercado Livre. */
function DialogCriarPromocao({
  itens,
  noPreco,
  aoFechar,
  aoConcluir,
}: {
  itens: ItemPromocao[];
  noPreco: NoPreco;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const hoje = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const [tipo, setTipo] = useState<"percentual" | "quantidade" | "cupom">("percentual");
  const [nome, setNome] = useState("");
  const [descontoTexto, setDescontoTexto] = useState("");
  const [inicio, setInicio] = useState(iso(hoje));
  const [fim, setFim] = useState(iso(new Date(hoje.getTime() + 29 * 86400000)));
  const [busca, setBusca] = useState("");
  const [enviando, setEnviando] = useState(false);
  // Já vêm marcados os que têm desconto planejado e estão sem promoção.
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(itens.filter((i) => i.conta.estadoPromocao === "sem-promocao").map((i) => i.anuncio.id)),
  );
  const desconto = lerNumero(descontoTexto);

  // Preço com desconto de cada anúncio: o planejado (quando o % é o mesmo)
  // ou o cheio do canal com o % digitado.
  const precoDe = (i: ItemPromocao): number | null => {
    const d = desconto ?? i.conta.desconto;
    if (!d) return null;
    if (desconto === null && i.conta.planoPromo) return i.conta.planoPromo;
    if (i.conta.planoPromo && Math.abs(d - i.conta.desconto) < 0.001) return i.conta.planoPromo;
    return centavos((i.conta.planoCheio ?? i.conta.cheioCanal) * (1 - d / 100));
  };

  const termo = busca.trim().toLowerCase();
  const lista = itens.filter(
    (i) => i.anuncio.marketplaceId === "mercado-livre" && (!termo || `${i.anuncio.produto} ${i.anuncio.sku}`.toLowerCase().includes(termo)),
  );
  const escolhidos = itens.filter((i) => marcados.has(i.anuncio.id));
  const dias = (new Date(fim).getTime() - new Date(inicio).getTime()) / 86400000;
  const descontoInvalido = desconto !== null && (desconto < DESCONTO_MIN_ML || desconto > DESCONTO_MAX_ML);

  const criar = async () => {
    if (!nome.trim()) return toast.error("Dê um nome para a promoção (só você vê).");
    if (dias < 0 || dias > 31) return toast.error("A promoção pode durar no máximo 1 mês.");
    if (descontoInvalido) return toast.error(`O Mercado Livre aceita desconto de ${DESCONTO_MIN_ML}% a ${DESCONTO_MAX_ML}%.`);
    const comPreco = escolhidos.map((i) => ({ anuncioId: i.anuncio.id, preco: precoDe(i) })).filter((x) => x.preco);
    if (comPreco.length === 0) return toast.error("Escolha os anúncios e o desconto.");
    setEnviando(true);
    const { erro, resultados } = await precosMlService.criar({
      nome: nome.trim(),
      inicio,
      fim,
      itens: comPreco as { anuncioId: string; preco: number }[],
    });
    setEnviando(false);
    if (erro) return toast.error(erro);
    const ok = resultados.filter((r) => r.ok).length;
    const falhas = resultados.filter((r) => !r.ok);
    toast.success(`Promoção "${nome.trim()}" criada com ${ok} anúncio(s).`);
    if (falhas.length) toast.error(`${falhas.length} anúncio(s) recusados pelo canal`, { description: falhas[0]?.erro });
    aoConcluir();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar promoção</DialogTitle>
          <DialogDescription>Cria direto no Mercado Livre, sem precisar entrar lá.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              ["percentual", "Desconto por porcentagem", "Vários anúncios, até 1 mês"],
              ["quantidade", "Desconto por quantidade", "Leve 2 ou mais"],
              ["cupom", "Cupom", "Para todos os compradores"],
            ] as const
          ).map(([id, titulo, sub]) => (
            <button
              key={id}
              onClick={() => setTipo(id)}
              className={cn("rounded-lg border p-3 text-left", tipo === id && "border-brand bg-brand/5")}
            >
              <p className="text-xs font-semibold">{titulo}</p>
              <p className="text-[10px] text-muted-foreground">{sub}</p>
            </button>
          ))}
        </div>

        {tipo !== "percentual" ? (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-xs">
            <p>
              {tipo === "quantidade"
                ? "O desconto por quantidade ainda é criado na tela do Mercado Livre (a API não oferece essa criação)."
                : "O cupom ainda é criado na tela do Mercado Livre (a API não oferece essa criação)."}{" "}
              Depois de criado, ele aparece aqui nas Campanhas na próxima atualização.
            </p>
            <Button asChild size="sm" variant="outline">
              <a href={tipo === "quantidade" ? LINK_ML.quantidade : LINK_ML.cupom} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
                Criar no Mercado Livre
              </a>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Nome (só você vê)</Label>
                <Input value={nome} maxLength={25} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Semana do cabelo" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Início</Label>
                <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fim (até 1 mês)</Label>
                <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Desconto %</Label>
                <Input
                  value={descontoTexto}
                  onChange={(e) => setDescontoTexto(e.target.value)}
                  placeholder="o planejado"
                  className="num w-28 text-right"
                />
              </div>
              <p className="max-w-md text-[11px] text-muted-foreground">
                Vazio = usa o desconto planejado de cada anúncio na Precificação. O Mercado Livre aceita de{" "}
                {DESCONTO_MIN_ML}% a {DESCONTO_MAX_ML}%.
                {descontoInvalido && <span className="text-loss"> Desconto fora do permitido.</span>}
              </p>
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar anúncio"
                className="ml-auto h-8 w-48 text-xs"
              />
            </div>
            <div className="max-h-[340px] overflow-y-auto rounded-lg border">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-muted text-[9px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-2 py-2"></th>
                    <th className="px-2 py-2">Anúncio</th>
                    <th className="px-2 py-2 text-right">Preço cheio</th>
                    <th className="px-2 py-2 text-right">Com desconto</th>
                    <th className="px-2 py-2 text-right">Lucro</th>
                    <th className="px-2 py-2 text-right">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((i) => {
                    const preco = precoDe(i);
                    const det = preco ? noPreco(i.anuncio, preco) : null;
                    return (
                      <tr key={i.anuncio.id} className="border-t">
                        <td className="px-2 py-1.5">
                          <Checkbox
                            checked={marcados.has(i.anuncio.id)}
                            onCheckedChange={(v) =>
                              setMarcados((atual) => {
                                const novo = new Set(atual);
                                if (v) novo.add(i.anuncio.id);
                                else novo.delete(i.anuncio.id);
                                return novo;
                              })
                            }
                          />
                        </td>
                        <td className="max-w-[260px] truncate px-2 py-1.5" title={i.anuncio.produto}>
                          {i.anuncio.produto}
                          {i.conta.estadoPromocao === "sem-promocao" && (
                            <span className="ml-1 text-[9px] font-semibold text-loss">sem promoção</span>
                          )}
                        </td>
                        <td className="num px-2 py-1.5 text-right">{formatBRL(i.conta.planoCheio ?? i.conta.cheioCanal)}</td>
                        <td className="num px-2 py-1.5 text-right font-semibold">{preco ? formatBRL(preco) : "—"}</td>
                        <td className={cn("num px-2 py-1.5 text-right", det && det.lucro < 0 && "text-loss")}>
                          {det ? formatBRL(det.lucro) : "—"}
                        </td>
                        <td
                          className={cn(
                            "num px-2 py-1.5 text-right font-semibold",
                            det && (det.margem < i.margemMinima ? "text-loss" : "text-profit"),
                          )}
                        >
                          {det ? formatPercentual(det.margem) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Atenção: se o preço cheio planejado ainda não foi lançado, lance antes na Precificação — o desconto é
              aplicado sobre o preço cheio que está no Mercado Livre.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar}>
            Fechar
          </Button>
          {tipo === "percentual" && (
            <Button onClick={criar} disabled={enviando || escolhidos.length === 0}>
              {enviando && <Loader2 className="size-3.5 animate-spin" />}
              Criar com {escolhidos.length} anúncio(s)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
