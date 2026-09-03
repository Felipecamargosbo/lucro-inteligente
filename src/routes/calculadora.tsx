import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Target } from "lucide-react";
import { formatBRL, formatPercentual } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CardKpi, Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MarketplaceId } from "@/types";

export const Route = createFileRoute("/calculadora")({
  head: () => ({
    meta: [
      { title: "Calculadora de precificação | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "Simule preço de venda, custos, impostos, comissões e descubra a margem líquida real do seu produto em cada marketplace.",
      },
      { property: "og:title", content: "Calculadora de precificação | NEXO Rentabilidade" },
      {
        property: "og:description",
        content:
          "DRE em tempo real para sellers: veja quanto sobra depois de todos os custos do marketplace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Calculadora,
});

/* ------------------------------------------------------------------ */
/* Modelo: cada canal guarda seus próprios campos, de forma 100%      */
/* independente. "Todos" não é um canal com dados — é uma tela de     */
/* leitura que reflete o que foi preenchido em cada canal individual. */
/* ------------------------------------------------------------------ */

type CanalId = "mercado-livre" | "shopee" | "amazon" | "magalu";
type AbaId = CanalId | "todos";

interface CamposCanal {
  precoVenda: string;
  cmv: string;
  imposto: string;
  taxaFixa: string;
  comissao: string;
  frete: string;
  embalagem: string;
  ads: string;
  margemDesejada: string;
}

const CANAIS_INFO: { id: CanalId; nome: string }[] = [
  { id: "mercado-livre", nome: "Mercado Livre" },
  { id: "shopee", nome: "Shopee" },
  { id: "amazon", nome: "Amazon" },
  { id: "magalu", nome: "Magalu" },
];

const ABAS: { id: AbaId; nome: string }[] = [
  ...CANAIS_INFO,
  { id: "todos", nome: "Todos" },
];

// Valores de exemplo pré-preenchidos por canal — cada um editável de forma
// independente. Comissão e frete refletem uma média típica de cada
// marketplace; os demais campos começam iguais, mas podem ser alterados
// canal a canal a qualquer momento.
const PADRAO: Record<CanalId, CamposCanal> = {
  "mercado-livre": {
    precoVenda: "150,00",
    cmv: "65,00",
    imposto: "9,00",
    taxaFixa: "0,00",
    comissao: "16,00",
    frete: "8,00",
    embalagem: "3,50",
    ads: "10,00",
    margemDesejada: "20,00",
  },
  shopee: {
    precoVenda: "150,00",
    cmv: "65,00",
    imposto: "9,00",
    taxaFixa: "0,00",
    comissao: "20,00",
    frete: "10,00",
    embalagem: "3,50",
    ads: "10,00",
    margemDesejada: "20,00",
  },
  amazon: {
    precoVenda: "150,00",
    cmv: "65,00",
    imposto: "9,00",
    taxaFixa: "0,00",
    comissao: "15,00",
    frete: "12,00",
    embalagem: "3,50",
    ads: "10,00",
    margemDesejada: "20,00",
  },
  magalu: {
    precoVenda: "150,00",
    cmv: "65,00",
    imposto: "9,00",
    taxaFixa: "0,00",
    comissao: "18,00",
    frete: "9,00",
    embalagem: "3,50",
    ads: "10,00",
    margemDesejada: "20,00",
  },
};

function paraNumero(valor: string) {
  return Number(valor.replace(/\./g, "").replace(",", ".")) || 0;
}

function simular(entrada: {
  preco: number;
  custoProduto: number;
  taxaImposto: number;
  taxaComissao: number;
  taxaAds: number;
  valorFrete: number;
  valorEmbalagem: number;
  valorTaxaFixa: number;
}) {
  const impostos = entrada.preco * entrada.taxaImposto;
  const comissaoValor = entrada.preco * entrada.taxaComissao;
  const adsValor = entrada.preco * entrada.taxaAds;
  const freteEmbalagem = entrada.valorFrete + entrada.valorEmbalagem;
  const custoTotal =
    entrada.custoProduto + impostos + comissaoValor + freteEmbalagem + adsValor + entrada.valorTaxaFixa;
  const lucroLiquido = entrada.preco - custoTotal;
  return {
    preco: entrada.preco,
    custoProduto: entrada.custoProduto,
    impostos,
    comissaoValor,
    adsValor,
    freteEmbalagem,
    valorFrete: entrada.valorFrete,
    valorEmbalagem: entrada.valorEmbalagem,
    taxaFixa: entrada.valorTaxaFixa,
    custoTotal,
    lucroLiquido,
    margem: entrada.preco > 0 ? lucroLiquido / entrada.preco : 0,
  };
}

function calcularSimulacaoCanal(dados: CamposCanal) {
  const base = {
    preco: paraNumero(dados.precoVenda),
    custoProduto: paraNumero(dados.cmv),
    taxaImposto: paraNumero(dados.imposto) / 100,
    taxaComissao: paraNumero(dados.comissao) / 100,
    taxaAds: paraNumero(dados.ads) / 100,
    valorFrete: paraNumero(dados.frete),
    valorEmbalagem: paraNumero(dados.embalagem),
    valorTaxaFixa: paraNumero(dados.taxaFixa),
  };
  const sim = simular(base);

  const margemAlvo = paraNumero(dados.margemDesejada) / 100;
  const divisor = 1 - base.taxaImposto - base.taxaComissao - base.taxaAds - margemAlvo;
  const precoSugerido =
    divisor > 0
      ? (base.custoProduto + base.valorFrete + base.valorEmbalagem + base.valorTaxaFixa) / divisor
      : 0;

  return { ...sim, precoSugerido };
}

type SimulacaoCanal = ReturnType<typeof calcularSimulacaoCanal>;

function Calculadora() {
  const [aba, setAba] = useState<AbaId>("mercado-livre");
  const [dados, setDados] = useState<Record<CanalId, CamposCanal>>(PADRAO);
  const [detalheAberto, setDetalheAberto] = useState<CanalId | null>(null);

  const atualizarCampo = (canal: CanalId, campo: keyof CamposCanal, valor: string) => {
    setDados((prev) => ({ ...prev, [canal]: { ...prev[canal], [campo]: valor } }));
  };

  const simulacoes = useMemo(() => {
    const resultado = {} as Record<CanalId, SimulacaoCanal>;
    for (const c of CANAIS_INFO) {
      resultado[c.id] = calcularSimulacaoCanal(dados[c.id]);
    }
    return resultado;
  }, [dados]);

  const canalAtivo = aba !== "todos" ? aba : null;
  const dadosAtivos = canalAtivo ? dados[canalAtivo] : null;
  const simulacaoAtiva = canalAtivo ? simulacoes[canalAtivo] : null;

  const composicao = simulacaoAtiva
    ? [
        { rotulo: "CMV", valor: simulacaoAtiva.custoProduto, cor: "bg-loss" },
        { rotulo: "Impostos", valor: simulacaoAtiva.impostos, cor: "bg-warning" },
        { rotulo: "Comissão", valor: simulacaoAtiva.comissaoValor, cor: "bg-info" },
        { rotulo: "Taxa fixa", valor: simulacaoAtiva.taxaFixa, cor: "bg-secondary" },
        { rotulo: "Frete + embalagem", valor: simulacaoAtiva.freteEmbalagem, cor: "bg-primary" },
        { rotulo: "ADS", valor: simulacaoAtiva.adsValor, cor: "bg-brand" },
      ]
    : [];

  const totalAtivo = simulacaoAtiva && simulacaoAtiva.preco > 0 ? simulacaoAtiva.preco : 1;

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <div>
        <h1 className="truncate text-lg font-semibold tracking-tight">
          Calculadora de precificação
        </h1>
        <p className="text-xs text-muted-foreground">
          Configure os custos de cada marketplace de forma independente e descubra o preço ideal por
          canal.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-2 shadow-card">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={cn(
              "rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
              aba === a.id
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {a.nome}
          </button>
        ))}
      </div>

      {aba === "todos" || !dadosAtivos || !simulacaoAtiva ? (
        <TelaTodos
          dados={dados}
          simulacoes={simulacoes}
          aoAbrirDetalhe={(id) => setDetalheAberto(id)}
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {/* Coluna esquerda */}
          <div className="space-y-4">
            <Painel
              titulo="Dados da simulação"
              descricao={`Custos do produto neste canal (${CANAIS_INFO.find((c) => c.id === canalAtivo)?.nome})`}
            >
              <div className="grid grid-cols-2 gap-3 p-5">
                <Campo
                  rotulo="Preço de venda desejado"
                  valor={dadosAtivos.precoVenda}
                  aoAlterar={(v) => atualizarCampo(canalAtivo!, "precoVenda", v)}
                  prefixo="R$"
                  exemplo="150,00"
                />
                <Campo
                  rotulo="Custo do produto / CMV"
                  valor={dadosAtivos.cmv}
                  aoAlterar={(v) => atualizarCampo(canalAtivo!, "cmv", v)}
                  prefixo="R$"
                  exemplo="65,00"
                />
                <Campo
                  rotulo="Comissão do marketplace"
                  valor={dadosAtivos.comissao}
                  aoAlterar={(v) => atualizarCampo(canalAtivo!, "comissao", v)}
                  prefixo="%"
                  exemplo="16,00"
                />
                <Campo
                  rotulo="Taxa fixa"
                  valor={dadosAtivos.taxaFixa}
                  aoAlterar={(v) => atualizarCampo(canalAtivo!, "taxaFixa", v)}
                  prefixo="R$"
                  exemplo="0,00"
                />
                <Campo
                  rotulo="Frete médio"
                  valor={dadosAtivos.frete}
                  aoAlterar={(v) => atualizarCampo(canalAtivo!, "frete", v)}
                  prefixo="R$"
                  exemplo="8,00"
                />
                <Campo
                  rotulo="Imposto"
                  valor={dadosAtivos.imposto}
                  aoAlterar={(v) => atualizarCampo(canalAtivo!, "imposto", v)}
                  prefixo="%"
                  exemplo="9,00"
                />
                <Campo
                  rotulo="Embalagem / operacional"
                  valor={dadosAtivos.embalagem}
                  aoAlterar={(v) => atualizarCampo(canalAtivo!, "embalagem", v)}
                  prefixo="R$"
                  exemplo="3,50"
                />
                <Campo
                  rotulo="Investimento em ADS"
                  valor={dadosAtivos.ads}
                  aoAlterar={(v) => atualizarCampo(canalAtivo!, "ads", v)}
                  prefixo="%"
                  exemplo="10,00"
                />
              </div>
            </Painel>

            <Painel titulo="Margem alvo" descricao="Preço sugerido para a margem desejada neste canal">
              <div className="space-y-4 p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Campo
                    rotulo="Margem desejada"
                    valor={dadosAtivos.margemDesejada}
                    aoAlterar={(v) => atualizarCampo(canalAtivo!, "margemDesejada", v)}
                    prefixo="%"
                    exemplo="20,00"
                  />
                  <div className="rounded-xl border bg-muted/40 p-4">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Preço de venda sugerido
                    </p>
                    <p className="num mt-1 text-xl font-bold text-brand">
                      {formatBRL(simulacaoAtiva.precoSugerido)}
                    </p>
                  </div>
                </div>

                <div className="rounded-xl border bg-profit-soft p-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-full bg-profit/20 p-2">
                      <Target className="size-4 text-profit" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">Como funciona o cálculo</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        O preço sugerido cobre CMV, frete, embalagem, taxa fixa, impostos, comissão e
                        ADS deste canal, garantindo a margem definida. Se ficar acima do mercado,
                        reveja custos fixos ou o canal escolhido.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </Painel>
          </div>

          {/* Coluna direita */}
          <div className="space-y-4">
            <Painel titulo="DRE simulada" descricao="Composição do preço de venda em tempo real">
              <div className="space-y-4 p-5">
                <div className="flex items-center justify-between border-b pb-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    Faturamento bruto
                  </span>
                  <span className="num text-lg font-bold">{formatBRL(simulacaoAtiva.preco)}</span>
                </div>

                <div className="space-y-1.5">
                  <LinhaDre rotulo="(-) Impostos" valor={simulacaoAtiva.impostos} />
                  <LinhaDre rotulo="(-) Comissões" valor={simulacaoAtiva.comissaoValor} />
                  <LinhaDre rotulo="(-) Taxa fixa" valor={simulacaoAtiva.taxaFixa} />
                  <LinhaDre rotulo="(-) Frete e embalagem" valor={simulacaoAtiva.freteEmbalagem} />
                  <LinhaDre rotulo="(-) Custo do produto (CMV)" valor={simulacaoAtiva.custoProduto} />
                  <LinhaDre rotulo="(-) Investimento em ADS" valor={simulacaoAtiva.adsValor} />
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <span
                    className={cn(
                      "text-sm font-bold",
                      simulacaoAtiva.lucroLiquido >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    (=) Lucro líquido
                  </span>
                  <span
                    className={cn(
                      "num text-xl font-bold",
                      simulacaoAtiva.lucroLiquido >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {formatBRL(simulacaoAtiva.lucroLiquido)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">Margem líquida</span>
                  <span
                    className={cn(
                      "num text-sm font-bold",
                      simulacaoAtiva.margem >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {formatPercentual(simulacaoAtiva.margem)}
                  </span>
                </div>
              </div>
            </Painel>

            <Painel titulo="Composição do preço" descricao="Para onde vai cada real da venda">
              <div className="p-5">
                <div className="mb-2 flex justify-between text-[10px] text-muted-foreground">
                  <span>Preço de venda</span>
                  <span className="num">{formatBRL(simulacaoAtiva.preco)}</span>
                </div>
                <div className="flex h-3 w-full overflow-hidden rounded-full">
                  {composicao.map((item) => {
                    const pct = Math.max(0, (item.valor / totalAtivo) * 100);
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={item.rotulo}
                        className={item.cor}
                        style={{ width: `${pct}%` }}
                        title={`${item.rotulo}: ${formatBRL(item.valor)}`}
                      />
                    );
                  })}
                  <div
                    className={simulacaoAtiva.lucroLiquido >= 0 ? "bg-profit" : "bg-loss"}
                    style={{
                      width: `${Math.max(0, (Math.abs(simulacaoAtiva.lucroLiquido) / totalAtivo) * 100)}%`,
                    }}
                    title={`Lucro líquido: ${formatBRL(simulacaoAtiva.lucroLiquido)}`}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[10px]">
                  {composicao.map((item) => (
                    <div key={item.rotulo} className="flex items-center gap-1.5">
                      <span className={cn("size-2 shrink-0 rounded-full", item.cor)} />
                      <span className="text-muted-foreground">
                        {item.rotulo} · {formatBRL(item.valor)}
                      </span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        simulacaoAtiva.lucroLiquido >= 0 ? "bg-profit" : "bg-loss",
                      )}
                    />
                    <span className="text-muted-foreground">
                      Lucro líquido · {formatBRL(simulacaoAtiva.lucroLiquido)}
                    </span>
                  </div>
                </div>
              </div>
            </Painel>

            <div className="grid gap-3 sm:grid-cols-3">
              <CardKpi
                titulo="Custo total"
                valor={formatBRL(simulacaoAtiva.custoTotal)}
                detalhe="Todos os custos por venda"
              />
              <CardKpi
                titulo="Lucro líquido"
                valor={formatBRL(simulacaoAtiva.lucroLiquido)}
                detalhe={`Margem de ${formatPercentual(simulacaoAtiva.margem)}`}
                destaque={simulacaoAtiva.lucroLiquido >= 0}
              />
              <CardKpi
                titulo="Preço sugerido"
                valor={formatBRL(simulacaoAtiva.precoSugerido)}
                detalhe={`Alvo: ${formatPercentual(paraNumero(dadosAtivos.margemDesejada) / 100)}`}
              />
            </div>
          </div>
        </div>
      )}

      {detalheAberto && (
        <DialogDetalheCanal
          canal={detalheAberto}
          dados={dados[detalheAberto]}
          simulacao={simulacoes[detalheAberto]}
          aoFechar={() => setDetalheAberto(null)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tela "Todos" — somente leitura, reflete o que foi preenchido em     */
/* cada canal. Nenhum valor é somado ou dividido entre marketplaces:   */
/* cada coluna é a análise individual daquele canal.                   */
/* ------------------------------------------------------------------ */

function TelaTodos({
  dados,
  simulacoes,
  aoAbrirDetalhe,
}: {
  dados: Record<CanalId, CamposCanal>;
  simulacoes: Record<CanalId, SimulacaoCanal>;
  aoAbrirDetalhe: (id: CanalId) => void;
}) {
  const melhorMargemId = CANAIS_INFO.reduce((melhor, c) =>
    simulacoes[c.id].margem > simulacoes[melhor.id].margem ? c : melhor,
  ).id;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border bg-muted/30 p-4 text-xs text-muted-foreground">
        Esta tela só mostra o que foi configurado em cada marketplace — nenhum valor aqui é somado ou
        dividido entre canais. Para editar, selecione um marketplace específico na barra acima.
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Canal</th>
              <th className="px-4 py-2 text-right font-semibold">Preço</th>
              <th className="px-4 py-2 text-right font-semibold">CMV</th>
              <th className="px-4 py-2 text-right font-semibold">Comissão</th>
              <th className="px-4 py-2 text-right font-semibold">Taxa fixa</th>
              <th className="px-4 py-2 text-right font-semibold">Frete</th>
              <th className="px-4 py-2 text-right font-semibold">Imposto</th>
              <th className="px-4 py-2 text-right font-semibold">Embalagem</th>
              <th className="px-4 py-2 text-right font-semibold">ADS</th>
              <th className="px-4 py-2 text-right font-semibold">Custo total</th>
              <th className="px-4 py-2 text-right font-semibold">Lucro líquido</th>
              <th className="px-4 py-2 text-right font-semibold">Margem</th>
              <th className="px-4 py-2 text-right font-semibold">Preço sugerido</th>
            </tr>
          </thead>
          <tbody>
            {CANAIS_INFO.map((c) => {
              const d = dados[c.id];
              const s = simulacoes[c.id];
              return (
                <tr
                  key={c.id}
                  onClick={() => aoAbrirDetalhe(c.id)}
                  className="cursor-pointer border-t transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-2.5 font-medium">
                    <div className="flex items-center gap-2">
                      <SeloMarketplace id={c.id as MarketplaceId} />
                      {c.id === melhorMargemId && (
                        <span className="rounded-full bg-profit-soft px-1.5 py-0.5 text-[9px] font-semibold text-profit">
                          Melhor margem
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="num px-4 py-2.5 text-right">{formatBRL(s.preco)}</td>
                  <td className="num px-4 py-2.5 text-right">{formatBRL(s.custoProduto)}</td>
                  <td className="num px-4 py-2.5 text-right">
                    {formatBRL(s.comissaoValor)}{" "}
                    <span className="text-muted-foreground">({d.comissao}%)</span>
                  </td>
                  <td className="num px-4 py-2.5 text-right">{formatBRL(s.taxaFixa)}</td>
                  <td className="num px-4 py-2.5 text-right">{formatBRL(s.valorFrete)}</td>
                  <td className="num px-4 py-2.5 text-right">{formatBRL(s.impostos)}</td>
                  <td className="num px-4 py-2.5 text-right">{formatBRL(s.valorEmbalagem)}</td>
                  <td className="num px-4 py-2.5 text-right">{formatBRL(s.adsValor)}</td>
                  <td className="num px-4 py-2.5 text-right font-medium">
                    {formatBRL(s.custoTotal)}
                  </td>
                  <td
                    className={cn(
                      "num px-4 py-2.5 text-right font-semibold",
                      s.lucroLiquido >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {formatBRL(s.lucroLiquido)}
                  </td>
                  <td
                    className={cn(
                      "num px-4 py-2.5 text-right font-semibold",
                      s.margem >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {formatPercentual(s.margem)}
                  </td>
                  <td className="num px-4 py-2.5 text-right text-brand">
                    {formatBRL(s.precoSugerido)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Clique em uma linha para ver o detalhamento completo daquele canal.
      </p>
    </div>
  );
}

function DialogDetalheCanal({
  canal,
  dados,
  simulacao,
  aoFechar,
}: {
  canal: CanalId;
  dados: CamposCanal;
  simulacao: SimulacaoCanal;
  aoFechar: () => void;
}) {
  const nome = CANAIS_INFO.find((c) => c.id === canal)?.nome ?? canal;

  const linhas = [
    { rotulo: "CMV (custo do produto)", valor: simulacao.custoProduto },
    { rotulo: `Comissão do marketplace (${dados.comissao}%)`, valor: simulacao.comissaoValor },
    { rotulo: "Taxa fixa", valor: simulacao.taxaFixa },
    { rotulo: "Frete", valor: simulacao.valorFrete },
    { rotulo: "Embalagem / operacional", valor: simulacao.valorEmbalagem },
    { rotulo: `Impostos (${dados.imposto}%)`, valor: simulacao.impostos },
    { rotulo: `ADS (${dados.ads}%)`, valor: simulacao.adsValor },
  ];

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <SeloMarketplace id={canal as MarketplaceId} />
            <DialogTitle>Detalhamento — {nome}</DialogTitle>
          </div>
          <DialogDescription>
            Simulação individual deste canal, com os valores configurados na aba {nome}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-xs font-semibold">Preço de venda</span>
              <span className="num text-sm font-bold">{formatBRL(simulacao.preco)}</span>
            </div>
            <div className="divide-y">
              {linhas.map((l) => (
                <div key={l.rotulo} className="flex items-center justify-between px-4 py-2.5">
                  <span className="text-[11px] text-muted-foreground">− {l.rotulo}</span>
                  <span className="num text-[11px] text-loss">{formatBRL(l.valor)}</span>
                </div>
              ))}
            </div>
            <div
              className={cn(
                "flex items-center justify-between border-t px-4 py-3",
                simulacao.lucroLiquido >= 0 ? "bg-profit-soft" : "bg-loss/10",
              )}
            >
              <span
                className={cn(
                  "text-xs font-bold",
                  simulacao.lucroLiquido >= 0 ? "text-profit" : "text-loss",
                )}
              >
                Lucro líquido
              </span>
              <span
                className={cn(
                  "num text-sm font-bold",
                  simulacao.lucroLiquido >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {formatBRL(simulacao.lucroLiquido)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-muted px-4 py-3">
            <span className="text-xs font-medium">Margem líquida</span>
            <span
              className={cn(
                "num text-sm font-bold",
                simulacao.margem >= 0 ? "text-profit" : "text-loss",
              )}
            >
              {formatPercentual(simulacao.margem)}
            </span>
          </div>

          <div className="flex items-center justify-between rounded-xl border bg-muted/40 px-4 py-3">
            <span className="text-xs font-medium">
              Preço sugerido <span className="text-muted-foreground">(margem alvo {dados.margemDesejada}%)</span>
            </span>
            <span className="num text-sm font-bold text-brand">{formatBRL(simulacao.precoSugerido)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  rotulo,
  valor,
  aoAlterar,
  prefixo,
  exemplo,
  span,
}: {
  rotulo: string;
  valor: string;
  aoAlterar: (v: string) => void;
  prefixo: string;
  exemplo: string;
  span?: boolean;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", span && "sm:col-span-2")}>
      <Label className="text-xs font-medium">
        {rotulo} <span className="text-muted-foreground">({prefixo})</span>
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {prefixo}
        </span>
        <Input
          inputMode="decimal"
          value={valor}
          onChange={(e) => aoAlterar(e.target.value)}
          placeholder={exemplo}
          className={cn("pl-8", prefixo === "%" && "pl-7")}
        />
      </div>
    </div>
  );
}

function LinhaDre({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="num font-medium text-loss">{formatBRL(valor)}</span>
    </div>
  );
}
