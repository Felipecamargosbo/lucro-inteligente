import { Eye, LogOut } from "lucide-react";
import { useAuth } from "@/context/auth";

/**
 * Faixa fixa no topo quando a aba está em MODO SUPORTE (aberta pelo ADMIN).
 * Deixa claro de quem é a conta e que nada pode ser alterado.
 */
export function FaixaSuporte() {
  const { suporte, perfil, sairDoSuporte } = useAuth();
  if (!suporte) return null;

  return (
    <div className="sticky top-0 z-50 flex flex-wrap items-center gap-3 bg-amber-500 px-4 py-2 text-sm font-medium text-black">
      <Eye className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">
        <strong>Modo suporte</strong> — você está vendo a conta de{" "}
        <strong>{perfil?.nomeExibicao ?? perfil?.email ?? "um seller"}</strong>
        {perfil?.email ? ` (${perfil.email})` : ""}. Somente leitura: nada pode ser alterado e
        este acesso fica registrado.
      </p>
      <button
        type="button"
        onClick={() => void sairDoSuporte()}
        className="inline-flex items-center gap-1.5 rounded-md bg-black/85 px-3 py-1 text-xs font-semibold text-white hover:bg-black"
      >
        <LogOut className="size-3.5" />
        Sair do modo suporte
      </button>
    </div>
  );
}
