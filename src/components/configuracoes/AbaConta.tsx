import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/context/auth";
import { Painel } from "@/components/comum/Indicadores";
import { CampoSenha } from "@/components/comum/CampoSenha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Aba "Conta": o que é da PESSOA que está logada — e-mail de acesso e senha.
 *
 * O que é da LOJA (logo, nome fantasia, razão social, CNPJ) fica na aba
 * Empresa, de propósito: no dia em que a mesma loja tiver dois logins, os
 * dados da empresa são compartilhados e estes aqui são de cada um.
 */

function BotaoSalvar({ salvando, rotulo }: { salvando: boolean; rotulo: string }) {
  return (
    <Button type="submit" size="sm" disabled={salvando} className="text-xs">
      {salvando && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
      {rotulo}
    </Button>
  );
}

function traduzirErro(mensagem: string): string {
  const m = mensagem.toLowerCase();
  if (m.includes("invalid login credentials")) return "Senha atual incorreta.";
  if (m.includes("user already registered") || m.includes("already been registered"))
    return "Já existe uma conta com esse e-mail.";
  if (m.includes("password") && m.includes("6"))
    return "A senha precisa ter pelo menos 6 caracteres.";
  if (m.includes("should be different"))
    return "A senha nova precisa ser diferente da atual.";
  if (m.includes("email") && m.includes("valid")) return "Digite um e-mail válido.";
  if (m.includes("for security purposes") || m.includes("rate limit"))
    return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  return mensagem;
}

/* ------------------------------------------------------------------ */
/* E-mail de acesso                                                   */
/* ------------------------------------------------------------------ */

function PainelEmail() {
  const { sessao, trocarEmail } = useAuth();
  const emailAtual = sessao?.user.email ?? "";
  const [novoEmail, setNovoEmail] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    const limpo = novoEmail.trim().toLowerCase();

    if (!limpo) {
      toast.error("Digite o novo e-mail.");
      return;
    }
    if (limpo === emailAtual.toLowerCase()) {
      toast.error("Esse já é o seu e-mail atual.");
      return;
    }

    setSalvando(true);
    const { erro } = await trocarEmail(limpo);
    setSalvando(false);

    if (erro) {
      toast.error(traduzirErro(erro));
      return;
    }
    setNovoEmail("");
    toast.success("Confirme no e-mail novo para a troca valer.", { duration: 6000 });
  }

  return (
    <form onSubmit={enviar}>
      <Painel titulo="E-mail de acesso" descricao="O endereço que você usa para entrar">
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">E-mail atual</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-xs text-muted-foreground">
                {emailAtual || "—"}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="novo-email" className="text-xs">
                Novo e-mail
              </Label>
              <Input
                id="novo-email"
                type="email"
                value={novoEmail}
                autoComplete="email"
                onChange={(e) => setNovoEmail(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground">
            A troca não é imediata: o Supabase envia um link de confirmação para o endereço
            novo. Até você clicar nesse link, o login continua sendo o e-mail antigo.
          </p>

          <div className="flex justify-end">
            <BotaoSalvar salvando={salvando} rotulo="Trocar e-mail" />
          </div>
        </div>
      </Painel>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Senha                                                              */
/* ------------------------------------------------------------------ */

function PainelSenha() {
  const { trocarSenha } = useAuth();
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();

    if (!atual || !nova) {
      toast.error("Preencha a senha atual e a nova.");
      return;
    }
    if (nova.length < 6) {
      toast.error("A senha nova precisa ter pelo menos 6 caracteres.");
      return;
    }
    if (nova !== confirmacao) {
      toast.error("A confirmação não bate com a senha nova.");
      return;
    }
    if (nova === atual) {
      toast.error("A senha nova precisa ser diferente da atual.");
      return;
    }

    setSalvando(true);
    const { erro } = await trocarSenha(atual, nova);
    setSalvando(false);

    if (erro) {
      toast.error(traduzirErro(erro));
      return;
    }
    setAtual("");
    setNova("");
    setConfirmacao("");
    toast.success("Senha alterada.");
  }

  return (
    <form onSubmit={enviar}>
      <Painel titulo="Senha" descricao="Pede a senha atual antes de definir uma nova">
        <div className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="senha-atual" className="text-xs">
                Senha atual
              </Label>
              <CampoSenha
                id="senha-atual"
                value={atual}
                autoComplete="current-password"
                onChange={(e) => setAtual(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha-nova" className="text-xs">
                Senha nova
              </Label>
              <CampoSenha
                id="senha-nova"
                value={nova}
                autoComplete="new-password"
                onChange={(e) => setNova(e.target.value)}
                className="h-9 text-xs"
              />
              <p className="text-[10px] text-muted-foreground">Mínimo de 6 caracteres.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="senha-confirmacao" className="text-xs">
                Repita a senha nova
              </Label>
              <CampoSenha
                id="senha-confirmacao"
                value={confirmacao}
                autoComplete="new-password"
                onChange={(e) => setConfirmacao(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <BotaoSalvar salvando={salvando} rotulo="Trocar senha" />
          </div>
        </div>
      </Painel>
    </form>
  );
}

/* ------------------------------------------------------------------ */

export function AbaConta() {
  return (
    <div className="space-y-5">
      <PainelEmail />
      <PainelSenha />
    </div>
  );
}
