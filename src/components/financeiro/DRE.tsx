import { getMarketplace } from "@/data/mock";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { rotuloCompetencia } from "@/lib/finance";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { cn } from "@/lib/utils";
import type { DreConta, DreEmpresa } from "@/lib/finance";
import type { Empresa } from "@/types";

/* ------------------------------------------------------------------ */
/* A régua do dinheiro                                                 */
/* ------------------------------------------------------------------ */

type TipoDegrau = "entrada" | "saida" | "resultado";

const COR_BARRA: Record<TipoDegrau, string> = {
  entrada: "bg-brand",
  saida: "bg-loss",
  resultado: "bg-profit",
};

/**
 * Um degrau da régua. A largura da barra é a proporção daquele valor sobre o
 * faturamento — é o que faz você VER que a comissão pesa mais que o imposto,
 * em vez de ter que comparar dois números do mesmo tamanho na tela.
 */
function Degrau({
  rotulo,
  valor,
  base,
  tipo,
  percentualAnterior,
  destaque,
}: {
  rotulo: string;
  valor: number;
  base: number;
  tipo: TipoDegrau;
  /** Fração 0-1 que esta linha representava no mês anterior; null = sem base */
  percentualAnterior: number | null;
  destaque?: boolean;
}) {
  const percentual = base > 0 ? Math.abs(valor) / base : 0;
  const largura = Math.min(100, percentual * 100);
  const subiu = percentualAnterior !== null && percentual > percentualAnterior + 0.001;
  const caiu = percentualAnterior !== null && percentual < percentualAnterior - 0.001;
  // Numa dedução, crescer é ruim. No resultado, crescer é bom.
  const bom = tipo === "resultado" ? subiu : caiu;

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-3 py-1.5",
        destaque && "border-t pt-3",
      )}
    >
      <span
        className={cn(
          "truncate text-xs",
          destaque ? "font-bold" : "text-muted-foreground",
          tipo === "saida" && !destaque && "pl-3",
        )}
      >
        {tipo === "saida" && !destaque ? `− ${rotulo}` : rotulo}
      </span>

      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", COR_BARRA[tipo])}
          style={{ width: `${largura}%` }}
        />
      </div>

      <div className="flex items-baseline justify-end gap-2 whitespace-nowrap">
        <span
          className={cn(
            "num text-xs",
            destaque && "font-bold",
            tipo === "resultado" && (valor >= 0 ? "text-profit" : "text-loss"),
          )}
        >
          {tipo === "saida" ? `− ${formatBRL(Math.abs(valor))}` : formatBRL(valor)}
        </span>
        <span className="num w-12 text-right text-[11px] text-muted-foreground">
          {formatPercentual(percentual)}
        </span>
        <span
          className={cn(
            "num w-24 text-right text-[10px]",
            bom ? "text-profit" : subiu || caiu ? "text-loss" : "text-transparent",
          )}
        >
          {percentualAnterior !== null && (subiu || caiu)
            ? `${subiu ? "▲" : "▼"} era ${formatPercentual(percentualAnterior)}`
            : "—"}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bloco de uma conta                                                  */
/* ------------------------------------------------------------------ */

function LinhaConta({
  rotulo,
  valor,
  base,
  negativo,
  subtotal,
  final,
}: {
  rotulo: string;
  valor: number;
  base: number;
  negativo?: boolean;
  subtotal?: boolean;
  final?: boolean;
}) {
  const percentual = base > 0 ? valor / base : 0;
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-5 py-2",
        (subtotal || final) && "border-t bg-muted/30",
        final && "bg-muted/50",
      )}
    >
      <span
        className={cn(
          "text-xs",
          subtotal || final ? "font-bold" : "pl-3 text-muted-foreground",
        )}
      >
        {negativo ? `− ${rotulo}` : rotulo}
      </span>
      <div className="flex items-baseline gap-3 whitespace-nowrap">
        <span
          className={cn(
            "num text-xs",
            (subtotal || final) && "font-bold",
            final && (valor >= 0 ? "text-profit" : "text-loss"),
          )}
        >
          {negativo ? `− ${formatBRL(Math.abs(valor))}` : formatBRL(valor)}
        </span>
        <span className="num w-14 text-right text-[11px] text-muted-foreground">
          {formatPercentual(percentual)}
        </span>
      </div>
    </div>
  );
}

