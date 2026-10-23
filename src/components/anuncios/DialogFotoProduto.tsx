import { useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Upload } from "lucide-react";
import { produtosService } from "@/services";
import { useAuth } from "@/context/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { CANAIS } from "@/config/navegacao";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Anuncio, MarketplaceId, Produto } from "@/types";

/**
 * Foto de um produto: escolher a de um anúncio vinculado, enviar uma imagem
 * do computador (clicando ou arrastando) ou voltar para a automática.
 */
export function DialogFotoProduto({
  produto,
  anuncios,
  canais,
  aoFechar,
  aoConcluir,
}: {
  produto: Produto;
  anuncios: Anuncio[];
  /** Canais conectados (ou com anúncio), na ordem do menu. */
  canais: MarketplaceId[];
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const { sessao } = useAuth();
  const [salvando, setSalvando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  // Fotos por canal: cada canal conectado aparece, com as fotos dos anúncios
  // dele (mesma foto repetida aparece uma vez só).
  const porCanal = canais.map((c) => {
    const urls: { id: string; url: string; titulo: string }[] = [];
    for (const a of anuncios) {
      if (a.marketplaceId !== c || !a.fotoUrl || urls.some((u) => u.url === a.fotoUrl)) continue;
      urls.push({ id: a.id, url: a.fotoUrl, titulo: a.produto });
    }
    return { canal: c, urls };
  });

  const usar = async (url: string | null) => {
    setSalvando(true);
    const erro = await produtosService.definirFotos([{ id: produto.id, foto: url }]);
    setSalvando(false);
    if (erro) {
      toast.error(`Não consegui gravar a foto: ${erro}`);
      return;
    }
    toast.success(url ? "Foto trocada." : "Foto volta a vir do anúncio.");
    aoConcluir();
  };

  const enviar = async (arquivo: File | undefined) => {
    if (!arquivo || !sessao) return;
    setSalvando(true);
    const { erro } = await produtosService.enviarFoto(sessao.user.id, produto.id, arquivo);
    setSalvando(false);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success("Foto enviada.");
    aoConcluir();
  };

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    enviar(e.dataTransfer.files?.[0]);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-lg grid-cols-[minmax(0,1fr)]">
        <DialogHeader>
          <DialogTitle>Foto do produto</DialogTitle>
          <DialogDescription className="line-clamp-2">
            {produto.nome} · SKU {produto.sku}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-xs font-semibold">Escolha a foto de capa</p>
          {porCanal.map(({ canal, urls }) => (
            <div key={canal} className="space-y-1.5">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <LogoMarketplace id={canal} tamanho="xs" />
                {CANAIS.find((c) => c.id === canal)?.titulo ?? canal}
              </p>
              {urls.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {urls.map((u) => {
                    const atual = produto.fotoUrl === u.url;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        disabled={salvando}
                        onClick={() => usar(u.url)}
                        className={cn(
                          "relative rounded-lg border p-1 transition-colors hover:border-brand",
                          atual && "border-brand ring-2 ring-brand/30",
                        )}
                        title={u.titulo}
                      >
                        <img src={u.url} alt="" className="size-20 rounded-md bg-white object-contain" />
                        {atual && (
                          <span className="absolute left-1.5 top-1.5 rounded bg-brand px-1 text-[9px] font-bold text-brand-foreground">
                            CAPA
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Sem anúncio com foto neste canal.</p>
              )}
            </div>
          ))}
        </div>

        <label
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={soltar}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center text-xs transition-colors",
            arrastando ? "border-brand bg-brand/5" : "hover:border-brand/60",
          )}
        >
          {salvando ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5 text-muted-foreground" />}
          <span className="font-semibold">Arraste uma imagem aqui ou clique para escolher</span>
          <span className="text-muted-foreground">JPG, PNG ou WEBP, até 5 MB</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            disabled={salvando}
            onChange={(e) => {
              enviar(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>

        {produto.fotoUrl && (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" className="text-xs" disabled={salvando} onClick={() => usar(null)}>
              <RotateCcw className="size-3.5" />
              Voltar para a foto automática
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
