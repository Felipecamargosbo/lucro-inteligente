// Janela de ficha do produto — a mesma no Criativo e no SAC. As duas telas
// salvam no mesmo lugar (tabela fichas_anuncio), uma ficha por SKU.

import { useEffect, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/** O produto que está com a ficha aberta. null = janela fechada. */
export interface AlvoFicha {
  sku: string;
  produto: string;
}

export function ModalFicha({
  alvo,
  textoAtual,
  aoFechar,
  aoSalvar,
}: {
  alvo: AlvoFicha | null;
  /** A ficha que já está salva pra esse SKU ("" se ainda não tem) */
  textoAtual: string;
  aoFechar: () => void;
  /** Devolve true se salvou — aí a janela fecha sozinha */
  aoSalvar: (sku: string, texto: string) => Promise<boolean>;
}) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Sempre que abrir pra outro produto, começa com a ficha dele.
  useEffect(() => {
    if (alvo) setTexto(textoAtual);
  }, [alvo, textoAtual]);

  const salvar = async () => {
    if (!alvo) return;
    setSalvando(true);
    const ok = await aoSalvar(alvo.sku, texto);
    setSalvando(false);
    if (ok) aoFechar();
  };

  return (
    <Dialog open={alvo !== null} onOpenChange={(aberto) => !aberto && aoFechar()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <FileText className="size-4 text-brand" />
            Ficha do produto
          </DialogTitle>
          <DialogDescription className="text-xs">
            {alvo?.produto} <span className="num">· {alvo?.sku}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Cole aqui a descrição completa do produto: medidas, voltagem, compatibilidade,
            material, o que vem na caixa, garantia. O SAC usa esse texto pra responder cliente e o
            Criativo pra escrever o anúncio — nenhum dos dois inventa o que não estiver aqui.
          </p>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: Tela de 1,43 polegada, compatível com Android 8+ e iOS 13+, bateria de até 7 dias, resistência à água IP68. Na caixa: relógio, cabo magnético e manual."
            className="min-h-56 text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            {texto.trim().length} caracteres · a IA lê até 3.000. Salvar em branco apaga a ficha.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={aoFechar} className="text-xs">
            Cancelar
          </Button>
          <Button size="sm" onClick={salvar} disabled={salvando} className="text-xs">
            {salvando && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Salvar ficha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