function BlocoConta({ conta }: { conta: DreConta }) {
  const canal = getMarketplace(conta.marketplaceId).nome;
  return (
    <Painel
      titulo={`${canal} · ${conta.nome}`}
      descricao={`${formatNumero(conta.pedidos)} pedidos no mês`}
      acoes={
        <div className="flex items-center gap-2">
          <LogoMarketplace id={conta.marketplaceId} tamanho="xs" />
        </div>
      }
    >
      <div className="flex items-center justify-end gap-4 px-5 pb-0.5 pt-1">
        <div className="flex items-baseline gap-3 whitespace-nowrap">
          <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground/60">
            Valor
          </span>
          <span
            className="num w-14 text-right text-[9px] font-medium uppercase tracking-wide text-muted-foreground/60"
            title="Fatia do faturamento desta conta — cada linha mostra quanto consome do 100% do faturamento dela mesma."
          >
            % da conta
          </span>
        </div>
      </div>
      <div className="divide-y divide-transparent py-1">
        <LinhaConta rotulo="Faturamento" valor={conta.faturamento} base={conta.faturamento} subtotal />
        <LinhaConta rotulo={`Comissão do ${canal}`} valor={conta.comissao} base={conta.faturamento} negativo />
        <LinhaConta rotulo="Taxa fixa por pedido" valor={conta.taxaFixa} base={conta.faturamento} negativo />
        <LinhaConta
          rotulo="Líquido do marketplace"
          valor={conta.liquidoMarketplace}
          base={conta.faturamento}
          subtotal
        />
        <LinhaConta rotulo="Custo dos produtos (CMV)" valor={conta.cmv} base={conta.faturamento} negativo />
        <LinhaConta rotulo="Impostos" valor={conta.impostos} base={conta.faturamento} negativo />
        <LinhaConta
          rotulo="Custos por venda (embalagem, frete)"
          valor={conta.custosPorVenda}
          base={conta.faturamento}
          negativo
        />
        <LinhaConta
          rotulo="Margem de contribuição"
          valor={conta.margemContribuicao}
          base={conta.faturamento}
          subtotal
        />
        <LinhaConta rotulo="ADS" valor={conta.ads} base={conta.faturamento} negativo />
        <LinhaConta rotulo="Resultado desta conta" valor={conta.resultado} base={conta.faturamento} final />
      </div>
    </Painel>
  );
}

/* ------------------------------------------------------------------ */

