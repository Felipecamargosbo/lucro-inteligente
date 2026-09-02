import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Package, Pencil } from "lucide-react";
import { anunciosService, produtosService } from "@/services";
import { formatBRL, formatNumero } from "@/lib/format";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { ExportarDados } from "@/components/comum/ExportarDados";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Produto } from "@/types";

export const Route = createFileRoute("/produtos")({
  head: () => ({
    meta: [
      { title: "Catálogo | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "O CMV de cada produto, cadastrado uma vez só e válido em todo marketplace vinculado.",
      },
      { property: "og:title", content: "Catálogo | NEXO Rentabilidade" },
      {
        property: "og:description",
        content: "Custo do produto cadastrado uma vez, refletido em todo anúncio vinculado.",
      },
    ],
  }),
  component: Produtos,
});

function Produtos() {
  const [busca, setBusca] = useState("");
  const [editando, setEditando] = useState<string | null>(null);
  const [valorEdicao, setValorEdicao] = useState("");
  // O catálogo vive num array fora do React (src/data/mock.ts); este
  // contador força a releitura depois de cada alteração de CMV.
  const [tick, setTick] = useState(0);

  const anuncios = useMemo(() => anunciosService.listar(), [tick]);

  const produtos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return produtosService
      .listar()
      .filter(
        (p) =>
          !termo ||
          p.sku.toLowerCase().includes(termo) ||
          p.nome.toLowerCase().includes(termo) ||
          (p.ean ?? "").includes(termo),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca, tick]);

  const vinculosDoProduto = (produtoId: string) => {
    const vinculados = anuncios.filter((a) => a.produtoId === produtoId);
    const marketplaces = [...new Set(vinculados.map((a) => a.marketplaceId))];
    return { totalAnuncios: vinculados.length, marketplaces };
  };

  const totalAnuncios = anuncios.length;
  const semVinculo = anuncios.filter((a) => !a.produtoId).length;

  const iniciarEdicao = (produto: Produto) => {
    setEditando(produto.id);
    setValorEdicao(produto.cmv.toFixed(2));
  };

  const salvarCmv = (produto: Produto) => {
    const novoCmv = Number(valorEdicao.replace(",", ".")) || 0;
    produtosService.atualizarCmv(produto.id, novoCmv);
    setEditando(null);
    setTick((n) => n + 1);
    const { totalAnuncios: qtd } = vinculosDoProduto(produto.id);
    toast.success(
      qtd > 0
        ? `CMV de "${produto.nome}" atualizado — refletido em ${qtd} anúncio(s) vinculado(s).`
        : `CMV de "${produto.nome}" atualizado.`,
    );
  };

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <Painel
        titulo="Catálogo"
        descricao="O CMV mora aqui — uma vez só. Mudar o custo de um produto atualiza na hora todo anúncio vinculado a ele, em qualquer marketplace"
        acoes={
          <ExportarDados
            nomeArquivo="catalogo"
            linhas={produtos.map((p) => {
              const { totalAnuncios: qtd, marketplaces } = vinculosDoProduto(p.id);
              return {
                SKU: p.sku,
                EAN: p.ean ?? "—",
                Produto: p.nome,
                CMV: p.cmv.toFixed(2),
                "Anúncios vinculados": qtd,
                Marketplaces: marketplaces.join(", ") || "—",
              };
            })}
          />
        }
      >
        <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Produtos no catálogo
            </p>
            <p className="num text-lg font-bold">{formatNumero(produtosService.listar().length)}</p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Anúncios vinculados a um produto
            </p>
            <p className="num text-lg font-bold">
              {formatNumero(totalAnuncios - semVinculo)} de {formatNumero(totalAnuncios)}
            </p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Anúncios sem vínculo
            </p>
            <p className={`num text-lg font-bold ${semVinculo > 0 ? "text-loss" : ""}`}>
              {formatNumero(semVinculo)}
            </p>
          </div>
        </div>

        <div className="border-b p-4">
          <Input
            placeholder="Buscar por SKU, EAN ou nome do produto"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="max-w-md"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead>
              <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-bold">Produto</th>
                <th className="px-4 py-3 font-bold">SKU</th>
                <th className="px-4 py-3 font-bold">EAN</th>
                <th className="px-4 py-3 text-right font-bold">CMV</th>
                <th className="px-4 py-3 font-bold">Vinculado em</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {produtos.map((p) => {
                const { totalAnuncios: qtd, marketplaces } = vinculosDoProduto(p.id);
                const emEdicao = editando === p.id;
                return (
                  <tr key={p.id} className="transition-colors hover:bg-muted/40">
                    <td className="max-w-[260px] px-4 py-3">
                      <p className="truncate text-xs font-medium">{p.nome}</p>
                    </td>
                    <td className="num px-4 py-3 text-xs text-muted-foreground">{p.sku}</td>
                    <td className="num px-4 py-3 text-xs text-muted-foreground">
                      {p.ean ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {emEdicao ? (
                        <div className="flex items-center justify-end gap-1">
                          <Input
                            autoFocus
                            inputMode="decimal"
                            value={valorEdicao}
                            onChange={(e) => setValorEdicao(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && salvarCmv(p)}
                            className="num h-7 w-24 px-2 text-right text-xs"
                          />
                          <button
                            onClick={() => salvarCmv(p)}
                            title="Salvar CMV"
                            className="text-profit transition-colors hover:text-profit/80"
                          >
                            <Check className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => iniciarEdicao(p)}
                          className="num inline-flex items-center gap-1.5 text-xs font-semibold transition-colors hover:text-brand"
                        >
                          {formatBRL(p.cmv)}
                          <Pencil className="size-3" />
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {qtd > 0 ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {marketplaces.map((m) => (
                            <SeloMarketplace key={m} id={m} />
                          ))}
                          <span className="text-[10px] text-muted-foreground">
                            ({formatNumero(qtd)} anúncio{qtd > 1 ? "s" : ""})
                          </span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground">
                          <Package className="size-3" />
                          Nenhum anúncio vinculado ainda
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {produtos.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-xs text-muted-foreground">
                    Nenhum produto encontrado com esse termo.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Painel>

      {semVinculo > 0 && (
        <p className="rounded-xl bg-muted px-4 py-3 text-[11px] text-muted-foreground">
          {formatNumero(semVinculo)} anúncio(s) ainda sem vínculo com um produto do catálogo. Para
          vinculá-los (ou criar um produto novo a partir deles), acesse{" "}
          <strong>Marketplaces → a conta → aba Pendências</strong>.
        </p>
      )}
    </div>
  );
}
