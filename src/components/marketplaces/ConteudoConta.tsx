import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock, RefreshCw, XCircle } from "lucide-react";
import { ABAS_CANAL, type AbaCanal, type CanalMenu } from "@/config/navegacao";
import { anunciosService, contasService } from "@/services";
import { calcularCobertura } from "@/lib/finance";
import { formatNumero, formatPercentual, tempoRelativo } from "@/lib/format";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { DashboardCanal } from "@/components/marketplaces/DashboardCanal";
import { useConfiguracoes } from "@/context/configuracoes";
import { RaioXAnuncios } from "@/components/marketplaces/RaioXAnuncios";
import { PromocoesCanal } from "@/components/marketplaces/PromocoesCanal";
import { ReputacaoCanal } from "@/components/marketplaces/ReputacaoCanal";
import { PendenciasCanal } from "@/components/marketplaces/PendenciasCanal";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ContaMarketplace } from "@/types";

function StatusConexao({ conta }: { conta: ContaMarketplace }) {
  const meta = {
    conectado: { texto: "Conectado", cor: "bg-profit-soft text-profit", Icone: CheckCircle2 },
    "token-expirando": {
      texto: "Token expirando",
      cor: "bg-warning-soft text-foreground",
      Icone: AlertTriangle,
    },
    desconectado: { texto: "Desconectado", cor: "bg-loss-soft text-loss", Icone: XCircle },
  }[conta.statusConexao];
  const Icone = meta.Icone;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
        meta.cor,
      )}
    >
      <Icone className="size-3.5" />
      {meta.texto}
    </span>
  );
}

/**
 * Cabeçalho + abas (Dashboard, Raio-X, Promoções, Reputação, Pendências) de
 * UMA conta específica. Usado tanto quando o canal tem uma conta só (o
 * clique no canal já cai aqui) quanto quando tem várias (depois de escolher
 * na grade de seleção).
 */
export function ConteudoConta({
  conta,
  canal,
  voltarPara,
  voltarParams,
  voltarRotulo,
}: {
  conta: ContaMarketplace;
  canal: CanalMenu;
  /** Para onde o link "Voltar" aponta — todos os canais, ou a seleção de contas */
  voltarPara: string;
  voltarParams?: Record<string, string>;
  voltarRotulo: string;
}) {
  const [abaAtiva, setAbaAtiva] = useState<AbaCanal>("dashboard");
  const [sincronizando, setSincronizando] = useState(false);
  // Sincronizar pode inserir anúncio novo direto no array fora do React;
  // este contador vira "key" das abas abaixo, forçando remontar (e reler os
  // dados do zero) a aba que estiver aberta no momento do clique.
  const [tick, setTick] = useState(0);
  const { metasPorConta, atualizarConta } = useConfiguracoes();

  const anunciosDaConta = anunciosService.listar().filter((a) => a.contaId === conta.id);
  const cobertura = calcularCobertura(anunciosDaConta);
  const desconectado = conta.statusConexao === "desconectado";
  const outrasContasDoCanal = contasService.doCanal(canal.id).length > 1;

  const sincronizarAgora = async () => {
    setSincronizando(true);
    // Fictício: simula o tempo de uma chamada real ao marketplace. Quando a
    // API for integrada, aqui entra o "puxar" de verdade do feed de
    // LISTAGENS do canal (não o de vendas) — é dali que vem um anúncio
    // recém-publicado, mesmo sem nenhuma venda ainda.
    await new Promise((resolve) => setTimeout(resolve, 900));
    const novo = anunciosService.puxarNovoAnuncio(conta);
    atualizarConta(conta.id, { ultimaSincronizacao: new Date().toISOString() });
    setTick((t) => t + 1);
    setSincronizando(false);
    toast.success(
      novo.produtoId
        ? `1 anúncio novo encontrado: "${novo.produto}" — já vinculado ao catálogo pelo SKU.`
        : `1 anúncio novo encontrado: "${novo.produto}" — sem vínculo ainda, veja em Pendências.`,
    );
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      {/* Cabeçalho da conta */}
      <div className="rounded-xl border bg-card p-5">
        <Link
          to={voltarPara}
          params={voltarParams}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          {voltarRotulo}
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <LogoMarketplace id={conta.marketplaceId} tamanho="lg" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{conta.nome}</h2>
            <p className="truncate text-xs text-muted-foreground">
              {canal.titulo}
              {outrasContasDoCanal ? ` · ${conta.cnpj}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusConexao conta={conta} />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
              <Clock className="size-3" />
              {conta.ultimaSincronizacao
                ? `Sincronizado ${tempoRelativo(conta.ultimaSincronizacao)}`
                : "Nunca sincronizado"}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={sincronizando}
              onClick={sincronizarAgora}
            >
              <RefreshCw className={cn("size-3.5", sincronizando && "animate-spin")} />
              {sincronizando ? "Sincronizando..." : "Sincronizar agora"}
            </Button>
          </div>
        </div>

        {/* Avisos honestos sobre a confiabilidade do que será exibido */}
        <div className="mt-4 flex flex-wrap gap-2">
          {desconectado && (
            <p className="rounded-lg bg-loss-soft px-3 py-2 text-[11px] font-medium text-loss">
              Conta desconectada — os números abaixo não são atualizados desde a última
              sincronização.
            </p>
          )}
          {!desconectado && cobertura.semCusto > 0 && (
            <p className="rounded-lg bg-warning-soft px-3 py-2 text-[11px] font-medium">
              {formatNumero(cobertura.semCusto)} de {formatNumero(cobertura.total)} anúncios sem
              custo cadastrado — a margem só é calculável em{" "}
              {formatPercentual(cobertura.percentualCalculavel)} do catálogo.
            </p>
          )}
          {!desconectado && cobertura.comTaxaEstimada > 0 && (
            <p className="rounded-lg bg-muted px-3 py-2 text-[11px] font-medium text-muted-foreground">
              {formatNumero(cobertura.comTaxaEstimada)} anúncios com taxa estimada — os valores
              podem mudar até a liquidação do canal.
            </p>
          )}
          {!metasPorConta[conta.id] && (
            <p className="rounded-lg bg-muted px-3 py-2 text-[11px] font-medium text-muted-foreground">
              Sem meta de margem definida para esta conta — sem ela, só o prejuízo é sinalizado.
            </p>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex flex-wrap gap-1 border-b">
        {ABAS_CANAL.map((aba) => (
          <button
            key={aba.id}
            onClick={() => setAbaAtiva(aba.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              abaAtiva === aba.id
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {aba.titulo}
          </button>
        ))}
      </div>

      {/* Conteúdo da aba — key={tick} força reler os dados após sincronizar */}
      {abaAtiva === "dashboard" ? (
        <DashboardCanal key={tick} conta={conta} />
      ) : abaAtiva === "raio-x" ? (
        <RaioXAnuncios key={tick} conta={conta} />
      ) : abaAtiva === "promocoes" ? (
        <PromocoesCanal key={tick} conta={conta} />
      ) : abaAtiva === "reputacao" ? (
        <ReputacaoCanal key={tick} conta={conta} />
      ) : (
        <PendenciasCanal key={tick} conta={conta} />
      )}
    </div>
  );
}
