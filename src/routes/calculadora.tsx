import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { RotateCcw, Target } from "lucide-react";
import { formatBRL, formatPercentual } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

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

type CanalId = "mercado-livre" | "shopee" | "amazon" | "magalu" | "todos";

const CANAIS: { id: CanalId; nome: string; comissao: string; frete: string }[] = [
  { id: "mercado-livre", nome: "Mercado Livre", comissao: "16,00", frete: "8,00" },
  { id: "shopee", nome: "Shopee", comissao: "20,00", frete: "10,00" },
  { id: "amazon", nome: "Amazon", comissao: "15,00", frete: "12,00" },
  { id: "magalu", nome: "Magalu", comissao: "18,00", frete: "9,00" },
  { id: "todos", nome: "Todos (comparativo)", comissao: "16,00", frete: "8,00" },
];

const PADRAO = {
  precoVenda: "150,00",
  cmv: "65,00",
  imposto: "9,00",
  taxaFixa: "0,00",
  embalagem: "3,50",
  ads: "10,00",
  margemDesejada: "20,00",
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
    taxaFixa: entrada.valorTaxaFixa,
    custoTotal,
    lucroLiquido,
    margem: entrada.preco > 0 ? lucroLiquido / entrada.preco : 0,
  };
}

function Calculadora() {
  const [canal, setCanal] = useState<CanalId>("mercado-livre");
  const [precoVenda, setPrecoVenda] = useState(PADRAO.precoVenda);
  const [cmv, setCmv] = useState(PADRAO.cmv);
  const [imposto, setImposto] = useState(PADRAO.imposto);
  const [taxaFixa, setTaxaFixa] = useState(PADRAO.taxaFixa);
  const [comissao, setComissao] = useState(CANAIS[0]!.comissao);
  const [frete, setFrete] = useState(CANAIS[0]!.frete);
  const [embalagem, setEmbalagem] = useState(PADRAO.embalagem);
  const [ads, setAds] = useState(PADRAO.ads);
  const [margemDesejada, setMargemDesejada] = useState(PADRAO.margemDesejada);

  const comparativo = canal === "todos";

  const trocarCanal = (id: CanalId) => {
    setCanal(id);
    const preset = CANAIS.find((c) => c.id === id);
    if (preset) {
      setComissao(preset.comissao);
      setFrete(preset.frete);
    }
  };

  const base = useMemo(
    () => ({
      preco: paraNumero(precoVenda),
      custoProduto: paraNumero(cmv),
      taxaImposto: paraNumero(imposto) / 100,
      taxaAds: paraNumero(ads) / 100,
      valorEmbalagem: paraNumero(embalagem),
      valorTaxaFixa: paraNumero(taxaFixa),
    }),
    [precoVenda, cmv, imposto, ads, embalagem, taxaFixa],
  );

  const simulacao = useMemo(
    () =>
      simular({
        ...base,
        taxaComissao: paraNumero(comissao) / 100,
        valorFrete: paraNumero(frete),
      }),
    [base, comissao, frete],
  );

  const linhasComparativo = useMemo(
    () =>
      CANAIS.filter((c) => c.id !== "todos").map((c) => ({
        nome: c.nome,
        ...simular({
          ...base,
          taxaComissao: paraNumero(c.comissao) / 100,
          valorFrete: paraNumero(c.frete),
        }),
      })),
    [base],
  );

  const precoSugerido = useMemo(() => {
    const margem = paraNumero(margemDesejada) / 100;
    const divisor =
      1 - base.taxaImposto - paraNumero(comissao) / 100 - base.taxaAds - margem;
    if (divisor <= 0) return 0;
    return (base.custoProduto + paraNumero(frete) + base.valorEmbalagem + base.valorTaxaFixa) / divisor;
  }, [margemDesejada, base, comissao, frete]);

  const resetar = () => {
    setPrecoVenda(PADRAO.precoVenda);
    setCmv(PADRAO.cmv);
    setImposto(PADRAO.imposto);
    setTaxaFixa(PADRAO.taxaFixa);
    setEmbalagem(PADRAO.embalagem);
    setAds(PADRAO.ads);
    setMargemDesejada(PADRAO.margemDesejada);
    trocarCanal(canal);
  };

  const composicao = [
    { rotulo: "CMV", valor: simulacao.custoProduto, cor: "bg-loss" },
    { rotulo: "Impostos", valor: simulacao.impostos, cor: "bg-warning" },
    { rotulo: "Comissão", valor: simulacao.comissaoValor, cor: "bg-info" },
    { rotulo: "Taxa fixa", valor: simulacao.taxaFixa, cor: "bg-secondary" },
    { rotulo: "Frete + embalagem", valor: simulacao.freteEmbalagem, cor: "bg-primary" },
    { rotulo: "ADS", valor: simulacao.adsValor, cor: "bg-brand" },
  ];

  const total = simulacao.preco > 0 ? simulacao.preco : 1;

  return (
    <div className="mx-auto max-w-[1200px] space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            Calculadora de precificação
          </h1>
          <p className="text-xs text-muted-foreground">
            Simule a DRE de uma venda em tempo real e descubra o preço ideal por canal.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetar} className="shrink-0 gap-2">
          <RotateCcw className="size-3.5" />
          Restaurar padrão
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border bg-card p-2 shadow-card">
        {CANAIS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => trocarCanal(c.id)}
            className={cn(
              "rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
              canal === c.id
                ? "bg-brand text-brand-foreground"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {c.nome}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* Coluna esquerda */}
        <div className="space-y-4">
          <Painel
            titulo="Dados da simulação"
            descricao="Custos reais do produto e do canal de venda"
          >
            <div className="grid gap-3 p-5 sm:grid-cols-2">
              <Campo
                rotulo="Preço de venda desejado"
                valor={precoVenda}
                aoAlterar={setPrecoVenda}
                prefixo="R$"
                exemplo="150,00"
              />
              <Campo
                rotulo="Custo do produto / CMV"
                valor={cmv}
                aoAlterar={setCmv}
                prefixo="R$"
                exemplo="65,00"
              />
              <Campo
                rotulo="Imposto"
                valor={imposto}
                aoAlterar={setImposto}
                prefixo="%"
                exemplo="9,00"
              />
              <Campo
                rotulo="Comissão do marketplace"
                valor={comissao}
                aoAlterar={setComissao}
                prefixo="%"
                exemplo="16,00"
              />
              <Campo
                rotulo="Frete médio"
                valor={frete}
                aoAlterar={setFrete}
                prefixo="R$"
                exemplo="8,00"
              />
              <Campo
                rotulo="Embalagem / operacional"
                valor={embalagem}
                aoAlterar={setEmbalagem}
                prefixo="R$"
                exemplo="3,50"
              />
              <Campo
                rotulo="Investimento em ADS"
                valor={ads}
                aoAlterar={setAds}
                prefixo="%"
                exemplo="10,00"
                span
              />
            </div>
          </Painel>

          <Painel titulo="Margem alvo" descricao="Preço sugerido para a margem desejada">
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo
                  rotulo="Margem desejada"
                  valor={margemDesejada}
                  aoAlterar={setMargemDesejada}
                  prefixo="%"
                  exemplo="20,00"
                />
                <div className="rounded-xl border bg-muted/40 p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Preço de venda sugerido
                  </p>
                  <p className="num mt-1 text-xl font-bold text-brand">
                    {formatBRL(precoSugerido)}
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
                      O preço sugerido cobre CMV, frete, embalagem, impostos, comissão e ADS,
                      garantindo a margem definida. Se ficar acima do mercado, reveja custos
                      fixos ou o canal escolhido.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Painel>
        </div>

        {/* Coluna direita */}
        <div className="space-y-4">
          <Painel
            titulo={comparativo ? "Comparativo entre marketplaces" : "DRE simulada"}
            descricao={
              comparativo
                ? "Mesmo produto, custos de cada canal"
                : "Composição do preço de venda em tempo real"
            }
          >
            {comparativo ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold">Canal</th>
                      <th className="px-4 py-2 text-right font-semibold">Custo total</th>
                      <th className="px-4 py-2 text-right font-semibold">Lucro</th>
                      <th className="px-4 py-2 text-right font-semibold">Margem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasComparativo.map((l) => (
                      <tr key={l.nome} className="border-t">
                        <td className="px-4 py-2.5 font-medium">{l.nome}</td>
                        <td className="num px-4 py-2.5 text-right">{formatBRL(l.custoTotal)}</td>
                        <td
                          className={cn(
                            "num px-4 py-2.5 text-right font-semibold",
                            l.lucroLiquido >= 0 ? "text-profit" : "text-loss",
                          )}
                        >
                          {formatBRL(l.lucroLiquido)}
                        </td>
                        <td
                          className={cn(
                            "num px-4 py-2.5 text-right font-semibold",
                            l.margem >= 0 ? "text-profit" : "text-loss",
                          )}
                        >
                          {formatPercentual(l.margem)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-4 p-5">
                <div className="flex items-center justify-between border-b pb-3">
                  <span className="text-sm font-medium text-muted-foreground">
                    Faturamento bruto
                  </span>
                  <span className="num text-lg font-bold">{formatBRL(simulacao.preco)}</span>
                </div>

                <div className="space-y-1.5">
                  <LinhaDre rotulo="(-) Impostos" valor={simulacao.impostos} />
                  <LinhaDre rotulo="(-) Comissões" valor={simulacao.comissaoValor} />
                  <LinhaDre rotulo="(-) Frete e embalagem" valor={simulacao.freteEmbalagem} />
                  <LinhaDre rotulo="(-) Custo do produto (CMV)" valor={simulacao.custoProduto} />
                  <LinhaDre rotulo="(-) Investimento em ADS" valor={simulacao.adsValor} />
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <span
                    className={cn(
                      "text-sm font-bold",
                      simulacao.lucroLiquido >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    (=) Lucro líquido
                  </span>
                  <span
                    className={cn(
                      "num text-xl font-bold",
                      simulacao.lucroLiquido >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {formatBRL(simulacao.lucroLiquido)}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Margem líquida
                  </span>
                  <span
                    className={cn(
                      "num text-sm font-bold",
                      simulacao.margem >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {formatPercentual(simulacao.margem)}
                  </span>
                </div>
              </div>
            )}
          </Painel>

          <Painel titulo="Composição do preço" descricao="Para onde vai cada real da venda">
            <div className="p-5">
              <div className="mb-2 flex justify-between text-[10px] text-muted-foreground">
                <span>Preço de venda</span>
                <span className="num">{formatBRL(simulacao.preco)}</span>
              </div>
              <div className="flex h-3 w-full overflow-hidden rounded-full">
                {composicao.map((item) => {
                  const pct = Math.max(0, (item.valor / total) * 100);
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
                  className={simulacao.lucroLiquido >= 0 ? "bg-profit" : "bg-loss"}
                  style={{
                    width: `${Math.max(0, (Math.abs(simulacao.lucroLiquido) / total) * 100)}%`,
                  }}
                  title={`Lucro líquido: ${formatBRL(simulacao.lucroLiquido)}`}
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
                      simulacao.lucroLiquido >= 0 ? "bg-profit" : "bg-loss",
                    )}
                  />
                  <span className="text-muted-foreground">
                    Lucro líquido · {formatBRL(simulacao.lucroLiquido)}
                  </span>
                </div>
              </div>
            </div>
          </Painel>

          <div className="grid gap-3 sm:grid-cols-3">
            <CardKpi
              titulo="Custo total"
              valor={formatBRL(simulacao.custoTotal)}
              detalhe="Todos os custos por venda"
            />
            <CardKpi
              titulo="Lucro líquido"
              valor={formatBRL(simulacao.lucroLiquido)}
              detalhe={`Margem de ${formatPercentual(simulacao.margem)}`}
              destaque={simulacao.lucroLiquido >= 0}
            />
            <CardKpi
              titulo="Preço sugerido"
              valor={formatBRL(precoSugerido)}
              detalhe={`Alvo: ${formatPercentual(paraNumero(margemDesejada) / 100)}`}
            />
          </div>
        </div>
      </div>
    </div>
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
