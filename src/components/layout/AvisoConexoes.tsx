import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, X } from "lucide-react";
import { useAuth } from "@/context/auth";
import { cn } from "@/lib/utils";
import { mercadoLivreService } from "@/services/mercadolivre";
import { diasParaVencerAutorizacao, shopeeService } from "@/services/shopee";
import { tiktokService } from "@/services/tiktok";

/**
 * Aviso na tela (1 vez por dia) quando alguma conexão com marketplace
 * precisa de ação do seller:
 *  - conta do Mercado Livre, loja da Shopee ou do TikTok Shop que precisa ser
 *    conectada de novo;
 *  - autorização da Shopee vencendo (a Shopee pede renovar a cada 365 dias):
 *    amarelo a partir de 15 dias, vermelho na última semana.
 * Novas plataformas entram aqui do mesmo jeito.
 */
type Pendencia = { texto: string; urgente: boolean };

const chaveDoDia = () => `nexo:aviso-conexoes:${new Date().toISOString().slice(0, 10)}`;

function fechadoHoje() {
  try {
    return window.localStorage.getItem(chaveDoDia()) === "1";
  } catch {
    return false;
  }
}

export function AvisoConexoes() {
  const { perfil, demonstracao } = useAuth();
  const [pendencias, setPendencias] = useState<Pendencia[]>([]);
  const [fechado, setFechado] = useState(true);

  useEffect(() => {
    if (!perfil || demonstracao) return;
    setFechado(fechadoHoje());
    let ativo = true;
    Promise.all([mercadoLivreService.listar(), shopeeService.listar(), tiktokService.listar()]).then(([ml, shopee, tiktok]) => {
      if (!ativo) return;
      const lista: Pendencia[] = [];
      for (const c of ml) {
        if (c.status !== "ativa") {
          lista.push({ texto: `Mercado Livre "${c.apelido ?? c.mlUserId}": conecte a conta de novo.`, urgente: true });
        }
      }
      for (const c of shopee) {
        const nome = c.nomeLoja ?? String(c.shopId);
        const dias = diasParaVencerAutorizacao(c);
        if (c.status !== "ativa" || (dias !== null && dias <= 0)) {
          lista.push({ texto: `Shopee "${nome}": a autorização venceu. Conecte a loja de novo.`, urgente: true });
        } else if (dias !== null && dias <= 15) {
          lista.push({
            texto: `Shopee "${nome}": a autorização vence em ${dias} dia${dias === 1 ? "" : "s"}. Renove para não parar de sincronizar.`,
            urgente: dias <= 7,
          });
        }
      }
      for (const c of tiktok) {
        if (c.status !== "ativa") {
          lista.push({ texto: `TikTok Shop "${c.nomeLoja ?? c.shopId}": conecte a loja de novo.`, urgente: true });
        }
      }
      setPendencias(lista);
    });
    return () => {
      ativo = false;
    };
  }, [perfil, demonstracao]);

  if (demonstracao || fechado || pendencias.length === 0) return null;
  const urgente = pendencias.some((p) => p.urgente);

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-2 text-sm",
        urgente ? "bg-loss text-white" : "bg-amber-400 text-black",
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-0.5">
        {pendencias.map((p) => (
          <p key={p.texto}>{p.texto}</p>
        ))}
        <Link to="/marketplaces" className="font-semibold underline underline-offset-2">
          Abrir Marketplaces
        </Link>
      </div>
      <button
        type="button"
        aria-label="Fechar aviso"
        className="rounded p-1 hover:bg-black/10"
        onClick={() => {
          try {
            window.localStorage.setItem(chaveDoDia(), "1");
          } catch {
            /* sem armazenamento: some só até recarregar */
          }
          setFechado(true);
        }}
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
