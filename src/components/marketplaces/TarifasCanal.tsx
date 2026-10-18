import { useMemo, useState } from "react";
import { anunciosService, vendasService } from "@/services";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ContaMarketplace } from "@/types";

/** Janela usada para o frete médio que o seller está pagando de verdade. */
const DIAS_FRETE = 90;

interface LinhaTarifa {
  id: string;
  sku: string;
  produto: string;
  tipo: string;
  preco: number;
  comissaoPercentual: number;
  comissaoValor: number;
  custoFixo: number;
  /** Frete médio por unidade pago nas vendas recentes; null = sem venda */
  freteMedio: number | null;
  total: number;
  totalPercentual: number;
}

type Ordem = "total" | "comissao" | "preco" | "produto";

/**
 * Tarifas de hoje de cada anúncio: comissão do tipo/categoria, custo fixo
 * (produtos baratos) e o frete que o seller está pagando nas vendas. Tudo
 * o que sai de cada venda antes do custo do produto e dos impostos.
 */
export function TarifasCanal({ conta }: { conta: ContaMarketplace }) {
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<string>("todos");
  const [ordem, setOrdem] = useState<Ordem>("total");

  const dados = useMemo(() => {
    const anuncios = anunciosService.listar().filter((a) => a.contaId === conta.id);

    // Frete médio por unidade, por SKU, nas vendas dos últimos 90 dias.
    const corte = Date.now() - DIAS_FRETE * 86400000;
    const frete = new Map<string, { valor: number; unidades: number }>();
    for (const p of vendasService.listar()) {
      if (p.contaId !== conta.id || p.status === "cancelado") continue;
      if (p.freteVendedor === undefined || new Date(p.data).getTime() < corte) continue;
      const atual = frete.get(p.sku) ?? { valor: 0, unidades: 0 };
      atual.valor += p.freteVendedor;
      atual.unidades += p.quantidade;
      frete.set(p.sku, atual);
    }

    const linhas: LinhaTarifa[] = anuncios.map((a) => {
      const f = frete.get(a.sku);
      const freteMedio = f && f.unidades > 0 ? f.valor / f.unidades : null;
      const comissaoValor = a.precoAtual * a.comissaoPercentual;
      const total = comissaoValor + a.taxaFixa + (freteMedio ?? 0);
      return {
        id: a.id,
        sku: a.sku,
        produto: a.produto,
        tipo: [a.tipoAnuncio, a.catalogo === true ? "Catálogo" : a.catalogo === false ? "Tradicional" : null]
          .filter(Boolean)
          .join(" · ") || "—",
        preco: a.precoAtual,
        comissaoPercentual: a.comissaoPercentual,
        comissaoValor,
        custoFixo: a.taxaFixa,
        freteMedio,
        total,
        totalPercentual: a.precoAtual > 0 ? total / a.precoAtual : 0,
      };
    });

    // Resumo por tipo de anúncio: faixa de comissão cobrada hoje.
    const porTipo = new Map<string, { min: number; max: number; qtd: number }>();
    for (const l of linhas) {
      if (l.comissaoPercentual <= 0) continue;
      const t = porTipo.get(l.tipo) ?? { min: Infinity, max: 0, qtd: 0 };
      t.min = Math.min(t.min, l.comissaoPercentual);
      t.max = Math.max(t.max, l.comissaoPercentual);
      t.qtd += 1;
      porTipo.set(l.tipo, t);
    }

    const comFixo = linhas.filter((l) => l.custoFixo > 0);
    const comFrete = linhas.filter((l) => l.freteMedio !== null);
    const freteGeral = comFrete.length
      ? comFrete.reduce((s, l) => s + (l.freteMedio ?? 0), 0) / comFrete.length
      : null;

    return { linhas, porTipo, comFixo, freteGeral };
  }, [conta]);

  const tipos = [...dados.porTipo.keys()].sort();

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    let lista = dados.linhas;
    if (tipo !== "todos") lista = lista.filter((l) => l.tipo === tipo);
    if (termo)
      lista = lista.filter(
        (l) => l.sku.toLowerCase().includes(termo) || l.produto.toLowerCase().includes(termo),
      );
    const ordenada = [...lista];
    if (ordem === "total") ordenada.sort((a, b) => b.totalPercentual - a.totalPercentual);
    if (ordem === "comissao") ordenada.sort((a, b) => b.comissaoPercentual - a.comissaoPercentual);
    if (ordem === "preco") ordenada.sort((a, b) => b.preco - a.preco);
    if (ordem === "produto") ordenada.sort((a, b) => a.produto.localeCompare(b.produto));
    return ordenada;
  }, [dados.linhas, busca, tipo, ordem]);

  const faixa = (min: number, max: number) =>
    Math.abs(max - min) < 0.0005
      ? formatPercentual(min)
      : `${formatPercentual(min)} a ${formatPercentual(max)}`;

  if (dados.linhas.length === 0) {
    return (
      <Painel titulo="Tarifas" descricao="Comissão, custo fixo e frete de cada anúncio">
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          Nenhum anúncio desta conta ainda. Sincronize a conta para trazer as tarifas.
        </p>
      </Painel>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tipos.map((t) => {
          const r = dados.porTipo.get(t)!;
          return (
            <CardKpi
              key={t}
              titulo={`Comissão ${t}`}
              valor={faixa(r.min, r.max)}
              detalhe={`${formatNumero(r.qtd)} anúncio${r.qtd === 1 ? "" : "s"} · varia pela categoria`}
            />
          );
        })}
        <CardKpi
          titulo="Com custo fixo"
          valor={`${formatNumero(dados.comFixo.length)} anúncio${dados.comFixo.length === 1 ? "" : "s"}`}
          detalhe="Cobrado por unidade em produtos baratos"
        />
        <CardKpi
          titulo="Frete médio pago por você"
          valor={dados.freteGeral === null ? "—" : formatBRL(dados.freteGeral)}
          detalhe={`Por unidade, nas vendas dos últimos ${DIAS_FRETE} dias`}
        />
      </div>

      <Painel
        titulo="Tarifas de cada anúncio"
        descricao="O que o canal cobra hoje, pelo preço atual de cada anúncio — antes do custo do produto e dos impostos"
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por produto ou SKU"
            className="h-8 max-w-xs text-xs"
          />
          {["todos", ...tipos].map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-medium",
                tipo === t ? "border-brand bg-brand-soft text-brand" : "text-muted-foreground",
              )}
            >
              {t === "todos" ? "Todos" : t}
            </button>
          ))}
          <select
            value={ordem}
            onChange={(e) => setOrdem(e.target.value as Ordem)}
            className="ml-auto h-8 rounded-md border bg-background px-2 text-[11px]"
          >
            <option value="total">Maior tarifa total (%)</option>
            <option value="comissao">Maior comissão</option>
            <option value="preco">Maior preço</option>
            <option value="produto">Nome do produto</option>
          </select>
        </div>
        <div className="w-full">
          <table className="w-full text-left">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-2 py-2 font-medium">Produto</th>
                <th className="px-2 py-2 font-medium">Tipo</th>
                <th className="px-2 py-2 text-right font-medium">Preço</th>
                <th className="px-2 py-2 text-right font-medium">Comissão</th>
                <th className="px-2 py-2 text-right font-medium">Custo fixo</th>
                <th className="px-2 py-2 text-right font-medium">Frete médio</th>
                <th className="px-2 py-2 text-right font-medium">Total por unidade</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.slice(0, 300).map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="max-w-[280px] px-2 py-2.5">
                    <p className="truncate text-xs font-medium">{l.produto}</p>
                    <p className="num text-[10px] text-muted-foreground">{l.sku}</p>
                  </td>
                  <td className="px-2 py-2.5 text-xs">{l.tipo}</td>
                  <td className="num px-2 py-2.5 text-right text-xs">{formatBRL(l.preco)}</td>
                  <td className="num px-2 py-2.5 text-right text-xs">
                    {formatPercentual(l.comissaoPercentual)}
                    <span className="block text-[10px] text-muted-foreground">
                      {formatBRL(l.comissaoValor)}
                    </span>
                  </td>
                  <td className="num px-2 py-2.5 text-right text-xs">
                    {l.custoFixo > 0 ? formatBRL(l.custoFixo) : "—"}
                  </td>
                  <td className="num px-2 py-2.5 text-right text-xs">
                    {l.freteMedio === null ? (
                      <span className="text-muted-foreground">sem venda</span>
                    ) : (
                      formatBRL(l.freteMedio)
                    )}
                  </td>
                  <td className="num px-2 py-2.5 text-right text-xs font-semibold">
                    {formatBRL(l.total)}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {formatPercentual(l.totalPercentual)} do preço
                    </span>
                  </td>
                </tr>
              ))}
              {filtradas.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-2 py-10 text-center text-xs text-muted-foreground">
                    Nenhum anúncio neste filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtradas.length > 300 && (
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            Mostrando 300 de {formatNumero(filtradas.length)} anúncios — use a busca para achar os outros.
          </p>
        )}
        <p className="border-t px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          A comissão muda conforme o tipo do anúncio e a categoria do produto. O custo fixo só existe
          em produtos baratos e varia pela faixa de preço. O frete é a média que você pagou nas
          vendas recentes deste SKU. Os valores são os de hoje: se você mudar o preço ou o tipo do
          anúncio, a tarifa muda junto.
        </p>
      </Painel>
    </div>
  );
}