export function DRE({
  dre,
  dreAnterior,
  empresa,
  aoGerenciarDespesas,
}: {
  dre: DreEmpresa;
  dreAnterior: DreEmpresa;
  empresa: Empresa;
  /** Leva o seller para a aba de Lançamentos sem sair da página */
  aoGerenciarDespesas: () => void;
}) {
  const base = dre.faturamento;
  const baseAnterior = dreAnterior.faturamento;

  /** A fatia que uma linha ocupava no mês passado, pra comparar com agora. */
  const antes = (valor: number) =>
    baseAnterior > 0 ? Math.abs(valor) / baseAnterior : null;

  if (dre.contas.length === 0) {
    return (
      <Painel
        titulo={`DRE · ${rotuloCompetencia(dre.competencia)}`}
        descricao={empresa.nome}
      >
        <div className="px-5 py-14 text-center text-sm text-muted-foreground">
          Nenhuma venda desta empresa em {rotuloCompetencia(dre.competencia)}.
          <br />
          Escolha outro mês ou outra empresa no topo da página.
        </div>
      </Painel>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Resumo curto — a resposta rápida de quem só quer conferir */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CardKpi titulo="Faturamento" valor={formatBRL(dre.faturamento)} />
        <CardKpi
          titulo="Margem de contribuição"
          valor={formatBRL(dre.margemContribuicao)}
          detalhe={`${formatPercentual(base > 0 ? dre.margemContribuicao / base : 0)} do faturamento`}
          dica="O que sobra das vendas antes de pagar as despesas fixas da empresa (aluguel, contador, folha)."
        />
        <CardKpi
          titulo="Lucro líquido"
          valor={formatBRL(dre.lucroLiquido)}
          detalhe={`Margem de ${formatPercentual(dre.margem)}`}
          destaque
        />
        <CardKpi
          titulo="Ponto de equilíbrio"
          valor={dre.pontoEquilibrio > 0 ? formatBRL(dre.pontoEquilibrio) : "—"}
          detalhe={
            dre.pontoEquilibrio > 0
              ? `Margem de segurança: ${formatPercentual(dre.margemSeguranca)}`
              : "Lance suas despesas fixas para calcular"
          }
          dica="Quanto você precisa faturar no mês para o resultado das vendas cobrir exatamente as despesas fixas. Abaixo disso, o mês fecha no prejuízo."
        />
      </div>

      {/* 2. A régua do dinheiro */}
      <Painel
        titulo="Para onde foi o dinheiro"
        descricao="O tamanho da barra é o peso real de cada custo sobre o faturamento"
      >
        <div className="space-y-1 p-5">
          <Degrau
            rotulo="Faturamento"
            valor={dre.faturamento}
            base={base}
            tipo="entrada"
            percentualAnterior={null}
            destaque
          />
          <Degrau
            rotulo="Comissões dos canais"
            valor={dre.comissao}
            base={base}
            tipo="saida"
            percentualAnterior={antes(dreAnterior.comissao)}
          />
          <Degrau
            rotulo="Taxas fixas por pedido"
            valor={dre.taxaFixa}
            base={base}
            tipo="saida"
            percentualAnterior={antes(dreAnterior.taxaFixa)}
          />
          <Degrau
            rotulo="Custo dos produtos (CMV)"
            valor={dre.cmv}
            base={base}
            tipo="saida"
            percentualAnterior={antes(dreAnterior.cmv)}
          />
          <Degrau
            rotulo="Impostos"
            valor={dre.impostos}
            base={base}
            tipo="saida"
            percentualAnterior={antes(dreAnterior.impostos)}
          />
          <Degrau
            rotulo="Custos por venda"
            valor={dre.custosPorVenda}
            base={base}
            tipo="saida"
            percentualAnterior={antes(dreAnterior.custosPorVenda)}
          />
          <Degrau
            rotulo="ADS"
            valor={dre.ads}
            base={base}
            tipo="saida"
            percentualAnterior={antes(dreAnterior.ads)}
          />
          <Degrau
            rotulo="Despesas fixas da empresa"
            valor={dre.despesas}
            base={base}
            tipo="saida"
            percentualAnterior={antes(dreAnterior.despesas)}
          />
          {dre.receitasExtras > 0 && (
            <Degrau
              rotulo="Receitas extras"
              valor={dre.receitasExtras}
              base={base}
              tipo="entrada"
              percentualAnterior={antes(dreAnterior.receitasExtras)}
            />
          )}
          <Degrau
            rotulo="Lucro líquido"
            valor={dre.lucroLiquido}
            base={base}
            tipo="resultado"
            percentualAnterior={
              baseAnterior > 0 ? dreAnterior.lucroLiquido / baseAnterior : null
            }
            destaque
          />
        </div>
        <p className="border-t bg-muted/40 px-5 py-3 text-xs text-muted-foreground">
          De cada R$ 100 que entraram,{" "}
          <strong className={dre.margem >= 0 ? "text-profit" : "text-loss"}>
            {formatBRL(dre.margem * 100)}
          </strong>{" "}
          ficaram com você.
        </p>
      </Painel>

      {/* 3. Resumo das contas */}
      <Painel
        titulo="Resumo das contas desta empresa"
        descricao="Para comparar todas de uma olhada antes de descer no detalhe"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-2.5 font-medium">Conta</th>
                <th className="px-3 py-2.5 text-right font-medium">Pedidos</th>
                <th className="px-3 py-2.5 text-right font-medium">Faturamento</th>
                <th className="px-3 py-2.5 text-right font-medium">Margem contrib.</th>
                <th className="px-3 py-2.5 text-right font-medium">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {dre.contas.map((c) => (
                <tr key={c.contaId} className="border-b last:border-0">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <LogoMarketplace id={c.marketplaceId} tamanho="xs" />
                      <span className="text-xs font-medium">
                        {getMarketplace(c.marketplaceId).nome} · {c.nome}
                      </span>
                    </div>
                  </td>
                  <td className="num px-3 py-3 text-right text-xs">
                    {formatNumero(c.pedidos)}
                  </td>
                  <td className="num px-3 py-3 text-right text-xs font-semibold">
                    {formatBRL(c.faturamento)}
                  </td>
                  <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                    {formatPercentual(
                      c.faturamento > 0 ? c.margemContribuicao / c.faturamento : 0,
                    )}
                  </td>
                  <td
                    className={cn(
                      "num px-3 py-3 text-right text-xs font-bold",
                      c.resultado >= 0 ? "text-profit" : "text-loss",
                    )}
                  >
                    {formatBRL(c.resultado)}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/20 font-semibold">
                <td className="px-5 py-3 text-xs">Total das contas</td>
                <td className="num px-3 py-3 text-right text-xs">
                  {formatNumero(dre.contas.reduce((s, c) => s + c.pedidos, 0))}
                </td>
                <td className="num px-3 py-3 text-right text-xs">
                  {formatBRL(dre.faturamento)}
                </td>
                <td className="num px-3 py-3 text-right text-xs text-muted-foreground">
                  {formatPercentual(base > 0 ? dre.margemContribuicao / base : 0)}
                </td>
                <td className="num px-3 py-3 text-right text-xs text-profit">
                  {formatBRL(dre.resultadoDasContas)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Painel>

      {/* 4. Um bloco completo por conta */}
      {dre.contas.map((c) => (
        <BlocoConta key={c.contaId} conta={c} />
      ))}

      <p className="text-[11px] text-muted-foreground">
        As taxas acima usam os dados que o sistema tem hoje. Quando a API de cada canal
        estiver conectada, cada tarifa vai aparecer com o nome que o próprio canal usa
        na liquidação — taxa de serviço da Shopee, frete Flex do Mercado Livre, e assim
        por diante.
      </p>

      {/* 5. Despesas do mês, uma embaixo da outra */}
      <Painel
        titulo={`Despesas de ${rotuloCompetencia(dre.competencia)}`}
        descricao="Gastos da empresa que não vêm de venda nenhuma"
        acoes={
          <button
            onClick={aoGerenciarDespesas}
            className="text-xs font-semibold text-brand transition-opacity hover:opacity-70"
          >
            Gerenciar despesas
          </button>
        }
      >
        {dre.lancamentosDespesa.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-muted-foreground">
            Você ainda não lançou nenhuma despesa fixa neste mês. O lucro abaixo{" "}
            <strong>não está descontando</strong> aluguel, contador, energia nem folha.
          </div>
        ) : (
          <div className="divide-y">
            {dre.lancamentosDespesa.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-4 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium">
                    {l.categoria}
                    {l.recorrente && (
                      <span className="ml-2 rounded bg-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-info">
                        todo mês
                      </span>
                    )}
                  </p>
                  {l.descricao && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {l.descricao}
                    </p>
                  )}
                </div>
                <span className="num whitespace-nowrap text-xs font-semibold text-loss">
                  − {formatBRL(l.valor)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-4 bg-muted/40 px-5 py-3">
              <span className="text-xs font-bold">Total de despesas</span>
              <span className="num text-xs font-bold text-loss">
                − {formatBRL(dre.despesas)}
              </span>
            </div>
          </div>
        )}
      </Painel>

      {dre.receitasExtras > 0 && (
        <Painel titulo="Receitas extras" descricao="Entradas que não vieram de venda">
          <div className="divide-y">
            {dre.lancamentosReceita.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-4 px-5 py-2.5">
                <span className="truncate text-xs font-medium">{l.categoria}</span>
                <span className="num whitespace-nowrap text-xs font-semibold text-profit">
                  + {formatBRL(l.valor)}
                </span>
              </div>
            ))}
          </div>
        </Painel>
      )}

      {/* 6. O fechamento */}
      <section className="card-glow overflow-hidden">
        <header className="border-b bg-brand-soft px-5 py-3">
          <h2 className="text-sm font-bold">
            Resultado de {rotuloCompetencia(dre.competencia)}
          </h2>
          <p className="text-xs text-muted-foreground">
            {empresa.nome} · CNPJ {empresa.cnpj}
          </p>
        </header>
        <div className="divide-y">
          <LinhaConta
            rotulo="Resultado das contas"
            valor={dre.resultadoDasContas}
            base={base}
            subtotal
          />
          <LinhaConta rotulo="Despesas do mês" valor={dre.despesas} base={base} negativo />
          {dre.receitasExtras > 0 && (
            <LinhaConta rotulo="Receitas extras" valor={dre.receitasExtras} base={base} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <span className="text-sm font-bold">Lucro líquido</span>
            <div className="flex items-baseline gap-3">
              <span
                className={cn(
                  "num text-xl font-bold",
                  dre.lucroLiquido >= 0 ? "text-profit" : "text-loss",
                )}
              >
                {formatBRL(dre.lucroLiquido)}
              </span>
              <span className="num text-sm text-muted-foreground">
                {formatPercentual(dre.margem)}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
