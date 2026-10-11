import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { encerrarMarcaDeSuporte, inicioDoSuporte, MODO_SUPORTE, supabase } from "@/lib/supabase";
import type { Perfil, RecursosPlano } from "@/types";
import { definirDemonstracao } from "@/lib/demonstracao";

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
  /** O que o plano atual libera — enquanto carrega ou se algo falhar, vem
   * fechado (só o essencial), nunca aberto por padrão. */
  recursos: RecursosPlano;
  /** true só nas contas marcadas como "Demonstração" no ADMIN: são as únicas
   * que veem os dados fictícios de exemplo. */
  demonstracao: boolean;
  /** true enquanto ainda não leu o perfil de quem está logado. */
  carregandoPerfil: boolean;
  /** true nesta aba quando o ADMIN abriu a conta em modo suporte
   * (somente leitura). */
  suporte: boolean;
  /** Encerra o modo suporte (sai da conta do seller e fecha a aba). */
  sairDoSuporte: () => Promise<void>;
  carregando: boolean;
  entrar: (email: string, senha: string) => Promise<{ erro: string | null }>;
  cadastrar: (
    email: string,
    senha: string,
    nomeExibicao: string,
    planoEscolhido?: string,
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

/** Fechado por padrão: enquanto não se sabe o plano (ou se a consulta
 * falhar), o seller não vê recurso pago nenhum liberado por engano. */
const RECURSOS_PADRAO: RecursosPlano = {
  dashboard: true,
  agentes: false,
  agentesEscrita: false,
};

function mapearRecursos(json: unknown): RecursosPlano {
  const j = (json ?? {}) as Record<string, unknown>;
  return {
    dashboard: Boolean(j.dashboard),
    agentes: Boolean(j.agentes),
    agentesEscrita: Boolean(j.agentes_escrita),
  };
}

function linhaParaPerfil(linha: {
  id: string;
  nome_exibicao: string;
  razao_social: string | null;
  email: string;
  logo_url: string | null;
  plano: string;
  plano_id: string;
  modo_demonstracao?: boolean | null;
  conta_interna?: boolean | null;
  status_assinatura?: string | null;
  teste_ate?: string | null;
  proximo_vencimento?: string | null;
}): Perfil {
  return {
    id: linha.id,
    nomeExibicao: linha.nome_exibicao,
    razaoSocial: linha.razao_social,
    email: linha.email,
    logoUrl: linha.logo_url,
    plano: linha.plano,
    planoId: linha.plano_id,
    modoDemonstracao: Boolean(linha.modo_demonstracao),
    contaInterna: Boolean(linha.conta_interna),
    statusAssinatura: linha.status_assinatura ?? "ativa",
    testeAte: linha.teste_ate ?? null,
    proximoVencimento: linha.proximo_vencimento ?? null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessao, setSessao] = useState<Session | null>(null);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [recursos, setRecursos] = useState<RecursosPlano>(RECURSOS_PADRAO);
  const [carregando, setCarregando] = useState(true);
  const [demonstracao, setDemonstracao] = useState(false);
  const [carregandoPerfil, setCarregandoPerfil] = useState(false);

  /** Liga/desliga os dados de exemplo para o app inteiro. */
  function aplicarDemonstracao(valor: boolean) {
    definirDemonstracao(valor);
    setDemonstracao(valor);
  }

  async function buscarPerfil(userId: string) {
    setCarregandoPerfil(true);
    try {
      await lerPerfil(userId);
    } finally {
      setCarregandoPerfil(false);
    }
  }

  async function lerPerfil(userId: string) {
    const { data, error } = await supabase
      .from("perfis")
      .select(
        "id, nome_exibicao, razao_social, email, logo_url, plano, plano_id, modo_demonstracao, conta_interna, status_assinatura, teste_ate, proximo_vencimento",
      )
      .eq("id", userId)
      .single();

    if (error || !data) {
      // A trigger no banco cria a linha de perfil no instante do cadastro —
      // se não achou, o mais provável é ela ainda não ter rodado. Não é
      // motivo pra travar o app; a lateral cai num nome padrão.
      // Sem perfil, nunca mostra dado fictício (o padrão é a conta limpa).
      aplicarDemonstracao(false);
      setPerfil(null);
      setRecursos(RECURSOS_PADRAO);
      return;
    }
    aplicarDemonstracao(Boolean(data.modo_demonstracao));
    setPerfil(linhaParaPerfil(data));

    const { data: plano } = await supabase
      .from("planos")
      .select("recursos")
      .eq("id", data.plano_id)
      .single();
    setRecursos(plano ? mapearRecursos(plano.recursos) : RECURSOS_PADRAO);
  }

  useEffect(() => {
    // Aba aberta pelo ADMIN em modo suporte: entra com o login que veio no
    // endereço e limpa o endereço (o login não fica visível nem no histórico).
    if (MODO_SUPORTE && window.location.hash.includes("suporte_access_token=")) {
      const p = new URLSearchParams(window.location.hash.slice(1));
      const access_token = p.get("suporte_access_token") ?? "";
      const refresh_token = p.get("suporte_refresh_token") ?? "";
      window.history.replaceState(null, "", window.location.pathname);
      supabase.auth.setSession({ access_token, refresh_token }).then(({ data }) => {
        setSessao(data.session);
        if (data.session) buscarPerfil(data.session.user.id);
        setCarregando(false);
      });
    } else {
      supabase.auth.getSession().then(({ data }) => {
        setSessao(data.session);
        if (data.session) buscarPerfil(data.session.user.id);
        setCarregando(false);
      });
    }

    const { data: assinatura } = supabase.auth.onAuthStateChange((_evento, novaSessao) => {
      setSessao(novaSessao);
      if (novaSessao) {
        buscarPerfil(novaSessao.user.id);
      } else {
        aplicarDemonstracao(false);
        setPerfil(null);
        setRecursos(RECURSOS_PADRAO);
      }
    });

    return () => assinatura.subscription.unsubscribe();
  }, []);

  // O modo suporte dura no máximo 1 hora; depois disso sai sozinho.
  useEffect(() => {
    const inicio = inicioDoSuporte();
    if (!inicio) return;
    const restante = inicio + 60 * 60 * 1000 - Date.now();
    const t = window.setTimeout(() => void sairDoSuporte(), Math.max(0, restante));
    return () => window.clearTimeout(t);
  }, []);

  async function sairDoSuporte() {
    await supabase.auth.signOut({ scope: "local" });
    encerrarMarcaDeSuporte();
    window.close();
    // Se o navegador não deixar fechar a aba, volta para a tela de login.
    window.location.replace("/");
  }

  async function entrar(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    return { erro: error?.message ?? null };
  }

  async function cadastrar(email: string, senha: string, nomeExibicao: string, planoEscolhido = "bronze") {
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      // `nome_exibicao` alimenta a trigger que cria a linha em `perfis`.
      // `display_name` é a chave que o painel do Supabase lê para preencher
      // a coluna "Display name" da tela de Users — sem ela, aquela coluna
      // fica vazia e você não sabe de quem é cada e-mail.
      // `plano_escolhido` define o plano (com 7 dias grátis) na hora do
      // cadastro — quem confere se o plano existe é a trigger do banco.
      options: {
        data: { nome_exibicao: nomeExibicao, display_name: nomeExibicao, plano_escolhido: planoEscolhido },
      },
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
        recursos,
        demonstracao,
        carregandoPerfil,
        suporte: MODO_SUPORTE && !!sessao,
        sairDoSuporte,
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
