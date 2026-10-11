import { useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenha } from "@/components/comum/CampoSenha";

/**
 * Tela cheia mostrada sempre que não há sessão do Supabase — substitui o
 * <AppShell> inteiro (ver src/routes/__root.tsx).
 *
 * O NEXO é SÓ para entrar. A criação de conta (com a escolha do plano e os
 * 7 dias grátis) vai ficar na landing page. A trigger do banco
 * (criar_perfil_ao_cadastrar) já lê o plano escolhido no cadastro.
 */
export function Login() {
  const { entrar } = useAuth();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const resultado = await entrar(email, senha);
    setEnviando(false);
    if (resultado.erro) toast.error(traduzirErro(resultado.erro));
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Planeta97</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Inteligência de rentabilidade para sellers
          </p>
        </div>

        <form onSubmit={aoEnviar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="voce@email.com"
              autoComplete="email"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="senha">Senha</Label>
            <CampoSenha
              id="senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando && <Loader2 className="size-4 animate-spin" />}
            Entrar
          </Button>
        </form>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          Leia os{" "}
          <Link to="/termos" className="underline underline-offset-2 hover:text-foreground">
            Termos de Uso
          </Link>{" "}
          e a{" "}
          <Link to="/privacidade" className="underline underline-offset-2 hover:text-foreground">
            Política de Privacidade
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function traduzirErro(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (m.includes("email") && m.includes("valid")) return "Digite um e-mail válido.";
  return mensagem;
}
