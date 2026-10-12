import { supabase } from "@/lib/supabase";

/**
 * Conexão real com o TikTok Shop (Partner Center, API 202309).
 *
 * Como no Mercado Livre, as chaves de acesso NUNCA chegam ao navegador:
 * ficam trancadas no banco e só as Edge Functions leem. O site só vê o nome
 * da loja, o status e as datas.
 */
export type ConexaoTikTok = {
  id: string;
  shopId: string;
  nomeLoja: string | null;
  status: "ativa" | "reconectar" | string;
  criadoEm: string;
};

const COLUNAS = "id, shop_id, nome_loja, status, criado_em";

export const tiktokService = {
  async listar(): Promise<ConexaoTikTok[]> {
    const { data, error } = await supabase
      .from("tiktok_conexoes")
      .select(COLUNAS)
      .order("criado_em", { ascending: true });
    if (error) {
      console.error("Erro ao listar lojas do TikTok Shop:", error);
      return [];
    }
    return (data ?? []).map((l) => ({
      id: l.id as string,
      shopId: String(l.shop_id),
      nomeLoja: (l.nome_loja as string | null) ?? null,
      status: l.status as string,
      criadoEm: l.criado_em as string,
    }));
  },

  /** Pede ao servidor o link de autorização do TikTok Shop. */
  async iniciarConexao(): Promise<{ url?: string; erro?: string }> {
    const { data, error } = await supabase.functions.invoke("tiktok-conectar", { method: "POST", body: {} });
    if (error) {
      console.error("Erro ao iniciar conexão com o TikTok Shop:", error);
      return { erro: "Não consegui falar com o servidor. Tente de novo em instantes." };
    }
    if (data?.erro) return { erro: data.erro as string };
    if (!data?.url) return { erro: "O servidor não devolveu o link do TikTok Shop." };
    return { url: data.url as string };
  },

  /** Traz agora anúncios e vendas das lojas do TikTok Shop. */
  async sincronizar(): Promise<{ erro: string | null; resumo: string }> {
    const { data, error } = await supabase.functions.invoke("tiktok-sincronizar", { method: "POST", body: {} });
    if (error) return { erro: "Não consegui falar com o servidor. Tente de novo.", resumo: "" };
    if (data?.erro) return { erro: data.erro as string, resumo: "" };
    const resultados = (data?.resultados ?? []) as {
      ok: boolean;
      conta: string;
      anuncios?: number;
      pedidos?: number;
      erro?: string;
    }[];
    const falha = resultados.find((r) => !r.ok);
    if (falha) return { erro: `${falha.conta}: ${falha.erro}`, resumo: "" };
    return {
      erro: null,
      resumo:
        resultados.map((r) => `${r.conta}: ${r.anuncios} anúncios e ${r.pedidos} vendas`).join(" · ") ||
        "Nenhuma loja conectada.",
    };
  },

  async desconectar(id: string): Promise<string | null> {
    const { error } = await supabase.from("tiktok_conexoes").delete().eq("id", id);
    if (error) {
      console.error("Erro ao desconectar loja do TikTok Shop:", error);
      return "Não consegui desconectar. Tente de novo.";
    }
    return null;
  },
};

