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

export const supabase = createClient(url ?? "", publishableKey ?? "");
