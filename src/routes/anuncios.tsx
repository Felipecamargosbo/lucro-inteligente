import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { anunciosService } from "@/services";
import { MARKETPLACES, USUARIO_ATUAL } from "@/data/mock";
import { resultadoAnuncio } from "@/lib/finance";
import { formatBRL, formatDataHora, formatPercentual } from "@/lib/format";
import { Painel, SeloMargem, SeloMarketplace } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AlteracaoPreco, Anuncio } from "@/types";

export const Route = createFileRoute("/anuncios")({
  head: () => ({
    meta: [
      { title: "Anúncios e precificação | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "Administre os anúncios, veja lucro estimado e margem do preço atual e registre alterações de preço.",
      },
      { property: "og:title", content: "Anúncios e precificação | NEXO Rentabilidade" },
      {
        property: "og:description",
        content: "Preço atual, custos e margem de cada anúncio, com histórico de alterações.",
      },
    ],
  }),
  component: Anuncios,
});

function Anuncios() {
  const [marketplace, setMarketplace] = useState("todos");
  const [busca, setBusca] = useState("");
  const [emEdicao, setEmEdicao] = useState<Anuncio | null>(null);
  const [historico, setHistorico] = useState<AlteracaoPreco[]>(
    anunciosService.historicoPrecos(),
  );
  const [precos, setPrecos] = useState<Record<string, number>>({});

  const anuncios = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return anunciosService.listar().filter((a) => {
      if (marketplace !== "todos" && a.marketplaceId !== marketplace) return false;
      if (termo && ![a.sku, a.produto].some((c) => c.toLowerCase().includes(termo)))
        return false;
      return true;
    });
  }, [marketplace, busca]);

  const precoDe = (a: Anuncio) => precos[a.id] ?? a.precoAtual;

  const salvarPreco = (anuncio: Anuncio, novoPreco: number) => {
    const anterior = precoDe(anuncio);
    setPrecos((p) => ({ ...p, [anuncio.id]: novoPreco }));
    setHistorico((h) => [
      {
        id: `hp-${Date.now()}`,
        data: new Date().toISOString(),
        sku: anuncio.sku,
        produto: anuncio.produto,
        marketplaceId: anuncio.marketplaceId,
        precoAnterior: anterior,
        precoNovo: novoPreco,
        usuario: USUARIO_ATUAL.nome,
      },
      ...h,
    ]);
    setEmEdicao(null);
    toast.success("Preço atualizado no protótipo e registrado no histórico.");
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <Painel
        titulo="Anúncios"
        descricao="Analise o preço atual de cada anúncio e o lucro que ele gera hoje"
        acoes={
          <ExportarDados
            nomeArquivo="anuncios"
            linhas={anuncios.map((a) => {
              const r = resultadoAnuncio(a, precoDe(a));
              return {
                Marketplace: a.marketplaceId,
                SKU: a.sku,
                Produto: a.produto,
                "Preço atual": r.precoVenda.toFixed(2),
                CMV: r.cmv.toFixed(2),
                Imposto: r.impostos.toFixed(2),
                Comissão: r.comissao.toFixed(2),
                Taxas: r.taxaFixa.toFixed(2),
                "Lucro estimado": r.lucroLiquido.toFixed(2),
                Margem: formatPercentual(r.margem),
                Status: a.status,
              };
            })}
          />
        }
      >
        <div className="grid gap-3 border-b p-4 md:grid-cols-3">
          <Input
            placeholder="Buscar por SKU ou produto"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="md:col-span-2"
          />
          <Select value={marketplace} onValueChange={setMarketplace}>
            <SelectTrigger>
              <SelectValue placeholder="Marketplace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os marketplaces</SelectItem>
              {MARKETPLACES.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-bold">Canal</th>
                <th className="px-4 py-3 font-bold">Produto / SKU</th>
                <th className="px-4 py-3 text-right font-bold">Preço atual</th>
                <th className="px-4 py-3 text-right font-bold">CMV</th>
                <th className="px-4 py-3 text-right font-bold">Imposto</th>
                <th className="px-4 py-3 text-right font-bold">Comissão</th>
                <th className="px-4 py-3 text-right font-bold">Taxas</th>
                <th className="px-4 py-3 text-right font-bold">Lucro estimado</th>
                <th className="px-4 py-3 text-center font-bold">Margem</th>
                <th className="px-4 py-3 font-bold">Status</th>
                <th className="px-4 py-3 text-right font-bold">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {anuncios.map((a) => {
                const r = resultadoAnuncio(a, precoDe(a));
                return (
                  <tr key={a.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-4 py-3">
                      <SeloMarketplace id={a.marketplaceId} />
                    </td>
                    <td className="max-w-[260px] px-4 py-3">
                      <p className="truncate text-xs font-medium">{a.produto}</p>
                      <p className="num text-[10px] text-muted-foreground">{a.sku}</p>
                    </td>
                    <td className="num px-4 py-3 text-right text-xs font-semibold">
                      {formatBRL(r.precoVenda)}
                    </td>
                    <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                      {formatBRL(r.cmv)}
                    </td>
                    <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                      {formatBRL(r.impostos)}
                    </td>
                    <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                      {formatBRL(r.comissao)}
                    </td>
                    <td className="num px-4 py-3 text-right text-xs text-muted-foreground">
                      {formatBRL(r.taxaFixa)}
                    </td>
                    <td
                      className={`num px-4 py-3 text-right text-xs font-bold ${
                        r.lucroLiquido >= 0 ? "text-profit" : "text-loss"
                      }`}
                    >
                      {formatBRL(r.lucroLiquido)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <SeloMargem margem={r.margem} />
                        {a.elegivelPromocao && (
                          <span className="rounded bg-brand-soft px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-brand">
                            Disponível
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[11px] capitalize">
                      {a.status.replace("-", " ")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setEmEdicao(a)}>
                        Alterar preço
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Painel>

      <Painel
        titulo="Histórico de preços"
        descricao="Toda alteração guarda preço anterior, preço novo, data, hora e usuário"
      >
        <div className="divide-y">
          {historico.map((h) => (
            <div key={h.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-xs font-medium">{h.produto}</p>
                <p className="num text-[10px] text-muted-foreground">
                  {h.sku} · {formatDataHora(h.data)} · {h.usuario}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <SeloMarketplace id={h.marketplaceId} />
                <span className="num text-xs text-muted-foreground line-through">
                  {formatBRL(h.precoAnterior)}
                </span>
                <span className="num text-xs font-bold text-foreground">
                  → {formatBRL(h.precoNovo)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Painel>

      {emEdicao && (
        <DialogPreco
          anuncio={emEdicao}
          precoAtual={precoDe(emEdicao)}
          aoFechar={() => setEmEdicao(null)}
          aoSalvar={salvarPreco}
        />
      )}
    </div>
  );
}

function DialogPreco({
  anuncio,
  precoAtual,
  aoFechar,
  aoSalvar,
}: {
  anuncio: Anuncio;
  precoAtual: number;
  aoFechar: () => void;
  aoSalvar: (a: Anuncio, preco: number) => void;
}) {
  const [valor, setValor] = useState(precoAtual.toFixed(2));
  const novoPreco = Number(valor.replace(",", ".")) || 0;
  const resultado = resultadoAnuncio(anuncio, novoPreco);

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar preço</DialogTitle>
          <DialogDescription>
            {anuncio.produto} · SKU {anuncio.sku}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Preço anterior</Label>
              <p className="num mt-1 text-sm font-semibold">{formatBRL(precoAtual)}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Novo preço (R$)</Label>
              <Input
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="rounded-xl border p-4 text-xs">
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Lucro estimado</span>
              <span
                className={`num font-bold ${
                  resultado.lucroLiquido >= 0 ? "text-profit" : "text-loss"
                }`}
              >
                {formatBRL(resultado.lucroLiquido)}
              </span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-muted-foreground">Margem</span>
              <span className="num font-bold">{formatPercentual(resultado.margem)}</span>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            No protótipo a alteração fica salva apenas nesta sessão e é registrada no histórico.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={() => aoSalvar(anuncio, novoPreco)}>Salvar preço</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
