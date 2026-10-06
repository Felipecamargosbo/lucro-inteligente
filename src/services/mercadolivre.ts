import { supabase } from "@/lib/supabase";

/**
 * Conexão real com o Mercado Livre (API oficial).
 *
 * Os tokens de acesso NUNCA chegam aqui no navegador: ficam trancados no
 * banco e só as Edge Functions leem. O site só enxerga o apelido da conta,
 * o status e as datas.
 */
export type ConexaoMercadoLivre = {
  id: string;
  mlUserId: number;
  apelido: string | null;
  status: "ativa" | "reconectar" | string;
  expiraEm: string;
  criadoEm: string;
  atualizadoEm: string;
};

// Só as colunas liberadas para o site (os tokens ficam de fora).
const COLUNAS = "id, ml_user_id, apelido, status, expira_em, criado_em, atualizado_em";

export const mercadoLivreService = {
  /** Contas do Mercado Livre conectadas pelo seller logado. */
  async listar(): Promise<ConexaoMercadoLivre[]> {
    const { data, error } = await supabase
      .from("ml_conexoes")
      .select(COLUNAS)
      .order("criado_em", { ascending: true });
    if (error) {
      console.error("Erro ao listar conexões do Mercado Livre:", error);
      return [];
    }
    return (data ?? []).map((l) => ({
      id: l.id as string,
      mlUserId: Number(l.ml_user_id),
      apelido: (l.apelido as string | null) ?? null,
      status: l.status as string,
      expiraEm: l.expira_em as string,
      criadoEm: l.criado_em as string,
      atualizadoEm: l.atualizado_em as string,
    }));
  },

  /**
   * Pede ao servidor o link de autorização do Mercado Livre.
   * Devolve a URL para abrir, ou uma mensagem de erro.
   */
  async iniciarConexao(): Promise<{ url?: string; erro?: string }> {
    const { data, error } = await supabase.functions.invoke("mercadolivre-conectar", {
      method: "POST",
      body: {},
    });
    if (error) {
      console.error("Erro ao iniciar conexão com o Mercado Livre:", error);
      return { erro: "Não consegui falar com o servidor. Tente de novo em instantes." };
    }
    if (data?.erro) return { erro: data.erro as string };
    if (!data?.url) return { erro: "O servidor não devolveu o link do Mercado Livre." };
    return { url: data.url as string };
  },

  /** Remove a conexão (o NEXO para de acessar essa conta). */
  async desconectar(id: string): Promise<string | null> {
    const { error } = await supabase.from("ml_conexoes").delete().eq("id", id);
    if (error) {
      console.error("Erro ao desconectar conta do Mercado Livre:", error);
      return "Não consegui desconectar. Tente de novo.";
    }
    return null;
  },
};
