import { useState } from "react";
import { AlertTriangle, CalendarClock, X } from "lucide-react";
import { useAuth } from "@/context/auth";
import { cn } from "@/lib/utils";

/**
 * Avisos da assinatura, sempre na própria plataforma (sem WhatsApp):
 *
 *  - Teste grátis: lembra quantos dias faltam. Nos 2 últimos dias fica em
 *    destaque.
 *  - Vencimento chegando (até 2 dias antes): aviso amarelo, uma vez por dia
 *    (o seller pode fechar e ele volta no dia seguinte).
 *  - Fatura atrasada / conta bloqueada: aviso vermelho fixo, sem fechar.
 *
 * Contas internas e de demonstração não veem nada disso. As datas e o status
 * vêm do perfil (`status_assinatura`, `teste_ate`, `proximo_vencimento`); a
 * cobrança, quando for ligada, só precisa manter esses campos em dia.
 */
const DIA = 86400000;

function diasAte(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / DIA);
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const chaveDoDia = (tipo: string) => `nexo:aviso-assinatura:${tipo}:${new Date().toISOString().slice(0, 10)}`;

function fechadoHoje(tipo: string) {
  try {
    return window.localStorage.getItem(chaveDoDia(tipo)) === "1";
  } catch {
    return false;
  }
}

export function AvisoAssinatura() {
  const { perfil, demonstracao, suporte } = useAuth();
  const [, atualizar] = useState(0);

  if (!perfil || perfil.contaInterna || demonstracao || suporte) return null;

  const status = perfil.statusAssinatura;
  let tipo: "teste" | "vencendo" | "atrasada" | "bloqueada" | null = null;
  let texto = "";
  let forte = false;

  if (status === "bloqueada") {
    tipo = "bloqueada";
    texto = "Sua conta está bloqueada por falta de pagamento. Regularize para voltar a usar o NEXO.";
    forte = true;
  } else if (status === "atrasada") {
    tipo = "atrasada";
    texto =
      "Sua fatura está em atraso. Se continuar, as funções de IA serão pausadas e depois o acesso será bloqueado.";
    forte = true;
  } else if (status === "teste") {
    const dias = diasAte(perfil.testeAte);
    if (dias !== null) {
      tipo = "teste";
      forte = dias <= 2;
      texto =
        dias <= 0
          ? `Seu teste grátis terminou hoje. A partir de agora começa a cobrança do plano ${perfil.plano}.`
          : `Teste grátis: ${dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`} (até ${dataCurta(perfil.testeAte!)}). Depois disso começa a cobrança do plano ${perfil.plano}. Se não quiser continuar, cancele antes.`;
    }
  } else if (status === "ativa") {
    const dias = diasAte(perfil.proximoVencimento);
    if (dias !== null && dias <= 2 && dias >= 0) {
      tipo = "vencendo";
      texto =
        dias === 0
          ? "Sua fatura vence hoje."
          : `Sua fatura vence em ${dias === 1 ? "1 dia" : `${dias} dias`} (${dataCurta(perfil.proximoVencimento!)}).`;
    }
  }

  if (!tipo) return null;
  const podeFechar = tipo === "teste" || tipo === "vencendo";
  if (podeFechar && fechadoHoje(tipo)) return null;

  const vermelho = tipo === "atrasada" || tipo === "bloqueada";
  const Icone = vermelho ? AlertTriangle : CalendarClock;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 text-sm",
        vermelho
          ? "bg-loss text-white"
          : forte
            ? "bg-amber-400 text-black"
            : "border-b bg-muted/60 text-muted-foreground",
      )}
    >
      <Icone className="size-4 shrink-0" />
      <p className="min-w-0 flex-1">{texto}</p>
      {podeFechar && (
        <button
          type="button"
          aria-label="Fechar aviso"
          className="rounded p-1 hover:bg-black/10"
          onClick={() => {
            try {
              window.localStorage.setItem(chaveDoDia(tipo!), "1");
            } catch {
              /* sem armazenamento: o aviso só some até recarregar */
            }
            atualizar((v) => v + 1);
          }}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
