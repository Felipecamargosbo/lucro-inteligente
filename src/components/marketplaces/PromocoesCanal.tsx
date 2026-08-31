import { useMemo, useState } from "react";
import { BadgePercent, TrendingDown } from "lucide-react";
import { anunciosService } from "@/services";
import { raioXAnuncio } from "@/lib/finance";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { Painel } from "@/components/comum/Indicadores";
import { useConfiguracoes } from "@/context/configuracoes";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ContaMarketplace } from "@/types";

/**
 * Promoções do canal. A pergunta que a tela responde não é "quanto desconto
 * dar", é "com esse desconto ainda sobra alguma coisa?".
 */
export function PromocoesCanal({ conta }: { conta: ContaMarketplace }) {
  // Desconto aplicado na simulação em massa, em % sobre o preço atual.
  const [desconto, setDesconto] = useState(10);
  const { metasPorConta, fiscal, custoOperacionalDetalhado } = useConfiguracoes();
  const metas = metasPorConta[conta.id] ?? null;
  const opcoes = (preco: number) => ({
    aliquotaImposto: fiscal.aliquota,
    custosOperacionais: custoOperacionalDetalhado(preco),
  });

  const elegiveis = useMemo(
    () =>
      anunciosService
        .listar()
        .filter((a) => a.contaId === conta.id && a.elegivelPromocao),
    [conta.id],
  );

  const linhas = useMemo(() => {
    const fator = 1 - desconto / 100;
    return elegiveis
      .map((a) => {
        const atual = raioXAnuncio(a, metas, a.precoAtual, opcoes(a.precoAtual));
        const precoPromo = Math.round(a.precoAtual * fator * 100) / 100;
        const comDesconto = raioXAnuncio(a, metas, precoPromo, opcoes(precoPromo));
        return { anuncio: a, atual, comDesconto };
      })
      .sort((x, y) => x.comDesconto.margem - y.comDesconto.margem);
  }, [elegiveis, desconto, metas, fiscal, custoOperacionalDetalhado]);

  const calculaveis = linhas.filter((l) => !l.comDesconto.semCusto);
  const viraPrejuizo = calculaveis.filter(
    (l) => l.atual.lucroLiquido >= 0 && l.comDesconto.lucroLiquido < 0,
  );
  const seguem = calculaveis.filter((l) => l.comDesconto.lucroLiquido >= 0);

  return (
    <div className="space-y-4">
      {/* Controle do desconto */}
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div>
          <label className="mb-1.5 block text-[11px] font-medium" htmlFor="desconto-campanha">
            Desconto da campanha (%)
          </label>
          <Input
            id="desconto-campanha"
            type="number"
            min={0}
            max={90}
            value={desconto}
            onChange={(e) => setDesconto(Math.min(Math.max(Number(e.target.value) || 0, 0), 90))}
            className="num h-8 w-24 text-xs"
          />
        </div>
        <p className="flex-1 text-[11px] leading-relaxed text-muted-foreground">
          Simula entrar na campanha com esse desconto em todos os{" "}
          {formatNumero(elegiveis.length)} anúncios elegíveis deste canal. Nenhum preço é alterado
          de verdade — é só a conta.
        </p>
      </div>

      {/* Veredito */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Continuam no lucro
          </p>
          <p className="num mt-1 text-2xl font-bold text-profit">
            {formatNumero(seguem.length)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            de {formatNumero(calculaveis.length)} com custo cadastrado
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Viram prejuízo com o desconto
          </p>
          <p className="num mt-1 text-2xl font-bold text-loss">
            {formatNumero(viraPrejuizo.length)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Hoje dão lucro; com {desconto}% de desconto, não
          </p>
        </div>

        <div className="rounded-xl border p-4">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Sem cálculo possível
          </p>
          <p className="num mt-1 text-2xl font-bold text-muted-foreground">
            {formatNumero(linhas.length - calculaveis.length)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Sem custo cadastrado — entrar é apostar no escuro
          </p>
        </div>
      </div>

      {viraPrejuizo.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl bg-loss-soft px-4 py-3">
          <TrendingDown className="mt-0.5 size-4 shrink-0 text-loss" />
          <p className="text-[11px] leading-relaxed text-loss">
            Com {desconto}% de desconto, <strong>{formatNumero(viraPrejuizo.length)}</strong>{" "}
            anúncios que hoje dão lucro passam a dar prejuízo. Aparecem no topo da lista abaixo.
          </p>
        </div>
      )}

      <Painel
        titulo="Anúncios elegíveis"
        descricao="Ordenados da pior margem para a melhor, já com o desconto aplicado"
      >
        {linhas.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-12 text-center">
            <BadgePercent className="size-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">Nenhuma campanha disponível</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Este canal não tem anúncios elegíveis a promoção no momento.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Produto / SKU</th>
                  <th className="px-3 py-2 text-right font-medium">Preço hoje</th>
                  <th className="px-3 py-2 text-right font-medium">Preço na campanha</th>
                  <th className="px-3 py-2 text-right font-medium">Sobra hoje</th>
                  <th className="px-3 py-2 text-right font-medium">Sobra na campanha</th>
                  <th className="px-3 py-2 text-center font-medium">Veredito</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(({ anuncio, atual, comDesconto }) => {
                  const semCusto = comDesconto.semCusto;
                  const virou = !semCusto && atual.lucroLiquido >= 0 && comDesconto.lucroLiquido < 0;
                  return (
                    <tr key={anuncio.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="max-w-[240px] px-4 py-3">
                        <p className="truncate text-xs font-medium">{anuncio.produto}</p>
                        <p className="num text-[10px] text-muted-foreground">{anuncio.sku}</p>
                      </td>
                      <td className="num px-3 py-3 text-right text-xs">
                        {formatBRL(atual.precoVenda)}
                      </td>
                      <td className="num px-3 py-3 text-right text-xs font-semibold">
                        {formatBRL(comDesconto.precoVenda)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {semCusto ? (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        ) : (
                          <span
                            className={cn(
                              "num text-xs",
                              atual.lucroLiquido >= 0 ? "text-profit" : "text-loss",
                            )}
                          >
                            {formatBRL(atual.lucroLiquido)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {semCusto ? (
                          <span className="text-[10px] text-muted-foreground">—</span>
                        ) : (
                          <div className="inline-flex flex-col items-end">
                            <span
                              className={cn(
                                "num text-xs font-bold",
                                comDesconto.lucroLiquido >= 0 ? "text-profit" : "text-loss",
                              )}
                            >
                              {formatBRL(comDesconto.lucroLiquido)}
                            </span>
                            <span
                              className={cn(
                                "num text-[10px]",
                                comDesconto.lucroLiquido >= 0
                                  ? "text-muted-foreground"
                                  : "text-loss",
                              )}
                            >
                              {formatPercentual(comDesconto.margem)}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {semCusto ? (
                          <span className="rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                            sem cálculo
                          </span>
                        ) : virou ? (
                          <span className="rounded bg-loss-soft px-2 py-1 text-[10px] font-bold text-loss">
                            não entrar
                          </span>
                        ) : comDesconto.lucroLiquido < 0 ? (
                          <span className="rounded bg-loss-soft px-2 py-1 text-[10px] font-bold text-loss">
                            já no prejuízo
                          </span>
                        ) : comDesconto.faixa === "abaixo-da-minima" ? (
                          <span className="rounded bg-warning-soft px-2 py-1 text-[10px] font-bold">
                            abaixo da mínima
                          </span>
                        ) : (
                          <span className="rounded bg-profit-soft px-2 py-1 text-[10px] font-bold text-profit">
                            pode entrar
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Painel>
    </div>
  );
}
