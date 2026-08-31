import { Store } from "lucide-react";
import { CANAIS } from "@/config/navegacao";
import { useConfiguracoes } from "@/context/configuracoes";
import { useSelecaoContas } from "@/context/selecao-contas";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Filtro global de contas: escolher "todo o Mercado Livre", só uma conta
 * específica, ou vários canais de uma vez — a mesma seleção vale em
 * qualquer tela que a use, igual o período já faz.
 */
export function FiltroContas() {
  const { contas } = useConfiguracoes();
  const {
    rotuloResumo,
    todasSelecionadas,
    estaSelecionada,
    alternarConta,
    estadoCanal,
    alternarCanal,
    selecionarTodas,
    limparSelecao,
  } = useSelecaoContas();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 font-medium">
          <Store className="size-4 text-muted-foreground" />
          {rotuloResumo}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        <div className="flex items-center gap-1">
          <button
            onClick={selecionarTodas}
            className={`flex-1 rounded-md px-3 py-2 text-left text-sm transition-colors ${
              todasSelecionadas
                ? "bg-brand-soft font-semibold text-brand"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            Todas as contas
          </button>
          <button
            onClick={limparSelecao}
            className="shrink-0 rounded-md px-2.5 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Limpar tudo
          </button>
        </div>

        <div className="mt-1 max-h-80 space-y-0.5 overflow-y-auto border-t pt-1">
          {CANAIS.map((canal) => {
            const doCanal = contas.filter((c) => c.marketplaceId === canal.id);
            if (doCanal.length === 0) return null;
            const estado = estadoCanal(canal.id);

            return (
              <div key={canal.id} className="py-1">
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                  <Checkbox
                    checked={estado === "todas" ? true : estado === "parcial" ? "indeterminate" : false}
                    onCheckedChange={() => alternarCanal(canal.id)}
                  />
                  <LogoMarketplace id={canal.id} tamanho="xs" />
                  <span className="flex-1 text-sm font-medium">{canal.titulo}</span>
                  {doCanal.length > 1 && (
                    <span className="text-[10px] text-muted-foreground">
                      {doCanal.length} contas
                    </span>
                  )}
                </label>

                {doCanal.length > 1 && (
                  <div className="ml-6 space-y-0.5">
                    {doCanal.map((c) => (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-muted"
                      >
                        <Checkbox
                          checked={estaSelecionada(c.id)}
                          onCheckedChange={() => alternarConta(c.id)}
                        />
                        <span className="truncate text-[13px] text-muted-foreground">
                          {c.nome}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
