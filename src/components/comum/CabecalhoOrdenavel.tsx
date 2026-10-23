import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type Ordem<K extends string> = { chave: K; dir: "asc" | "desc" } | null;

/**
 * Ordenação de tabela por clique no cabeçalho.
 * 1º clique: maior → menor (números) / A → Z (texto, via `textoPrimeiro`);
 * 2º clique: inverte; 3º clique: volta à ordem original.
 */
export function useOrdem<K extends string>(inicial: Ordem<K> = null) {
  const [ordem, setOrdem] = useState<Ordem<K>>(inicial);
  const alternar = (chave: K, primeiro: "asc" | "desc" = "desc") =>
    setOrdem((o) => {
      if (!o || o.chave !== chave) return { chave, dir: primeiro };
      if (o.dir === primeiro) return { chave, dir: primeiro === "desc" ? "asc" : "desc" };
      return null;
    });
  return { ordem, alternar };
}

/** Compara valores de qualquer tipo; vazios (null/undefined) ficam sempre no fim. */
export function ordenarPor<T, K extends string>(
  lista: T[],
  ordem: Ordem<K>,
  valor: (item: T, chave: K) => number | string | null | undefined,
): T[] {
  if (!ordem) return lista;
  const f = ordem.dir === "asc" ? 1 : -1;
  return [...lista].sort((a, b) => {
    const x = valor(a, ordem.chave);
    const y = valor(b, ordem.chave);
    const xv = x === null || x === undefined || x === "";
    const yv = y === null || y === undefined || y === "";
    if (xv && yv) return 0;
    if (xv) return 1;
    if (yv) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * f;
    return String(x).localeCompare(String(y), "pt-BR") * f;
  });
}

export function CabecalhoOrdenavel<K extends string>({
  chave,
  ordem,
  aoClicar,
  alinhar = "left",
  primeiro = "desc",
  className,
  children,
}: {
  chave: K;
  ordem: Ordem<K>;
  aoClicar: (chave: K, primeiro: "asc" | "desc") => void;
  alinhar?: "left" | "right" | "center";
  primeiro?: "asc" | "desc";
  className?: string;
  children: ReactNode;
}) {
  const ativo = ordem?.chave === chave;
  const Icone = !ativo ? ArrowUpDown : ordem.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn("px-2 py-3 font-bold", alinhar === "right" && "text-right", alinhar === "center" && "text-center", className)}
      aria-sort={ativo ? (ordem.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => aoClicar(chave, primeiro)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-foreground",
          ativo && "text-foreground",
        )}
        title="Clique para ordenar"
      >
        {children}
        <Icone className={cn("size-3", !ativo && "opacity-40")} />
      </button>
    </th>
  );
}
