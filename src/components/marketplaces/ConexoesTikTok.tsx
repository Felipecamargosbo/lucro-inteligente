import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Link2, Loader2, RefreshCw, Unplug, XCircle } from "lucide-react";
import { Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { Button } from "@/components/ui/button";
import { tempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tiktokService, type ConexaoTikTok } from "@/services/tiktok";
import { emDemonstracao } from "@/lib/demonstracao";

const avisarDadosNovos = () => window.dispatchEvent(new Event("nexo:dados-reais"));

/**
 * Painel "Conexão real com o TikTok Shop" da tela Marketplaces.
 * - "Conectar TikTok Shop": leva o seller para autorizar a loja no TikTok.
 * - Lista as lojas conectadas (uma autorização pode trazer mais de uma loja).
 * - "Sincronizar agora": traz anúncios e vendas (roda sozinho ao conectar).
 */
export function ConexoesTikTok() {
  const [lojas, setLojas] = useState<ConexaoTikTok[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const demo = emDemonstracao();

  const sincronizar = async () => {
    setSincronizando(true);
    const id = toast.loading("Buscando anúncios e vendas no TikTok Shop…", { description: "Pode levar até 2 minutos." });
    const { erro, resumo } = await tiktokService.sincronizar();
    setSincronizando(false);
    if (erro) {
      toast.error("Não consegui sincronizar o TikTok Shop", { id, description: erro });
      return;
    }
    toast.success("Dados do TikTok Shop atualizados", { id, description: resumo });
    avisarDadosNovos();
  };

  const carregar = async () => {
    setCarregando(true);
    setLojas(await tiktokService.listar());
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
    const params = new URLSearchParams(window.location.search);
    const resultado = params.get("tiktok");
    if (resultado) {
      const detalhe = params.get("detalhe") ?? undefined;
      if (resultado === "conectado") {
        toast.success("Loja do TikTok Shop conectada!", { description: detalhe ? `Loja: ${detalhe}` : undefined });
        if (!emDemonstracao()) sincronizar();
      } else {
        toast.error("Não foi possível conectar o TikTok Shop", { description: detalhe });
      }
      params.delete("tiktok");
      params.delete("detalhe");
      const resto = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (resto ? `?${resto}` : ""));
    }
  }, []);

  const conectar = async () => {
    setConectando(true);
    const { url, erro } = await tiktokService.iniciarConexao();
    if (erro || !url) {
      setConectando(false);
      toast.error("Ainda não dá para conectar o TikTok Shop", { description: erro });
      return;
    }
    window.location.href = url;
  };

  const desconectar = async (c: ConexaoTikTok) => {
    setRemovendo(c.id);
    const erro = await tiktokService.desconectar(c.id);
    setRemovendo(null);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(`Loja ${c.nomeLoja ?? c.shopId} desconectada do NEXO`, {
      description: "Para remover também a autorização no TikTok Shop, vá na Central do Vendedor → Apps e serviços.",
    });
    carregar();
    avisarDadosNovos();
  };

  return (
    <Painel
      titulo="Conexão real com o TikTok Shop"
      descricao="Conecte sua loja pela API oficial do TikTok Shop. Você autoriza no site do TikTok; o NEXO nunca vê a sua senha."
      acoes={
        <div className="flex gap-2">
          {!demo && lojas.length > 0 && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" disabled={sincronizando} onClick={sincronizar}>
              <RefreshCw className={cn("size-3.5", sincronizando && "animate-spin")} />
              Sincronizar agora
            </Button>
          )}
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-brand text-xs text-brand-foreground hover:bg-brand/90"
            disabled={conectando}
            onClick={conectar}
          >
            {conectando ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
            Conectar TikTok Shop
          </Button>
        </div>
      }
    >
      <div className="p-5">
        {carregando ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Carregando lojas…
          </p>
        ) : lojas.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma loja do TikTok Shop conectada ainda. Clique em <strong className="text-foreground">Conectar TikTok Shop</strong>{" "}
            para começar.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lojas.map((c) => {
              const vencida = c.status !== "ativa";
              const vencendo = false;
              const dias = 0;
              return (
                <div key={c.id} className="flex flex-col gap-3 rounded-xl border p-4">
                  <div className="flex items-center gap-2.5">
                    <LogoMarketplace id="tiktok-shop" tamanho="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.nomeLoja ?? "Loja do TikTok Shop"}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        ID {c.shopId} · conectada {tempoRelativo(c.criadoEm)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      vencida
                        ? "bg-loss-soft text-loss"
                        : vencendo
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                          : "bg-profit-soft text-profit",
                    )}
                  >
                    {vencida ? (
                      <XCircle className="size-3.5" />
                    ) : vencendo ? (
                      <AlertTriangle className="size-3.5" />
                    ) : (
                      <CheckCircle2 className="size-3.5" />
                    )}
                    {vencida
                      ? "Conecte de novo"
                      : vencendo
                        ? `Autorização vence em ${dias} dia${dias === 1 ? "" : "s"}`
                        : "Conectada"}
                  </span>

                  <div className="flex gap-2">
                    {(vencida || vencendo) && (
                      <Button
                        size="sm"
                        className="h-7 flex-1 gap-1.5 bg-brand text-[11px] text-brand-foreground hover:bg-brand/90"
                        disabled={conectando}
                        onClick={conectar}
                      >
                        <RefreshCw className="size-3.5" />
                        {vencida ? "Conectar de novo" : "Renovar autorização"}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 flex-1 gap-1.5 text-[11px]"
                      disabled={removendo === c.id}
                      onClick={() => desconectar(c)}
                    >
                      {removendo === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <Unplug className="size-3.5" />}
                      Desconectar
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Painel>
  );
}
