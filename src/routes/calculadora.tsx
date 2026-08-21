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
          "Simule preço de venda, custos, impostos, comissões e descubra a margem líquida real do seu produto.",
      },
      { property: "og:title", content: "Calculadora de precificação | NEXO Rentabilidade" },
      {
        property: "og:description",
        content:
          "DRE em tempo real para sellers: veja quanto sobra depois de todos os custos do marketplace.",
      },
    ],
  }),
  component: Calculadora,
});

const PADRAO = {
  precoVenda: "150,00",
  cmv: "65,00",
  imposto: "9,00",
  comissao: "16,00",
  frete: "8,00",
  embalagem: "3,50",
  ads: "10,00",
  margemDesejada: "20,00",
};

function paraNumero(valor: string) {
  return Number(valor.replace(/\./g, "").replace(",", ".")) || 0;
}

function Calculadora() {
  const [precoVenda, setPrecoVenda] = useState(PADRAO.precoVenda);
  const [cmv, setCmv] = useState(PADRAO.cmv);
  const [imposto, setImposto] = useState(PADRAO.imposto);
  const [comissao, setComissao] = useState(PADRAO.comissao);
  const [frete, setFrete] = useState(PADRAO.frete);
  const [embalagem, setEmbalagem] = useState(PADRAO.embalagem);
  const [ads, setAds] = useState(PADRAO.ads);
  const [margemDesejada, setMargemDesejada] = useState(PADRAO.margemDesejada);

  const simulacao = useMemo(() => {
    const preco = paraNumero(precoVenda);
    const custoProduto = paraNumero(cmv);
    const taxaImposto = paraNumero(imposto) / 100;
    const taxaComissao = paraNumero(comissao) / 100;
    const taxaAds = paraNumero(ads) / 100;
    const valorFrete = paraNumero(frete);
    const valorEmbalagem = paraNumero(embalagem);

    const impostos = preco * taxaImposto;
    const comissaoValor = preco * taxaComissao;
    const adsValor = preco * taxaAds;
    const freteEmbalagem = valorFrete + valorEmbalagem;
    const custoTotal = custoProduto + impostos + comissaoValor + freteEmbalagem + adsValor;
    const lucroLiquido = preco - custoTotal;
    const margem = preco > 0 ? lucroLiquido / preco : 0;

    return {
      preco,
      custoProduto,
      impostos,
      comissaoValor,
      adsValor,
      freteEmbalagem,
      custoTotal,
      lucroLiquido,
      margem,
    };
  }, [precoVenda, cmv, imposto, comissao, frete, embalagem, ads]);

  const precoSugerido = useMemo(() => {
    const margem = paraNumero(margemDesejada) / 100;
    const taxaImposto = paraNumero(imposto) / 100;
    const taxaComissao = paraNumero(comissao) / 100;
    const taxaAds = paraNumero(ads) / 100;
    const custosFixos = paraNumero(cmv) + paraNumero(frete) + paraNumero(embalagem);

    const divisor = 1 - taxaImposto - taxaComissao - taxaAds - margem;
    if (divisor <= 0) return 0;
    return custosFixos / divisor;
  }, [margemDesejada, imposto, comissao, ads, cmv, frete, embalagem]);

  const resetar = () => {
    setPrecoVenda(PADRAO.precoVenda);
    setCmv(PADRAO.cmv);
    setImposto(PADRAO.imposto);
    setComissao(PADRAO.comissao);
    setFrete(PADRAO.frete);
    setEmbalagem(PADRAO.embalagem);
    setAds(PADRAO.ads);
    setMargemDesejada(PADRAO.margemDesejada);
  };

  const composicao = [
    { rotulo: "CMV", valor: simulacao.custoProduto, cor: "bg-loss" },
    { rotulo: "Impostos", valor: simulacao.impostos, cor: "bg-warning" },
    { rotulo: "Comissão", valor: simulacao.comissaoValor, cor: "bg-info" },
    { rotulo: "Frete + embalagem", valor: simulacao.freteEmbalagem, cor: "bg-primary" },
    { rotulo: "ADS", valor: simulacao.adsValor, cor: "bg-brand" },
  ];

  const total = simulacao.preco > 0 ? simulacao.preco : 1;

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Calculadora de precificação</h1>
          <p className="text-xs text-muted-foreground">
            Simule a DRE de uma venda em tempo real e descubra o preço ideal para a sua margem alvo.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={resetar} className="gap-2">
          <RotateCcw className="size-3.5" />
          Restaurar padrão
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Painel
          titulo="Dados da simulação"
          descricao="Preencha os custos reais do produto e do canal de venda"
          className="self-start"
        >
          <div className="grid gap-4 p-5 sm:grid-cols-2">
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

        <div className="space-y-6">
          <Painel titulo="DRE simulada" descricao="Composição do preço de venda em tempo real">
            <div className="space-y-5 p-5">
              <div className="flex items-center justify-between border-b pb-4">
                <span className="text-sm font-medium text-muted-foreground">Faturamento bruto</span>
                <span className="num text-lg font-bold">{formatBRL(simulacao.preco)}</span>
              </div>

              <div className="space-y-2">
                <LinhaDre rotulo="(-) Impostos" valor={simulacao.impostos} />
                <LinhaDre rotulo="(-) Comissões" valor={simulacao.comissaoValor} />
                <LinhaDre rotulo="(-) Frete e embalagem" valor={simulacao.freteEmbalagem} />
                <LinhaDre rotulo="(-) Custo do produto (CMV)" valor={simulacao.custoProduto} />
                <LinhaDre rotulo="(-) Investimento em ADS" valor={simulacao.adsValor} />
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <span
                  className={`text-sm font-bold ${
                    simulacao.lucroLiquido >= 0 ? "text-profit" : "text-loss"
                  }`}
                >
                  (=) Lucro líquido
                </span>
                <span
                  className={`num text-xl font-bold ${
                    simulacao.lucroLiquido >= 0 ? "text-profit" : "text-loss"
                  }`}
                >
                  {formatBRL(simulacao.lucroLiquido)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Margem líquida</span>
                <span
                  className={`num text-sm font-bold ${
                    simulacao.margem >= 0 ? "text-profit" : "text-loss"
                  }`}
                >
                  {formatPercentual(simulacao.margem)}
                </span>
              </div>

              <div>
                <div className="mb-2 flex justify-between text-[10px] text-muted-foreground">
                  <span>Composição do preço</span>
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
                        title={`${item.rotulo}: ${formatBRL(item.valor)} (${formatPercentual(
                          pct / 100,
                        )})`}
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
                <div className="mt-3 flex flex-wrap gap-3 text-[10px]">
                  {composicao.map((item) => (
                    <div key={item.rotulo} className="flex items-center gap-1.5">
                      <span className={cn("size-2 rounded-full", item.cor)} />
                      <span className="text-muted-foreground">{item.rotulo}</span>
                    </div>
                  ))}
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        simulacao.lucroLiquido >= 0 ? "bg-profit" : "bg-loss",
                      )}
                    />
                    <span className="text-muted-foreground">Lucro líquido</span>
                  </div>
                </div>
              </div>
            </div>
          </Painel>

          <Painel
            titulo="Margem alvo"
            descricao="Preço de venda sugerido para atingir a margem desejada"
          >
            <div className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
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
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Considera todos os custos e a margem líquida desejada.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border bg-profit-soft p-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-profit/20 p-2">
                    <Target className="size-4 text-profit" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">Como funciona o cálculo</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      O preço sugerido cobre o CMV, frete, embalagem, impostos, comissão, ADS e ainda
                      garante a margem que você definiu. Se o valor for muito acima do mercado,
                      reveja custos fixos ou a comissão do canal.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Painel>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <CardKpi
          titulo="Custo total por venda"
          valor={formatBRL(simulacao.custoTotal)}
          detalhe="Soma de todos os custos e descontos"
        />
        <CardKpi
          titulo="Lucro líquido estimado"
          valor={formatBRL(simulacao.lucroLiquido)}
          detalhe={`Margem de ${formatPercentual(simulacao.margem)}`}
          destaque={simulacao.lucroLiquido >= 0}
        />
        <CardKpi
          titulo="Preço sugerido para margem alvo"
          valor={formatBRL(precoSugerido)}
          detalhe={`Margem desejada: ${formatPercentual(paraNumero(margemDesejada) / 100)}`}
        />
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
    <div className={cn("space-y-1.5", span && "sm:col-span-2")}>
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
