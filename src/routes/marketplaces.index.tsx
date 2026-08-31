import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Settings2, XCircle } from "lucide-react";
import { vendasService } from "@/services";
import { useConfiguracoes } from "@/context/configuracoes";
import { CANAIS } from "@/config/navegacao";
import { filtrarPorPeriodo, resumir } from "@/lib/finance";
import { resolverPeriodo } from "@/lib/period";
import { formatBRL, formatNumero, formatPercentual, tempoRelativo } from "@/lib/format";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ModalConfiguracaoMarketplace,
  type DadosConfiguracaoMarketplace,
} from "@/components/marketplaces/ModalConfiguracaoMarketplace";
import type { ContaMarketplace, StatusConexaoMarketplace } from "@/types";

export const Route = createFileRoute("/marketplaces/")({
  head: () => ({
    meta: [
      { title: "Marketplaces | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "Veja todas as suas contas conectadas — inclusive quando você tem mais de uma no mesmo canal — o status de cada integração e configure comissão, taxa fixa e frete.",
      },
      { property: "og:title", content: "Marketplaces | NEXO Rentabilidade" },
      {
        property: "og:description",
        content: "Contas conectadas, status das APIs e configuração de taxas por conta.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Marketplaces,
});

const STATUS_META = {
  conectado: { texto: "Conectado", cor: "bg-profit-soft text-profit", Icone: CheckCircle2 },
  "token-expirando": {
    texto: "Token Expirando",
    cor: "bg-warning-soft text-foreground",
    Icone: AlertTriangle,
  },
  desconectado: { texto: "Desconectado", cor: "bg-loss-soft text-loss", Icone: XCircle },
} satisfies Record<StatusConexaoMarketplace, { texto: string; cor: string; Icone: typeof CheckCircle2 }>;

function Marketplaces() {
  const { contas, atualizarConta } = useConfiguracoes();
  const [testando, setTestando] = useState<string | null>(null);
  const [emConfiguracao, setEmConfiguracao] = useState<ContaMarketplace | null>(null);

  const pedidos = vendasService.listar();
  const resumoMes = useMemo(
    () => resumir(filtrarPorPeriodo(pedidos, resolverPeriodo("este-mes"))),
    [pedidos],
  );

  const conectadas = contas.filter((c) => c.statusConexao !== "desconectado");
  const expirando = contas.filter((c) => c.statusConexao === "token-expirando");

  const testarConexao = (c: ContaMarketplace) => {
    setTestando(c.id);
    setTimeout(() => {
      setTestando(null);
      if (c.statusConexao === "desconectado") {
        toast.error(`Não foi possível conectar com ${c.nome}`, {
          description: 'Cadastre a API Key em "Configurar / Taxas" antes de testar.',
        });
        return;
      }
      atualizarConta(c.id, {
        statusConexao: "conectado",
        ultimaSincronizacao: new Date().toISOString(),
      });
      toast.success(`Conexão com ${c.nome} está funcionando`, {
        description: "Sincronização atualizada agora.",
      });
    }, 900);
  };

  const salvarConfiguracao = (c: ContaMarketplace, dados: DadosConfiguracaoMarketplace) => {
    atualizarConta(c.id, { ...dados, statusConexao: "conectado", conectada: true });
    toast.success(`Taxas de ${c.nome} atualizadas`, {
      description: `Comissão ${formatPercentual(dados.comissaoPercentual)} · Taxa fixa ${formatBRL(
        dados.taxaFixa,
      )} · Frete médio ${formatBRL(dados.freteMedio)}`,
    });
    setEmConfiguracao(null);
  };

  const canalDaConta = (c: ContaMarketplace) =>
    CANAIS.find((canal) => canal.id === c.marketplaceId);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CardKpi
          titulo="Contas conectadas"
          valor={`${conectadas.length} de ${contas.length}`}
          detalhe="Somando todas as contas, mesmo repetidas no mesmo canal"
        />
        <CardKpi
          titulo="Status geral das APIs"
          valor={expirando.length > 0 ? "Atenção" : "Operacionais"}
          detalhe={
            expirando.length > 0
              ? `${expirando.length} conta(s) com token expirando`
              : "Todas as integrações sincronizando normalmente"
          }
        />
        <CardKpi
          titulo="Faturamento integrado do mês"
          valor={formatBRL(resumoMes.faturamento)}
          detalhe="Somado entre todas as contas conectadas"
        />
      </div>

      <Painel
        titulo="Contas conectadas"
        descricao="Um card por conta — inclusive quando você tem mais de uma no mesmo canal"
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {contas.map((c) => {
            const status = STATUS_META[c.statusConexao];
            const Icone = status.Icone;
            const canal = canalDaConta(c);
            return (
              <div key={c.id} className="flex flex-col rounded-xl border p-4">
                <Link
                  to="/marketplaces/$canal/$conta"
                  params={{ canal: canal?.slug ?? "", conta: c.id }}
                  className="flex items-center gap-2.5 rounded-lg -m-1 p-1 transition-colors hover:bg-muted/50"
                >
                  <LogoMarketplace id={c.marketplaceId} tamanho="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{c.nome}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {canal?.titulo ?? c.marketplaceId} · {c.cnpj}
                    </p>
                  </div>
                </Link>

                <span
                  className={cn(
                    "mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    status.cor,
                  )}
                >
                  <Icone className="size-3.5" />
                  {status.texto}
                </span>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/50 py-2">
                    <p className="num text-sm font-bold">{formatNumero(c.skusAtivos)}</p>
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                      SKUs ativos
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 py-2">
                    <p className="num text-sm font-bold">
                      {c.vendasHoje > 0 ? formatBRL(c.vendasHoje) : "—"}
                    </p>
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                      Vendas hoje
                    </p>
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-lg bg-muted/50 py-2">
                    <Clock className="size-3 text-muted-foreground" />
                    <p className="mt-0.5 text-[9px] text-muted-foreground">
                      {c.ultimaSincronizacao ? tempoRelativo(c.ultimaSincronizacao) : "nunca"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 flex-1 gap-1.5 bg-brand text-[11px] text-brand-foreground hover:bg-brand/90"
                    onClick={() => setEmConfiguracao(c)}
                  >
                    <Settings2 className="size-3.5" />
                    Configurar / Taxas
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 gap-1.5 text-[11px]"
                    disabled={testando === c.id}
                    onClick={() => testarConexao(c)}
                  >
                    <RefreshCw className={cn("size-3.5", testando === c.id && "animate-spin")} />
                    Testar Conexão
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Painel>

      <ModalConfiguracaoMarketplace
        conta={emConfiguracao}
        onFechar={() => setEmConfiguracao(null)}
        onSalvar={salvarConfiguracao}
      />
    </div>
  );
}
