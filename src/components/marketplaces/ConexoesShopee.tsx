import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Link2, Loader2, RefreshCw, Unplug, XCircle } from "lucide-react";
import { Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { Button } from "@/components/ui/button";
import { tempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { diasParaVencerAutorizacao, shopeeService, type ConexaoShopee } from "@/services/shopee";
import { emDemonstracao } from "@/lib/demonstracao";

const avisarDadosNovos = () => window.dispatchEvent(new Event("nexo:dados-reais"));

/**
 * Painel "Conexão real com a Shopee" da tela Marketplaces.
 * - "Conectar Shopee": leva o seller para autorizar a loja na Shopee.
 * - Lista as lojas conectadas, com o prazo da autorização (a Shopee pede
 *   para o seller autorizar de novo a cada 365 dias).
 * - "Sincronizar agora": traz anúncios e vendas (roda sozinho ao conectar).
 */
export function ConexoesShopee() {
  const [lojas, setLojas] = useState<ConexaoShopee[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  // Desconectar tira a loja das telas: pede um segundo clique.
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const demo = emDemonstracao();

  const sincronizar = async () => {
    setSincronizando(true);
    const id = toast.loading("Buscando anúncios e vendas na Shopee…", { description: "Pode levar até 2 minutos." });
    const { erro, resumo } = await shopeeService.sincronizar();
    setSincronizando(false);
    if (erro) {
      toast.error("Não consegui sincronizar a Shopee", { id, description: erro });
      return;
    }
    toast.success("Dados da Shopee atualizados", { id, description: resumo });
    avisarDadosNovos();
  };

  const carregar = async () => {
    setCarregando(true);
    setLojas(await shopeeService.listar());
    setCarregando(false);
  };

  useEffect(() => {
    carregar();
    const params = new URLSearchParams(window.location.search);
    const resultado = params.get("shopee");
    if (resultado) {
      const detalhe = params.get("detalhe") ?? undefined;
      if (resultado === "conectado") {
        toast.success("Loja da Shopee conectada!", { description: detalhe ? `Loja: ${detalhe}` : undefined });
        if (!emDemonstracao()) sincronizar();
      } else {
        toast.error("Não foi possível conectar a Shopee", { description: detalhe });
      }
      params.delete("shopee");
      params.delete("detalhe");
      const resto = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (resto ? `?${resto}` : ""));
    }
  }, []);

  const conectar = async () => {
    setConectando(true);
    const { url, erro } = await shopeeService.iniciarConexao();
    if (erro || !url) {
      setConectando(false);
      toast.error("Ainda não dá para conectar a Shopee", { description: erro });
      return;
    }
    window.location.href = url;
  };

  const desconectar = async (c: ConexaoShopee) => {
    if (confirmar !== c.id) {
      setConfirmar(c.id);
      setTimeout(() => setConfirmar((v) => (v === c.id ? null : v)), 6000);
      return;
    }
    setConfirmar(null);
    setRemovendo(c.id);
    const erro = await shopeeService.desconectar(c.id);
    setRemovendo(null);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(`Loja ${c.nomeLoja ?? c.shopId} desconectada do Planeta97`, {
      description: "Para remover também a autorização na Shopee, vá na Central do Vendedor → Configurações → Parceiros.",
    });
    carregar();
    avisarDadosNovos();
  };

  return (
    <Painel
      titulo="Conexão real com a Shopee"
      descricao="Conecte sua loja pela API oficial da Shopee. Você autoriza no site da Shopee; o Planeta97 nunca vê a sua senha."
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
            Conectar Shopee
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
            Nenhuma loja da Shopee conectada ainda. Clique em <strong className="text-foreground">Conectar Shopee</strong>{" "}
            para começar.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {lojas.map((c) => {
              const dias = diasParaVencerAutorizacao(c);
              const vencida = c.status !== "ativa" || (dias !== null && dias <= 0);
              const vencendo = !vencida && dias !== null && dias <= 15;
              return (
                <div key={c.id} className="flex flex-col gap-3 rounded-xl border p-4">
                  <div className="flex items-center gap-2.5">
                    <LogoMarketplace id="shopee" tamanho="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.nomeLoja ?? "Loja da Shopee"}</p>
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
                      variant={confirmar === c.id ? "destructive" : "outline"}
                      className="h-7 flex-1 gap-1.5 text-[11px]"
                      disabled={removendo === c.id}
                      onClick={() => desconectar(c)}
                      title={confirmar === c.id ? "A loja some das telas. Se conectar de novo, ela volta." : undefined}
                    >
                      {removendo === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <Unplug className="size-3.5" />}
                      {confirmar === c.id ? "Confirmar desconexão" : "Desconectar"}
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
