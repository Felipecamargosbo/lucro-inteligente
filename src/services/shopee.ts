import { supabase } from "@/lib/supabase";

/**
 * Conexão real com a Shopee (Open Platform, API v2).
 *
 * Como no Mercado Livre, as chaves de acesso NUNCA chegam ao navegador:
 * ficam trancadas no banco e só as Edge Functions leem. O site só vê o nome
 * da loja, o status e as datas.
 */
export type ConexaoShopee = {
  id: string;
  shopId: number;
  nomeLoja: string | null;
  status: "ativa" | "reconectar" | string;
  /** Até quando o seller autorizou o NEXO (a Shopee pede renovar a cada 365 dias). */
  autorizacaoExpiraEm: string | null;
  criadoEm: string;
};

const COLUNAS = "id, shop_id, nome_loja, status, autorizacao_expira_em, criado_em";

export const shopeeService = {
  async listar(): Promise<ConexaoShopee[]> {
    const { data, error } = await supabase
      .from("shopee_conexoes")
      .select(COLUNAS)
      .order("criado_em", { ascending: true });
    if (error) {
      console.error("Erro ao listar lojas da Shopee:", error);
      return [];
    }
    return (data ?? []).map((l) => ({
      id: l.id as string,
      shopId: Number(l.shop_id),
      nomeLoja: (l.nome_loja as string | null) ?? null,
      status: l.status as string,
      autorizacaoExpiraEm: (l.autorizacao_expira_em as string | null) ?? null,
      criadoEm: l.criado_em as string,
    }));
  },

  /** Pede ao servidor o link de autorização da Shopee. */
  async iniciarConexao(): Promise<{ url?: string; erro?: string }> {
    const { data, error } = await supabase.functions.invoke("shopee-conectar", { method: "POST", body: {} });
    if (error) {
      console.error("Erro ao iniciar conexão com a Shopee:", error);
      return { erro: "Não consegui falar com o servidor. Tente de novo em instantes." };
    }
    if (data?.erro) return { erro: data.erro as string };
    if (!data?.url) return { erro: "O servidor não devolveu o link da Shopee." };
    return { url: data.url as string };
  },

  /** Traz agora anúncios e vendas das lojas da Shopee. */
  async sincronizar(): Promise<{ erro: string | null; resumo: string }> {
    const { data, error } = await supabase.functions.invoke("shopee-sincronizar", { method: "POST", body: {} });
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
    const { error } = await supabase.from("shopee_conexoes").delete().eq("id", id);
    if (error) {
      console.error("Erro ao desconectar loja da Shopee:", error);
      return "Não consegui desconectar. Tente de novo.";
    }
    return null;
  },
};

/** Dias até a autorização da loja vencer (null se não souber). */
export function diasParaVencerAutorizacao(c: Pick<ConexaoShopee, "autorizacaoExpiraEm">): number | null {
  if (!c.autorizacaoExpiraEm) return null;
  return Math.ceil((new Date(c.autorizacaoExpiraEm).getTime() - Date.now()) / 86400000);
}
