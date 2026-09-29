// Janela de "Informações extras" do produto — a mesma no Criativo e no SAC.
// O principal vem do anúncio publicado (puxado do marketplace); aqui o
// seller só completa ou corrige. As duas telas salvam no mesmo lugar
// (tabela fichas_anuncio), um texto por SKU.

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
import type { ConteudoPublicado } from "@/types";

/** O produto que está com a janela aberta. null = janela fechada. */
export interface AlvoFicha {
  sku: string;
  produto: string;
}

export function ModalFicha({
  alvo,
  textoAtual,
  publicado,
  aoFechar,
  aoSalvar,
}: {
  alvo: AlvoFicha | null;
  /** As informações extras já salvas pra esse SKU ("" se ainda não tem) */
  textoAtual: string;
  /** O anúncio como está publicado — mostrado só pra consulta */
  publicado: ConteudoPublicado | null;
  aoFechar: () => void;
  /** Devolve true se salvou — aí a janela fecha sozinha */
  aoSalvar: (sku: string, texto: string) => Promise<boolean>;
}) {
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Sempre que abrir pra outro produto, começa com o texto dele.
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <FileText className="size-4 text-brand" />
            Informações extras do produto
          </DialogTitle>
          <DialogDescription className="text-xs">
            {alvo?.produto} <span className="num">· {alvo?.sku}</span>
          </DialogDescription>
        </DialogHeader>

        {publicado ? (
          <div className="space-y-2 rounded-md bg-muted/40 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              O que já vem do anúncio {publicado.origem === "exemplo" && "(exemplo fictício até a API conectar)"}
            </p>
            <p className="text-[11px] leading-relaxed">{publicado.descricao}</p>
            {publicado.atributos.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                {publicado.atributos.map((a) => `${a.nome}: ${a.valor}`).join(" · ")}
              </p>
            )}
          </div>
        ) : (
          <p className="rounded-md bg-warning-soft px-3 py-2 text-[11px] text-warning">
            Ainda não temos o anúncio publicado deste produto. Até a API conectar, o que você escrever
            aqui é tudo o que a IA sabe sobre ele.
          </p>
        )}

        <div className="space-y-2">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Opcional. Escreva só o que o anúncio não diz ou diz errado — por exemplo "serve também
            no modelo X", "a cor real é um pouco mais escura que a foto", "usa 1 pilha AA, que vem
            junto". Se contradisser o anúncio, a IA segue o que você escreveu aqui.
          </p>
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: Funciona com Windows, Mac e Linux. Usa 1 pilha AA (vem junto)."
            className="min-h-36 text-xs"
          />
          <p className="text-[10px] text-muted-foreground">
            {texto.trim().length} caracteres. Salvar em branco apaga as informações extras.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={aoFechar} className="text-xs">
            Cancelar
          </Button>
          <Button size="sm" onClick={salvar} disabled={salvando} className="text-xs">
            {salvando && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
