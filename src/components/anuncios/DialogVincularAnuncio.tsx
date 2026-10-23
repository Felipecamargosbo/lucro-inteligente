import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Search, Unlink } from "lucide-react";
import { produtosService } from "@/services";
import { useAuth } from "@/context/auth";
import { formatBRL } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Anuncio, Produto } from "@/types";

/**
 * Liga um anúncio a um produto do catálogo quando o SKU não bate (ou troca o
 * produto). A escolha fica gravada no anúncio (anuncios.produto_id) e vale
 * mais que o SKU, mesmo depois das sincronizações.
 */
export function DialogVincularAnuncio({
  anuncio,
  produtos,
  produtoAtual,
  aoFechar,
  aoConcluir,
}: {
  anuncio: Anuncio;
  produtos: Produto[];
  produtoAtual: Produto | null;
  aoFechar: () => void;
  /** `true` quando um produto novo foi criado (a lista precisa recarregar). */
  aoConcluir: (criouProduto: boolean) => void;
}) {
  const { sessao } = useAuth();
  const [busca, setBusca] = useState("");
  const [salvando, setSalvando] = useState(false);

  const encontrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const lista = t
      ? produtos.filter((p) => p.sku.toLowerCase().includes(t) || p.nome.toLowerCase().includes(t) || (p.ean ?? "").includes(t))
      : produtos;
    return lista.slice(0, 60);
  }, [produtos, busca]);

  const skuJaExiste = produtos.some((p) => p.sku.trim().toUpperCase() === anuncio.sku.trim().toUpperCase());

  const ligar = async (p: Produto | null) => {
    setSalvando(true);
    const erro = await produtosService.vincularNoBanco(anuncio.id, p);
    setSalvando(false);
    if (erro) {
      toast.error(`Não consegui gravar o vínculo: ${erro}`);
      return;
    }
    toast.success(p ? `Anúncio vinculado a "${p.nome}".` : "Vínculo manual removido — volta a valer o SKU.");
    aoConcluir(false);
  };

  const criar = async () => {
    if (!sessao) return;
    setSalvando(true);
    const { produto, erro } = await produtosService.criar(sessao.user.id, {
      sku: anuncio.sku.trim(),
      nome: anuncio.produto,
      cmv: 0,
    });
    setSalvando(false);
    if (erro || !produto) {
      toast.error(erro ?? "Não consegui criar o produto.");
      return;
    }
    toast.success(`Produto "${produto.nome}" criado. Lembre de colocar o CMV na Precificação.`);
    aoConcluir(true);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-lg grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>Vincular anúncio a um produto</DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <LogoMarketplace id={anuncio.marketplaceId} tamanho="xs" />
            <span className="truncate">{anuncio.produto}</span>
            <span className="num shrink-0">· SKU {anuncio.sku}</span>
          </DialogDescription>
        </DialogHeader>

        {produtoAtual && (
          <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs">
            <span className="min-w-0 truncate">
              Hoje: <strong>{produtoAtual.nome}</strong>{" "}
              <span className="text-muted-foreground">({anuncio.produtoIdBanco ? "escolhido à mão" : "pelo SKU"})</span>
            </span>
            {anuncio.produtoIdBanco && (
              <Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" disabled={salvando} onClick={() => ligar(null)}>
                <Unlink className="size-3" />
                Remover
              </Button>
            )}
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar produto por SKU, nome ou EAN..."
            className="h-8 pl-8 text-xs"
          />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {encontrados.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={salvando}
              onClick={() => ligar(p)}
              className="flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors hover:border-brand hover:bg-brand/5 disabled:opacity-50"
            >
              <span className="min-w-0 flex-1 truncate">{p.nome}</span>
              <span className="num shrink-0 text-[10px] text-muted-foreground">{p.sku}</span>
              <span className="num w-20 shrink-0 text-right text-[10px]">{p.cmv > 0 ? formatBRL(p.cmv) : "sem CMV"}</span>
            </button>
          ))}
          {encontrados.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">Nenhum produto encontrado.</p>
          )}
        </div>

        {!skuJaExiste && (
          <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs">
            <span className="text-muted-foreground">Não está no catálogo? Crie o produto com o SKU deste anúncio.</span>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={salvando} onClick={criar}>
              {salvando ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
              Criar produto
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
