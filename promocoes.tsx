import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { anunciosService, promocoesService } from "@/services";
import { calcularResultado, resultadoAnuncio } from "@/lib/finance";
import { formatBRL, formatPercentual } from "@/lib/format";
import { CardKpi, Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { ResultadosPromocoes } from "@/components/promocoes/ResultadosPromocoes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Anuncio, Promocao } from "@/types";

export const Route = createFileRoute("/promocoes")({
  head: () => ({
    meta: [
      { title: "Promoções e ofertas | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "Simule campanhas dos marketplaces e veja o lucro líquido real antes de aceitar entrar em uma promoção.",
      },
      { property: "og:title", content: "Promoções e ofertas | NEXO Rentabilidade" },
      {
        property: "og:description",
        content:
          "Simulador de oferta com DRE em tempo real e tabela de oportunidades por marketplace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Promocoes,
});

const MARGEM_MINIMA = 0.08;

function statusOferta(margem: number) {
  if (margem < 0) return { texto: "Prejuízo / Recusar", cor: "bg-loss-soft text-loss" };
  if (margem < MARGEM_MINIMA)
    return { texto: "Margem apertada", cor: "bg-warning-soft text-foreground" };
  return { texto: "Segura", cor: "bg-profit-soft text-profit" };
}

function resultadoComPreco(a: Anuncio | Promocao, preco: number) {
  return calcularResultado({
    precoVenda: preco,
    cmv: a.cmv ?? 0,
    impostoPercentual: a.impostoPercentual,
    comissaoPercentual: a.comissaoPercentual,
    taxaFixa: a.taxaFixa,
    outrosCustos: 0,
  });
}

type AbaPromocoes = "decidir" | "resultados";

const ABAS: { id: AbaPromocoes; titulo: string; descricao: string }[] = [
  {
    id: "decidir",
    titulo: "Decidir",
    descricao: "Simule antes de entrar e veja o que sobra de lucro",
  },
  {
    id: "resultados",
    titulo: "Resultados",
    descricao: "O que as campanhas que você já fez entregaram de verdade",
  },
];

function Promocoes() {
  const [aba, setAba] = useState<AbaPromocoes>("decidir");

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <div className="flex flex-wrap gap-1 border-b">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              aba === a.id
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.titulo}
          </button>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {ABAS.find((a) => a.id === aba)?.descricao}
      </p>

      {aba === "decidir" ? <Decidir /> : <ResultadosPromocoes />}
    </div>
  );
}

function Decidir() {
  const promocoesBase = promocoesService.listar();
  const anuncios = anunciosService.listar();

  const [participando, setParticipando] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(promocoesBase.map((p, i) => [p.id, i < 4])),
  );

  const [skuSimulado, setSkuSimulado] = useState(anuncios[0]?.id ?? "");
  const [desconto, setDesconto] = useState(15);
  const [campanha, setCampanha] = useState("Central de Ofertas Mercado Livre");

  const anuncioSimulado = anuncios.find((a) => a.id === skuSimulado) ?? anuncios[0];

  const simulacao = useMemo(() => {
    if (!anuncioSimulado) return null;
    const normal = resultadoAnuncio(anuncioSimulado);
    const precoPromo =
      Math.round(anuncioSimulado.precoAtual * (1 - desconto / 100) * 100) / 100;
    const promo = resultadoComPreco(anuncioSimulado, precoPromo);
    return { normal, promo, precoPromo };
  }, [anuncioSimulado, desconto]);

  const linhas = useMemo(
    () =>
      promocoesBase.map((p) => {
        const normal = resultadoComPreco(p, p.precoAtual);
        const promo = resultadoComPreco(p, p.precoFinal);
        return { p, normal, promo };
      }),
    [promocoesBase],
  );

  const ativas = linhas.filter((l) => participando[l.p.id]);
  const faturamentoOferta = ativas.reduce((acc, l) => acc + l.p.precoFinal * 24, 0);
  const margemMedia = ativas.length
    ? ativas.reduce((acc, l) => acc + l.promo.margem, 0) / ativas.length
    : 0;
  const criticos = linhas.filter((l) => l.promo.margem < MARGEM_MINIMA).length;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi
          titulo="Promoções ativas"
          valor={`${ativas.length}`}
          detalhe={`${linhas.length} oportunidades disponíveis nos canais`}
        />
        <CardKpi
          titulo="Faturamento com oferta"
          valor={formatBRL(faturamentoOferta)}
          detalhe="Estimativa dos últimos 30 dias em campanhas"
        />
        <CardKpi
          titulo="Lucro líquido médio em promoção"
          valor={formatPercentual(margemMedia)}
          destaque
          dica="Margem líquida média dos anúncios que estão participando de campanhas."
        />
        <CardKpi
          titulo="Alerta de margem crítica"
          valor={`${criticos} produto${criticos === 1 ? "" : "s"}`}
          detalhe={`Abaixo da margem mínima de ${formatPercentual(MARGEM_MINIMA, 0)}`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Painel
          titulo="Simulador de oferta"
          descricao="Veja o que sobra de lucro antes de aceitar a campanha"
        >
          <div className="space-y-4 p-5">
            <div className="space-y-1.5">
              <Label className="text-xs">Produto</Label>
              <Select value={skuSimulado} onValueChange={setSkuSimulado}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o produto" />
                </SelectTrigger>
                <SelectContent>
                  {anuncios.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.produto} — {a.sku}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Campanha</Label>
                <Select value={campanha} onValueChange={setCampanha}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Central de Ofertas Mercado Livre">
                      Central de Ofertas Mercado Livre
                    </SelectItem>
                    <SelectItem value="Oferta Relâmpago Shopee">
                      Oferta Relâmpago Shopee
                    </SelectItem>
                    <SelectItem value="Black Friday">Black Friday</SelectItem>
                    <SelectItem value="Semana do Consumidor">
                      Semana do Consumidor
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Desconto da promoção (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={90}
                  value={desconto}
                  onChange={(e) => setDesconto(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            {simulacao && anuncioSimulado && (
              <div className="rounded-xl border bg-muted/30 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    DRE com o preço promocional
                  </p>
                  <SeloMarketplace id={anuncioSimulado.marketplaceId} />
                </div>
                <dl className="space-y-1.5 text-xs">
                  <Linha rotulo="Preço normal" valor={formatBRL(simulacao.normal.precoVenda)} />
                  <Linha
                    rotulo="Preço promocional"
                    valor={formatBRL(simulacao.precoPromo)}
                    forte
                  />
                  <Linha rotulo="(-) CMV" valor={`- ${formatBRL(simulacao.promo.cmv)}`} />
                  <Linha
                    rotulo="(-) Impostos"
                    valor={`- ${formatBRL(simulacao.promo.impostos)}`}
                  />
                  <Linha
                    rotulo="(-) Comissão"
                    valor={`- ${formatBRL(simulacao.promo.comissao)}`}
                  />
                  <Linha
                    rotulo="(-) Taxa fixa"
                    valor={`- ${formatBRL(simulacao.promo.taxaFixa)}`}
                  />
                  <div className="mt-2 flex items-center justify-between border-t pt-2">
                    <dt className="text-xs font-semibold">(=) Lucro líquido</dt>
                    <dd
                      className={cn(
                        "num text-sm font-bold",
                        simulacao.promo.lucroLiquido >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {formatBRL(simulacao.promo.lucroLiquido)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Margem normal
                    </p>
                    <p className="num text-sm font-bold">
                      {formatPercentual(simulacao.normal.margem)}
                    </p>
                  </div>
                  <div className="rounded-lg border bg-card p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Nova margem
                    </p>
                    <p
                      className={cn(
                        "num text-sm font-bold",
                        simulacao.promo.margem >= MARGEM_MINIMA
                          ? "text-profit"
                          : simulacao.promo.margem >= 0
                            ? "text-foreground"
                            : "text-loss",
                      )}
                    >
                      {formatPercentual(simulacao.promo.margem)}
                    </p>
                  </div>
                </div>

                <div
                  className={cn(
                    "mt-3 rounded-lg px-3 py-2 text-[11px] font-semibold",
                    statusOferta(simulacao.promo.margem).cor,
                  )}
                >
                  {statusOferta(simulacao.promo.margem).texto} — decisão final é sua.
                </div>
              </div>
            )}
          </div>
        </Painel>

        <Painel
          titulo="Como ler a simulação"
          descricao="Entenda o impacto do desconto no seu bolso"
        >
          <div className="space-y-3 p-5 text-xs text-muted-foreground">
            <p>
              O desconto sai inteiro do seu lucro: impostos e comissão caem um pouco
              (são percentuais sobre o preço), mas o CMV e a taxa fixa continuam iguais.
            </p>
            <p>
              <span className="font-semibold text-profit">Segura</span>: margem acima de{" "}
              {formatPercentual(MARGEM_MINIMA, 0)} — vale entrar para ganhar volume e
              posição na vitrine.
            </p>
            <p>
              <span className="font-semibold text-foreground">Margem apertada</span>: dá
              lucro, mas qualquer devolução ou frete extra apaga o ganho.
            </p>
            <p>
              <span className="font-semibold text-loss">Prejuízo / recusar</span>: cada
              venda tira dinheiro do caixa. Só faz sentido em queima de estoque.
            </p>
            <p className="rounded-lg border bg-muted/40 p-3">
              Nada é aceito automaticamente. O sistema só mostra o número; participar ou
              sair da campanha é sempre decisão do seller.
            </p>
          </div>
        </Painel>
      </div>

      <Painel
        titulo="Promoções vigentes e oportunidades"
        descricao="Compare a margem normal com a margem dentro da campanha"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-bold">Produto / SKU</th>
                <th className="px-4 py-3 font-bold">Marketplace</th>
                <th className="px-4 py-3 text-right font-bold">Preço normal</th>
                <th className="px-4 py-3 text-right font-bold">Preço promocional</th>
                <th className="px-4 py-3 text-right font-bold">Margem normal</th>
                <th className="px-4 py-3 text-right font-bold">Nova margem</th>
                <th className="px-4 py-3 text-center font-bold">Status da oferta</th>
                <th className="px-4 py-3 text-right font-bold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {linhas.map(({ p, normal, promo }) => {
                const s = statusOferta(promo.margem);
                const ativo = participando[p.id] ?? false;
                return (
                  <tr key={p.id} className="transition-colors hover:bg-muted/40">
                    <td className="max-w-[280px] px-4 py-3">
                      <p className="truncate text-xs font-medium">{p.produto}</p>
                      <p className="num text-[10px] text-muted-foreground">
                        {p.sku} · {p.tipo}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <SeloMarketplace id={p.marketplaceId} />
                    </td>
                    <td className="num px-4 py-3 text-right text-xs">
                      {formatBRL(p.precoAtual)}
                    </td>
                    <td className="num px-4 py-3 text-right text-xs font-semibold">
                      {formatBRL(p.precoFinal)}
                    </td>
                    <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                      {formatPercentual(normal.margem)}
                    </td>
                    <td
                      className={cn(
                        "num px-4 py-3 text-right text-xs font-bold",
                        promo.margem >= MARGEM_MINIMA
                          ? "text-profit"
                          : promo.margem >= 0
                            ? "text-foreground"
                            : "text-loss",
                      )}
                    >
                      {formatPercentual(promo.margem)}
                    </td>
                    <td className="px-4 py-3 text-center">
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
                        variant={ativo ? "outline" : "default"}
                        onClick={() => {
                          setParticipando((atual) => ({ ...atual, [p.id]: !ativo }));
                          toast.success(
                            ativo
                              ? `Você saiu da campanha de ${p.produto}.`
                              : `Você entrou na campanha de ${p.produto}.`,
                          );
                        }}
                      >
                        {ativo ? "Sair" : "Participar"}
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

function Linha({
  rotulo,
  valor,
  forte,
}: {
  rotulo: string;
  valor: string;
  forte?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={cn("text-muted-foreground", forte && "font-semibold text-foreground")}>
        {rotulo}
      </dt>
      <dd className={cn("num", forte && "font-semibold")}>{valor}</dd>
    </div>
  );
}
