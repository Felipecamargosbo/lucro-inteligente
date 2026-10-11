import { useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatBRL } from "@/lib/format";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoSenha } from "@/components/comum/CampoSenha";
import { cn } from "@/lib/utils";

type Modo = "entrar" | "cadastrar";

/** Planos que o seller pode escolher no cadastro (Black Diamond é sob consulta). */
interface PlanoCadastro {
  id: string;
  nome: string;
  preco: number;
  contas: number | null;
  iaMes: number | null;
}
const PLANOS_DO_CADASTRO = ["bronze", "silver", "gold", "platinum"];

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
  const [planos, setPlanos] = useState<PlanoCadastro[]>([]);
  const [planoEscolhido, setPlanoEscolhido] = useState("bronze");

  // Preços e limites vêm do banco (são os que você define no ADMIN).
  useEffect(() => {
    if (modo !== "cadastrar" || planos.length) return;
    supabase
      .from("planos")
      .select("id, nome, preco_mensal, contas, ia_mes, ordem")
      .in("id", PLANOS_DO_CADASTRO)
      .order("ordem")
      .then(({ data }) =>
        setPlanos(
          (data ?? []).map((p) => ({
            id: p.id as string,
            nome: p.nome as string,
            preco: Number(p.preco_mensal) || 0,
            contas: (p.contas as number | null) ?? null,
            iaMes: (p.ia_mes as number | null) ?? null,
          })),
        ),
      );
  }, [modo, planos.length]);

  async function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setEnviando(true);

    const resultado =
      modo === "entrar"
        ? await entrar(email, senha)
        : await cadastrar(email, senha, nome, planoEscolhido);

    setEnviando(false);

    if (resultado.erro) {
      toast.error(traduzirErro(resultado.erro));
      return;
    }

    if (modo === "cadastrar") {
      toast.success("Conta criada! Seu teste grátis de 7 dias começou.", {
        description: "Confirme o cadastro pelo link que enviamos para o seu e-mail.",
      });
      setModo("entrar");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className={cn("w-full space-y-6 py-8", modo === "cadastrar" ? "max-w-2xl" : "max-w-sm")}>
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
            <CampoSenha
              id="senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              autoComplete={modo === "entrar" ? "current-password" : "new-password"}
            />
          </div>

          {modo === "cadastrar" && (
            <div className="space-y-2">
              <Label>Escolha o seu plano</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {planos.map((p) => {
                  const ativo = p.id === planoEscolhido;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPlanoEscolhido(p.id)}
                      className={cn(
                        "flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors",
                        ativo ? "border-brand bg-brand/10" : "hover:bg-muted/50",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold">{p.nome}</span>
                        {ativo && <Check className="size-4 text-brand" />}
                      </span>
                      <span className="text-lg font-bold">
                        {formatBRL(p.preco)}
                        <span className="text-xs font-normal text-muted-foreground">/mês</span>
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {p.contas ? `Até ${p.contas} contas de marketplace` : ""}
                        {p.iaMes ? ` · ${p.iaMes.toLocaleString("pt-BR")} usos de IA por mês` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">7 dias grátis.</strong> Cancele dentro desse prazo e não
                paga nada. Precisa de mais de 10 contas? Fale com a gente sobre o plano Black Diamond.
              </p>
            </div>
          )}

          <Button type="submit" className="w-full" disabled={enviando}>
            {enviando && <Loader2 className="size-4 animate-spin" />}
            {modo === "entrar" ? "Entrar" : "Começar teste grátis de 7 dias"}
          </Button>
        </form>

        <p className="text-center text-xs leading-relaxed text-muted-foreground">
          {modo === "cadastrar" ? "Ao criar a conta, você concorda com os " : "Leia os "}
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
  if (m.includes("user already registered")) return "Já existe uma conta com esse e-mail.";
  if (m.includes("password") && m.includes("6")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("email") && m.includes("valid")) return "Digite um e-mail válido.";
  return mensagem;
}
