import { useState, type DragEvent } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Upload } from "lucide-react";
import { produtosService } from "@/services";
import { useAuth } from "@/context/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
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
 * Foto de um produto: escolher a de um anúncio vinculado, enviar uma imagem
 * do computador (clicando ou arrastando) ou voltar para a automática.
 */
export function DialogFotoProduto({
  produto,
  anuncios,
  aoFechar,
  aoConcluir,
}: {
  produto: Produto;
  anuncios: Anuncio[];
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const { sessao } = useAuth();
  const [salvando, setSalvando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const comFoto = anuncios.filter((a) => a.fotoUrl);
  // Mesma foto em dois anúncios aparece uma vez só.
  const opcoes = comFoto.filter((a, i) => comFoto.findIndex((b) => b.fotoUrl === a.fotoUrl) === i);

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

        {opcoes.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold">Usar a foto de um anúncio</p>
            <div className="flex flex-wrap gap-2">
              {opcoes.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  disabled={salvando}
                  onClick={() => usar(a.fotoUrl ?? null)}
                  className={cn(
                    "relative rounded-lg border p-1 transition-colors hover:border-brand",
                    produto.fotoUrl === a.fotoUrl && "border-brand ring-2 ring-brand/30",
                  )}
                  title={a.produto}
                >
                  <img src={a.fotoUrl ?? ""} alt="" className="size-20 rounded-md bg-white object-contain" />
                  <span className="absolute bottom-1.5 right-1.5">
                    <LogoMarketplace id={a.marketplaceId} tamanho="xs" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

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
