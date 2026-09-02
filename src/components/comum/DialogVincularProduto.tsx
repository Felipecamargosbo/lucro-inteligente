import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { produtosService } from "@/services";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SeloMarketplace } from "@/components/comum/Indicadores";
import type { Anuncio, Produto } from "@/types";

/**
 * Vincula um anúncio pendente a um produto do catálogo — por busca (SKU, EAN
 * ou nome) — ou cria um produto novo a partir do próprio anúncio quando ele
 * ainda não existe no catálogo. Uma vez vinculado, o CMV passa a vir do
 * catálogo e some da fila de Pendências. Usado tanto na aba Pendências de
 * cada conta quanto no Catálogo (onde reúne pendências de todo marketplace).
 */
export function DialogVincularProduto({
  anuncio,
  aoFechar,
  aoConcluir,
}: {
  anuncio: Anuncio;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [busca, setBusca] = useState(anuncio.sku);
  const [cmvNovoProduto, setCmvNovoProduto] = useState("");

  const resultados = useMemo<Produto[]>(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return [];
    return produtosService
      .listar()
      .filter(
        (p) =>
          p.sku.toLowerCase().includes(termo) ||
          p.nome.toLowerCase().includes(termo) ||
          (p.ean ?? "").includes(termo),
      )
      .slice(0, 8);
  }, [busca]);

  const vincularA = (produto: Produto) => {
    produtosService.vincular(anuncio.id, produto.id);
    toast.success(`Anúncio vinculado a "${produto.nome}" — CMV agora vem do catálogo.`);
    aoConcluir();
  };

  const criarNovo = () => {
    const cmv = Number(cmvNovoProduto.replace(",", ".")) || 0;
    const produto = produtosService.criarAPartirDeAnuncio(anuncio.id, { cmv });
    if (produto) {
      toast.success(`Produto "${produto.nome}" criado e vinculado.`);
      aoConcluir();
    }
  };

  return (
    <Dialog open onOpenChange={aoFechar}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Vincular a um produto</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <SeloMarketplace id={anuncio.marketplaceId} />
            {anuncio.produto} · SKU {anuncio.sku}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">
              Buscar produto existente por SKU, EAN ou nome
            </Label>
            <div className="relative mt-1">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8"
                placeholder="SKU, EAN ou nome do produto"
              />
            </div>
          </div>

          <div className="max-h-56 space-y-1 overflow-y-auto">
            {resultados.length === 0 && (
              <p className="rounded-lg bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                Nenhum produto encontrado no catálogo com esse termo.
              </p>
            )}
            {resultados.map((p) => (
              <button
                key={p.id}
                onClick={() => vincularA(p)}
                className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs transition-colors hover:bg-muted"
              >
                <span>
                  <span className="block font-medium">{p.nome}</span>
                  <span className="num block text-[10px] text-muted-foreground">
                    SKU {p.sku}
                    {p.ean ? ` · EAN ${p.ean}` : ""}
                  </span>
                </span>
                <span className="num text-[11px] font-semibold">{formatBRL(p.cmv)}</span>
              </button>
            ))}
          </div>

          <div className="border-t pt-4">
            <p className="text-[11px] font-medium text-muted-foreground">
              Não existe ainda? Crie um produto a partir deste anúncio
            </p>
            <div className="mt-2 flex items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs text-muted-foreground">CMV inicial (R$)</Label>
                <Input
                  inputMode="decimal"
                  value={cmvNovoProduto}
                  onChange={(e) => setCmvNovoProduto(e.target.value)}
                  placeholder="0,00"
                  className="mt-1"
                />
              </div>
              <Button variant="outline" onClick={criarNovo}>
                Criar produto
              </Button>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            No protótipo o catálogo é fictício e vive apenas nesta sessão.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
