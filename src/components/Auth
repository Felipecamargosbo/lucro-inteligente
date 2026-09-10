import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Modo = "entrar" | "cadastrar";

/**
 * Tela cheia mostrada sempre que não há sessão do Supabase — substitui o
 * <AppShell> inteiro (ver src/routes/__root.tsx). Sem recuperação de senha
 * ainda: fica pra uma próxima etapa.
 */
export function Login() {
  const { entrar, cadastrar } = useAuth();

  const [modo, setModo] = useState<Modo>("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nome, setNome] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);

    const resultado =
      modo === "entrar" ? await entrar(email, senha) : await cadastrar(email, senha, nome);

    setEnviando(false);

    if (resultado.erro) {
      toast.error(traduzirErro(resultado.erro));
      return;
    }

    if (modo === "cadastrar") {
      toast.success("Conta criada! Verifique seu e-mail para confirmar o cadastro.");
      setModo("entrar");
    }
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

        <div className="flex rounded-lg border bg-muted/40 p-1 text-sm">
          <button
            type="button"
            onClick={() => setModo("entrar")}
            className={cn(
              "flex-1 rounded-md py-1.5 font-medium transition-colors",
              modo === "entrar"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setModo("cadastrar")}
            className={cn(
              "flex-1 rounded-md py-1.5 font-medium transition-colors",
              modo === "cadastrar"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={aoEnviar} className="space-y-4">
          {modo === "cadastrar" && (
            <div className="space-y-1.5">
              <Label htmlFor="nome">Seu nome</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                required
                placeholder="Como quer ser chamado"
              />
            </div>
          )}

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
            <Input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              autoComplete={modo === "entrar" ? "current-password" : "new-password"}
            />
          </div>

          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando && <Loader2 className="size-4 animate-spin" />}
            {modo === "entrar" ? "Entrar" : "Criar conta"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function traduzirErro(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("user already registered")) return "Já existe uma conta com esse e-mail.";
  if (m.includes("password") && m.includes("6")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("email") && m.includes("valid")) return "Digite um e-mail válido.";
  return mensagem;
}
