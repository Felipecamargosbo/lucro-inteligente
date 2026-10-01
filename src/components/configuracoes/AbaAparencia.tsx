import { useEffect, useState } from "react";
import { Check, Moon, Sun } from "lucide-react";
import { Painel } from "@/components/comum/Indicadores";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/context/auth";
import { preferenciasService } from "@/services";
import { lerTema, salvarTema, type Tema } from "@/lib/tema";

/**
 * Aba "Aparência": o seller escolhe entre o tema escuro (o de sempre) e o
 * claro (fundo branco). Muda na hora e fica salvo neste navegador.
 */
export function AbaAparencia() {
  const { sessao } = useAuth();
  const [tema, setTema] = useState<Tema>("escuro");

  useEffect(() => setTema(lerTema()), []);

  const escolher = async (t: Tema) => {
    setTema(t);
    salvarTema(t);
    if (!sessao) return;
    // Salva também na conta, pra valer em qualquer computador ou celular.
    const erro = await preferenciasService.salvarTema(sessao.user.id, t);
    if (erro) {
      toast.error(
        erro.includes("preferencias_usuario")
          ? "Tema aplicado neste navegador, mas a tabela de preferências ainda não existe — rode o SQL no Supabase pra salvar na conta."
          : `Tema aplicado neste navegador, mas não consegui salvar na conta: ${erro}`,
      );
    }
  };

  const opcoes: { id: Tema; titulo: string; descricao: string; Icone: typeof Sun }[] = [
    {
      id: "escuro",
      titulo: "Escuro",
      descricao: "Fundo cinza-escuro, o visual de sempre do Planeta97.",
      Icone: Moon,
    },
    {
      id: "claro",
      titulo: "Claro",
      descricao: "Fundo branco. O menu da esquerda continua escuro.",
      Icone: Sun,
    },
  ];

  return (
    <Painel titulo="Aparência" descricao="Escolha o tema do Planeta97. Muda na hora.">
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        {opcoes.map((o) => {
          const ativo = tema === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => escolher(o.id)}
              className={cn(
                "flex flex-col gap-3 rounded-xl border p-3 text-left transition-colors",
                ativo ? "border-brand ring-2 ring-brand/40" : "hover:border-foreground/30",
              )}
            >
              {/* Miniatura do tema */}
              <div className="flex h-28 overflow-hidden rounded-lg border">
                <div className="w-1/4 bg-[#12151b]" />
                <div
                  className={cn(
                    "flex flex-1 flex-col gap-2 p-3",
                    o.id === "escuro" ? "bg-[#1f252e]" : "bg-[#f4f6f9]",
                  )}
                >
                  <div
                    className={cn(
                      "h-3 w-1/2 rounded",
                      o.id === "escuro" ? "bg-white/20" : "bg-black/15",
                    )}
                  />
                  <div
                    className={cn(
                      "flex-1 rounded-md border-2",
                      o.id === "escuro" ? "bg-[#262e38]" : "bg-white",
                    )}
                    style={{ borderColor: "#1b9a8a" }}
                  />
                </div>
              </div>
              <div className="flex items-start gap-2">
                <o.Icone className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{o.titulo}</p>
                  <p className="text-xs text-muted-foreground">{o.descricao}</p>
                </div>
                {ativo && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">
                    <Check className="size-3" />
                    Em uso
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="border-t px-4 py-3 text-[11px] text-muted-foreground">
        A escolha fica salva na sua conta: vale em qualquer computador ou celular em que você
        entrar.
      </p>
    </Painel>
  );
}
