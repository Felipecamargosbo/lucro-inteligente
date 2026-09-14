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
type DadosEditaveis = Partial<Pick<Perfil, "nomeExibicao" | "razaoSocial" | "logoUrl">>;

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
  atualizarPerfil: (dados: DadosEditaveis) => Promise<{ erro: string | null }>;
  enviarLogo: (arquivo: File) => Promise<{ erro: string | null }>;
  trocarEmail: (novoEmail: string) => Promise<{ erro: string | null }>;
  trocarSenha: (
    senhaAtual: string,
    novaSenha: string,
  ) => Promise<{ erro: string | null }>;
}

const Ctx = createContext<AuthContexto | null>(null);

const BUCKET_LOGOS = "logos";

function linhaParaPerfil(linha: {
  id: string;
  nome_exibicao: string;
  razao_social: string | null;
  email: string;
  logo_url: string | null;
  plano: string;
}): Perfil {
  return {
    id: linha.id,
    nomeExibicao: linha.nome_exibicao,
    razaoSocial: linha.razao_social,
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
      .select("id, nome_exibicao, razao_social, email, logo_url, plano")
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
      // `nome_exibicao` alimenta a trigger que cria a linha em `perfis`.
      // `display_name` é a chave que o painel do Supabase lê para preencher
      // a coluna "Display name" da tela de Users — sem ela, aquela coluna
      // fica vazia e você não sabe de quem é cada e-mail.
      options: { data: { nome_exibicao: nomeExibicao, display_name: nomeExibicao } },
    });
    return { erro: error?.message ?? null };
  }

  async function sair() {
    await supabase.auth.signOut();
  }

  async function atualizarPerfil(dados: DadosEditaveis) {
    if (!sessao) return { erro: "Sem sessão ativa." };

    const patch: Record<string, string | null> = {};
    if (dados.nomeExibicao !== undefined) patch["nome_exibicao"] = dados.nomeExibicao;
    if (dados.razaoSocial !== undefined) patch["razao_social"] = dados.razaoSocial;
    if (dados.logoUrl !== undefined) patch["logo_url"] = dados.logoUrl;

    const { error } = await supabase.from("perfis").update(patch).eq("id", sessao.user.id);
    if (error) return { erro: error.message };

    // Mantém o "Display name" do painel do Supabase igual ao nome fantasia.
    // Se falhar, não é motivo para dizer que o salvamento deu errado: o dado
    // que importa (a tabela `perfis`) já foi gravado acima.
    if (dados.nomeExibicao !== undefined) {
      await supabase.auth.updateUser({ data: { display_name: dados.nomeExibicao } });
    }

    setPerfil((atual) => (atual ? { ...atual, ...dados } : atual));
    return { erro: null };
  }

  /**
   * Sobe o logo para o Storage e grava o endereço dele no perfil.
   *
   * O arquivo vai para uma pasta com o id do próprio seller — é isso que as
   * regras de segurança do bucket conferem para impedir que um seller
   * sobrescreva o logo de outro.
   *
   * O `?v=` no fim do endereço existe porque o caminho do arquivo é sempre o
   * mesmo: sem ele, o navegador continuaria exibindo o logo antigo do cache
   * depois da troca.
   */
  async function enviarLogo(arquivo: File) {
    if (!sessao) return { erro: "Sem sessão ativa." };

    const extensao = arquivo.name.split(".").pop()?.toLowerCase() || "png";
    const caminho = `${sessao.user.id}/logo.${extensao}`;

    const { error: erroUpload } = await supabase.storage
      .from(BUCKET_LOGOS)
      .upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });

    if (erroUpload) return { erro: erroUpload.message };

    const { data } = supabase.storage.from(BUCKET_LOGOS).getPublicUrl(caminho);
    return atualizarPerfil({ logoUrl: `${data.publicUrl}?v=${Date.now()}` });
  }

  /**
   * Troca o e-mail de acesso. O Supabase não muda na hora: ele manda uma
   * confirmação para o endereço NOVO, e a troca só vale depois que a pessoa
   * clicar no link de lá. Até isso acontecer, o login continua sendo o antigo.
   */
  async function trocarEmail(novoEmail: string) {
    const { error } = await supabase.auth.updateUser({ email: novoEmail });
    return { erro: error?.message ?? null };
  }

  /**
   * Troca a senha. Confere a senha atual antes: sozinho, o `updateUser` só
   * exige a sessão aberta — ou seja, quem pegasse o navegador destravado
   * trocaria a senha sem nunca ter sabido a antiga, e trancaria o dono fora
   * da própria conta. O `signInWithPassword` aqui é só essa conferência.
   */
  async function trocarSenha(senhaAtual: string, novaSenha: string) {
    const email = sessao?.user.email;
    if (!email) return { erro: "Sem sessão ativa." };

    const { error: erroConferencia } = await supabase.auth.signInWithPassword({
      email,
      password: senhaAtual,
    });
    if (erroConferencia) return { erro: "Senha atual incorreta." };

    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    return { erro: error?.message ?? null };
  }

  return (
    <Ctx.Provider
      value={{
        sessao,
        perfil,
        carregando,
        entrar,
        cadastrar,
        sair,
        atualizarPerfil,
        enviarLogo,
        trocarEmail,
        trocarSenha,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
