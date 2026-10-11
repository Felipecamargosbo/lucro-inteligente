import { createClient } from "@supabase/supabase-js";

/**
 * Cliente único do Supabase, usado por toda a aplicação (autenticação,
 * leitura/escrita de dados). As duas variáveis abaixo NUNCA devem ter valor
 * escrito direto aqui — elas vêm do ambiente:
 *
 *  - Em desenvolvimento local: arquivo `.env.local` (não é versionado no Git)
 *  - Em produção: Environment Variables do projeto na Vercel
 *
 * VITE_SUPABASE_PUBLISHABLE_KEY é uma chave pública por design (equivalente
 * à antiga "anon key") — ela pode aparecer no navegador do usuário sem
 * problema, porque quem protege os dados é o RLS (Row Level Security)
 * configurado em cada tabela do banco, não o sigilo dessa chave.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  console.error(
    "Supabase não configurado: faltam VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY nas variáveis de ambiente.",
  );
}

/**
 * MODO SUPORTE (aberto pelo ADMIN, botão "Acessar conta").
 *
 * O ADMIN abre o NEXO numa aba nova com `#suporte_access_token=...` no
 * endereço. Essa aba guarda o login no `sessionStorage` (só dela), e não no
 * `localStorage`: assim o login de suporte nunca substitui o seu próprio
 * login nas outras abas, e some sozinho quando a aba fecha.
 *
 * Quem garante o "somente leitura" é o banco (regras `suporte_sem_*`); aqui
 * só bloqueamos também as funções do servidor (IA, sincronização), para
 * não gastar créditos do seller.
 */
const CHAVE_SUPORTE = "nexo:suporte";

function abaDeSuporte(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (window.location.hash.includes("suporte_access_token=")) {
      window.sessionStorage.setItem(CHAVE_SUPORTE, String(Date.now()));
    }
    return window.sessionStorage.getItem(CHAVE_SUPORTE) !== null;
  } catch {
    return false;
  }
}

export const MODO_SUPORTE = abaDeSuporte();

/** Quando o modo suporte começou (para encerrar sozinho depois de 1 hora). */
export function inicioDoSuporte(): number | null {
  if (!MODO_SUPORTE) return null;
  try {
    return Number(window.sessionStorage.getItem(CHAVE_SUPORTE)) || null;
  } catch {
    return null;
  }
}

/** Sai do modo suporte: apaga a marca desta aba. */
export function encerrarMarcaDeSuporte() {
  try {
    window.sessionStorage.removeItem(CHAVE_SUPORTE);
  } catch {
    /* sem armazenamento: nada a apagar */
  }
}

export const supabase = createClient(
  url ?? "",
  publishableKey ?? "",
  MODO_SUPORTE
    ? { auth: { storage: window.sessionStorage, storageKey: "nexo-suporte", detectSessionInUrl: false } }
    : undefined,
);

if (MODO_SUPORTE) {
  // Nada de IA nem sincronização em nome do seller durante o suporte.
  supabase.functions.invoke = (async () => ({
    data: null,
    error: new Error("Modo suporte: somente leitura."),
  })) as unknown as typeof supabase.functions.invoke;
}
