import { useState, type ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Campo de senha com o "olho" de mostrar/ocultar. Usado no login e em
 * qualquer lugar que peça senha.
 *
 * Dois detalhes que não são enfeite:
 * - `type="button"` no olho: sem isso ele herda "submit" e enviaria o
 *   formulário a cada clique.
 * - `tabIndex={-1}`: mantém o Tab indo da senha direto para o botão de
 *   enviar, em vez de parar no olho no meio do caminho.
 */
export function CampoSenha({ className, ...props }: ComponentProps<typeof Input>) {
  const [visivel, setVisivel] = useState(false);

  return (
    <div className="relative">
      <Input
        {...props}
        type={visivel ? "text" : "password"}
        className={cn("pr-10", className)}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground"
      >
        {visivel ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
