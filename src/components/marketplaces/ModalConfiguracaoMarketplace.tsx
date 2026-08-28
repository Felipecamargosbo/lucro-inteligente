import { useEffect, useState } from "react";
import { KeyRound, Settings2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Marketplace } from "@/types";

export interface DadosConfiguracaoMarketplace {
  comissaoPercentual: number;
  taxaFixa: number;
  freteMedio: number;
}

export function ModalConfiguracaoMarketplace({
  marketplace,
  onFechar,
  onSalvar,
}: {
  marketplace: Marketplace | null;
  onFechar: () => void;
  onSalvar: (marketplace: Marketplace, dados: DadosConfiguracaoMarketplace) => void;
}) {
  const [apiKey, setApiKey] = useState("");
  const [comissao, setComissao] = useState("0");
  const [taxaFixa, setTaxaFixa] = useState("0");
  const [freteMedio, setFreteMedio] = useState("0");

  // Recarrega os campos sempre que um marketplace diferente é aberto.
  useEffect(() => {
    if (!marketplace) return;
    setApiKey("••••••••••••••••");
    setComissao(String(Math.round(marketplace.comissaoPercentual * 1000) / 10));
    setTaxaFixa(String(marketplace.taxaFixa));
    setFreteMedio(String(marketplace.freteMedio));
  }, [marketplace]);

  const salvar = () => {
    if (!marketplace) return;
    onSalvar(marketplace, {
      comissaoPercentual: (Number(comissao) || 0) / 100,
      taxaFixa: Number(taxaFixa) || 0,
      freteMedio: Number(freteMedio) || 0,
    });
  };

  return (
    <Dialog open={!!marketplace} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-md">
        {marketplace && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="size-4 text-brand" />
                {marketplace.nome}
              </DialogTitle>
              <DialogDescription>
                Regras usadas nos cálculos de lucro para este canal.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="api-key" className="flex items-center gap-1.5 text-xs">
                  <KeyRound className="size-3.5" />
                  API Key
                </Label>
                <Input
                  id="api-key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="comissao" className="text-xs">
                    Comissão padrão (%)
                  </Label>
                  <Input
                    id="comissao"
                    type="number"
                    step="0.1"
                    value={comissao}
                    onChange={(e) => setComissao(e.target.value)}
                    className="num h-9 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="taxa-fixa" className="text-xs">
                    Taxa fixa por item (R$)
                  </Label>
                  <Input
                    id="taxa-fixa"
                    type="number"
                    step="0.01"
                    value={taxaFixa}
                    onChange={(e) => setTaxaFixa(e.target.value)}
                    className="num h-9 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="frete-medio" className="text-xs">
                  Frete médio (R$)
                </Label>
                <Input
                  id="frete-medio"
                  type="number"
                  step="0.01"
                  value={freteMedio}
                  onChange={(e) => setFreteMedio(e.target.value)}
                  className="num h-9 text-xs"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onFechar}>
                Cancelar
              </Button>
              <Button onClick={salvar} className="bg-brand hover:bg-brand/90">
                Salvar taxas
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
