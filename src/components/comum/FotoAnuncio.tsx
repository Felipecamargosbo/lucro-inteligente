import { anunciosService } from "@/services";
import { cn } from "@/lib/utils";

/** Foto do anúncio no canal (procura pelo id do anúncio ou, na falta, pelo SKU). */
export function FotoAnuncio({
  anuncioId,
  sku,
  className,
}: {
  anuncioId?: string | null;
  sku?: string | null;
  className?: string;
}) {
  let url: string | null | undefined = null;
  if (anuncioId) url = anunciosService.buscarPorId(anuncioId)?.fotoUrl;
  if (!url && sku) url = anunciosService.listar().find((a) => a.sku === sku && a.fotoUrl)?.fotoUrl;
  const base = "size-9 shrink-0 rounded-md border bg-white object-contain";
  if (!url) return <div className={cn(base, "bg-muted/40", className)} aria-hidden />;
  return <img src={url} alt="" loading="lazy" className={cn(base, className)} />;
}
