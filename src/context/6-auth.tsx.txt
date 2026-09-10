import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Perfil } from "@/types";

/**
 * Sessão de login do seller (Supabase Auth) + o perfil dele (tabela
 * `perfis`, ver src/types/index.ts). Enquanto `carregando` for true, ainda
 * não sabemos se existe uma sessão válida — é o que evita mostrar a tela de
 * login por um instante para quem já está logado.
 */
interface AuthContexto {
  sessao: Session | null;
  perfil: Perfil | null;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<{ erro: string | null }>;
  cadastrar: (
    email: string,
    senha: string,
    nomeExibicao: string,
  ) => Promise<{ erro: string | null }>;
  sair: () => Promise<void>;
  atualizarPerfil: (dados: Partial<Pick<Perfil, "nomeExibicao" | "logoUrl">>) => Promise<{
    erro: string | null;
  }>;
}

const Ctx = createContext<AuthContexto | null>(null);

function linhaParaPerfil(linha: {
  id: string;
  nome_exibicao: string;
  email: string;
  logo_url: string | null;
  plano: string;
}): Perfil {
  return {
    id: linha.id,
    nomeExibicao: linha.nome_exibicao,
    email: linha.email,
    logoUrl: linha.logo_url,
    plano: linha.plano,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [carregando, setCarregando] = useState(true);

  async function buscarPerfil(userId: string) {
    const { data, error } = await supabase
      .from("perfis")
      .select("id, nome_exibicao, email, logo_url, plano")
      .eq("id", userId)
      .single();

    if (error || !data) {
      // A trigger no banco cria a linha de perfil no instante do cadastro —
      // se não achou, o mais provável é ela ainda não ter rodado. Não é
      // motivo pra travar o app; a lateral cai num nome padrão.
      setPerfil(null);
      return;
    }
    setPerfil(linhaParaPerfil(data));
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
      if (data.session) buscarPerfil(data.session.user.id);
      setCarregando(false);
    });

    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
      if (novaSessao) {
        buscarPerfil(novaSessao.user.id);
      } else {
        setPerfil(null);
      }
    });

    return () => assinatura.subscription.unsubscribe();
  }, []);

  async function entrar(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return { erro: error?.message ?? null };
  }

  async function cadastrar(email: string, senha: string, nomeExibicao: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: { data: { nome_exibicao: nomeExibicao } },
    });
    return { erro: error?.message ?? null };
  }

  async function sair() {
    await supabase.auth.signOut();
  }

  async function atualizarPerfil(dados: Partial<Pick<Perfil, "nomeExibicao" | "logoUrl">>) {
    if (!sessao) return { erro: "Sem sessão ativa." };

    const patch: Record<string, string | null> = {};
    if (dados.nomeExibicao !== undefined) patch["nome_exibicao"] = dados.nomeExibicao;
    if (dados.logoUrl !== undefined) patch["logo_url"] = dados.logoUrl;

    const { error } = await supabase.from("perfis").update(patch).eq("id", sessao.user.id);
    if (error) return { erro: error.message };

    setPerfil((atual) => (atual ? { ...atual, ...dados } : atual));
    return { erro: null };
  }

  return (
    <Ctx.Provider value={{ sessao, perfil, carregando, entrar, cadastrar, sair, atualizarPerfil }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
