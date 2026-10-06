import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, Link2, Loader2, RefreshCw, Unplug, XCircle } from "lucide-react";
import { Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { Button } from "@/components/ui/button";
import { tempoRelativo } from "@/lib/format";
import { cn } from "@/lib/utils";
import { mercadoLivreService, type ConexaoMercadoLivre } from "@/services/mercadolivre";

/**
 * Painel "Conexão real com o Mercado Livre" da tela Marketplaces.
 * - Botão "Conectar Mercado Livre": leva o seller para autorizar no ML.
 * - Lista as contas do ML já conectadas de verdade (pela API oficial).
 * - Quando o seller volta do ML, mostra o aviso de sucesso ou de erro.
 *
 * As outras contas da tela continuam com dados de exemplo até a leitura
 * dos dados reais (próximas etapas).
 */
export function ConexoesMercadoLivre() {
  const [conexoes, setConexoes] = useState<ConexaoMercadoLivre[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [conectando, setConectando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);

  const carregar = async () => {
    setCarregando(true);
    setConexoes(await mercadoLivreService.listar());
    setCarregando(false);
  };

  useEffect(() => {
    carregar();

    // Voltou do Mercado Livre? Mostra o resultado e limpa a URL.
    const params = new URLSearchParams(window.location.search);
    const resultado = params.get("ml");
    if (resultado) {
      const detalhe = params.get("detalhe") ?? undefined;
      if (resultado === "conectado") {
        toast.success("Conta do Mercado Livre conectada!", {
          description: detalhe ? `Conta: ${detalhe}` : undefined,
        });
      } else {
        toast.error("Não foi possível conectar o Mercado Livre", { description: detalhe });
      }
      params.delete("ml");
      params.delete("detalhe");
      const resto = params.toString();
      window.history.replaceState(null, "", window.location.pathname + (resto ? `?${resto}` : ""));
    }
  }, []);

  const conectar = async () => {
    setConectando(true);
    const { url, erro } = await mercadoLivreService.iniciarConexao();
    if (erro || !url) {
      setConectando(false);
      toast.error("Não foi possível iniciar a conexão", { description: erro });
      return;
    }
    // Vai para a página de autorização do Mercado Livre.
    window.location.href = url;
  };

  const desconectar = async (c: ConexaoMercadoLivre) => {
    setRemovendo(c.id);
    const erro = await mercadoLivreService.desconectar(c.id);
    setRemovendo(null);
    if (erro) {
      toast.error(erro);
      return;
    }
    toast.success(`Conta ${c.apelido ?? c.mlUserId} desconectada do NEXO`, {
      description:
        "Para remover também a autorização no Mercado Livre, vá em Minha conta → Segurança → Aplicativos conectados.",
    });
    carregar();
  };

  return (
    <Painel
      titulo="Conexão real com o Mercado Livre"
      descricao="Conecte sua conta pela API oficial do Mercado Livre. Você autoriza no site do ML; o NEXO nunca vê a sua senha."
      acoes={
        <Button
          size="sm"
          className="h-8 gap-1.5 bg-brand text-xs text-brand-foreground hover:bg-brand/90"
          disabled={conectando}
          onClick={conectar}
        >
          {conectando ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
          Conectar Mercado Livre
        </Button>
      }
    >
      <div className="p-5">
        {carregando ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Carregando conexões…
          </p>
        ) : conexoes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma conta do Mercado Livre conectada ainda. Clique em{" "}
            <strong className="text-foreground">Conectar Mercado Livre</strong> para começar.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {conexoes.map((c) => {
              const ativa = c.status === "ativa";
              return (
                <div key={c.id} className="flex flex-col gap-3 rounded-xl border p-4">
                  <div className="flex items-center gap-2.5">
                    <LogoMarketplace id="mercado-livre" tamanho="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{c.apelido ?? "Conta do Mercado Livre"}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        ID {c.mlUserId} · conectada {tempoRelativo(c.criadoEm)}
                      </p>
                    </div>
                  </div>

                  <span
                    className={cn(
                      "inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      ativa ? "bg-profit-soft text-profit" : "bg-loss-soft text-loss",
                    )}
                  >
                    {ativa ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
                    {ativa ? "Conectada" : "Conecte de novo"}
                  </span>

                  <div className="flex gap-2">
                    {!ativa && (
                      <Button
                        size="sm"
                        className="h-7 flex-1 gap-1.5 bg-brand text-[11px] text-brand-foreground hover:bg-brand/90"
                        disabled={conectando}
                        onClick={conectar}
                      >
                        <RefreshCw className="size-3.5" />
                        Conectar de novo
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 flex-1 gap-1.5 text-[11px]"
                      disabled={removendo === c.id}
                      onClick={() => desconectar(c)}
                    >
                      {removendo === c.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Unplug className="size-3.5" />
                      )}
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
