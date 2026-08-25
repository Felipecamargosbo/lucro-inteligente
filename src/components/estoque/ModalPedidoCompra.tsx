import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Mail, Package } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { SeloMarketplace } from "@/components/comum/Indicadores";
import { formatBRL, formatNumero } from "@/lib/format";
import type { ItemEstoqueDetalhado } from "@/types";

/** Sugere reposição para ~30 dias de cobertura, com mínimo de 10 unidades. */
function quantidadeSugerida(item: ItemEstoqueDetalhado) {
  return Math.max(10, Math.ceil(item.vendasDia * 30) - item.quantidade);
}

function montarEmail(item: ItemEstoqueDetalhado, quantidade: number) {
  return `Olá, equipe comercial.

Solicito cotação e prazo de entrega para reposição do item abaixo:

Produto: ${item.produto}
SKU: ${item.sku}
Quantidade desejada: ${formatNumero(quantidade)} unidades
Estoque atual: ${formatNumero(item.quantidade)} un
Vendas médias: ${item.vendasDia.toFixed(1).replace(".", ",")} un/dia
Custo unitário de referência: ${formatBRL(item.custoUnitario)}

Favor retornar com preço, prazo de entrega e condições de pagamento.

Obrigado,
Equipe de Compras`;
}

export function ModalPedidoCompra({
  item,
  onFechar,
}: {
  item: ItemEstoqueDetalhado | null;
  onFechar: () => void;
}) {
  const [emailFornecedor, setEmailFornecedor] = useState("compras@fornecedor.com");
  const [mensagem, setMensagem] = useState("");

  const qtdSugerida = useMemo(() => (item ? quantidadeSugerida(item) : 0), [item]);

  // Recalcula o texto sempre que outro produto for selecionado.
  useEffect(() => {
    if (!item) return;
    setMensagem(montarEmail(item, qtdSugerida));
  }, [item, qtdSugerida]);

  const assunto = useMemo(
    () => (item ? `Pedido de compra - ${item.produto} (${item.sku})` : ""),
    [item],
  );

  const enviarEmail = () => {
    if (!item) return;
    const link = `mailto:${emailFornecedor}?subject=${encodeURIComponent(
      assunto,
    )}&body=${encodeURIComponent(mensagem)}`;
    window.location.href = link;
    toast.success("Pedido de compra preparado no seu e-mail", {
      description: `${item.produto} • ${formatNumero(qtdSugerida)} un para ${emailFornecedor}`,
    });
    onFechar();
  };

  return (
    <Dialog open={!!item} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="sm:max-w-lg">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="size-4 text-brand" />
                Pedido de compra
              </DialogTitle>
              <DialogDescription asChild>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{item.produto}</p>
                  <div className="flex items-center gap-2">
                    <span className="num text-xs">{item.sku}</span>
                    <SeloMarketplace id={item.marketplaceId} />
                  </div>
                </div>
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-2 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="email-fornecedor" className="text-xs">
                  E-mail do fornecedor responsável
                </Label>
                <Input
                  id="email-fornecedor"
                  type="email"
                  value={emailFornecedor}
                  onChange={(e) => setEmailFornecedor(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="qtd-reposicao" className="text-xs">
                  Quantidade sugerida de reposição
                </Label>
                <Input
                  id="qtd-reposicao"
                  type="number"
                  min={1}
                  value={quantidade}
                  onChange={(e) => aoAlterarQuantidade(Number(e.target.value) || 0)}
                  className="num h-9 text-xs"
                />
                <p className="text-[10px] text-muted-foreground">
                  Sugestão para ~30 dias de cobertura ({formatNumero(item.quantidade)} un em
                  estoque hoje)
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mensagem-cotacao" className="text-xs">
                E-mail de cotação (pré-formatado)
              </Label>
              <Textarea
                id="mensagem-cotacao"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={11}
                className="resize-none text-xs leading-relaxed"
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onFechar}>
                Cancelar
              </Button>
              <Button onClick={enviarEmail} className="gap-2 bg-brand hover:bg-brand/90">
                <Mail className="size-3.5" />
                Enviar Pedido por E-mail
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
