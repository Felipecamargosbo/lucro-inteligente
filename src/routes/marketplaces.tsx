import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Settings2, XCircle } from "lucide-react";
import { marketplacesService, vendasService } from "@/services";
import { filtrarPorPeriodo, resumir } from "@/lib/finance";
import { resolverPeriodo } from "@/lib/period";
import { formatBRL, formatNumero, formatPercentual, tempoRelativo } from "@/lib/format";
import { CardKpi, Painel } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ModalConfiguracaoMarketplace,
  type DadosConfiguracaoMarketplace,
} from "@/components/marketplaces/ModalConfiguracaoMarketplace";
import type { Marketplace, StatusConexaoMarketplace } from "@/types";

export const Route = createFileRoute("/marketplaces")({
  head: () => ({
    meta: [
      { title: "Marketplaces | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "Veja todos os seus canais de venda conectados, o status de cada integração e configure comissão, taxa fixa e frete por marketplace.",
      },
      { property: "og:title", content: "Marketplaces | NEXO Rentabilidade" },
      {
        property: "og:description",
        content: "Contas conectadas, status das APIs e configuração de taxas por canal.",
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
  const [lista, setLista] = useState<Marketplace[]>(() => marketplacesService.listar());
  const [testando, setTestando] = useState<string | null>(null);
  const [emConfiguracao, setEmConfiguracao] = useState<Marketplace | null>(null);

  const pedidos = vendasService.listar();
  const resumoMes = useMemo(
    () => resumir(filtrarPorPeriodo(pedidos, resolverPeriodo("este-mes"))),
    [pedidos],
  );

  const conectadas = lista.filter((m) => m.statusConexao !== "desconectado");
  const expirando = lista.filter((m) => m.statusConexao === "token-expirando");

  const testarConexao = (m: Marketplace) => {
    setTestando(m.id);
    setTimeout(() => {
      setTestando(null);
      if (m.statusConexao === "desconectado") {
        toast.error(`Não foi possível conectar com ${m.nome}`, {
          description: 'Cadastre a API Key em "Configurar / Taxas" antes de testar.',
        });
        return;
      }
      setLista((atual) =>
        atual.map((item) =>
          item.id === m.id
            ? {
                ...item,
                statusConexao: "conectado",
                ultimaSincronizacao: new Date().toISOString(),
              }
            : item,
        ),
      );
      toast.success(`Conexão com ${m.nome} está funcionando`, {
        description: "Sincronização atualizada agora.",
      });
    }, 900);
  };

  const salvarConfiguracao = (m: Marketplace, dados: DadosConfiguracaoMarketplace) => {
    setLista((atual) =>
      atual.map((item) =>
        item.id === m.id
          ? { ...item, ...dados, statusConexao: "conectado", conectado: true }
          : item,
      ),
    );
    toast.success(`Taxas de ${m.nome} atualizadas`, {
      description: `Comissão ${formatPercentual(dados.comissaoPercentual)} · Taxa fixa ${formatBRL(
        dados.taxaFixa,
      )} · Frete médio ${formatBRL(dados.freteMedio)}`,
    });
    setEmConfiguracao(null);
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <CardKpi
          titulo="Contas conectadas"
          valor={`${conectadas.length} de ${lista.length}`}
          detalhe="Marketplaces com integração ativa"
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
          detalhe="Somado entre todos os canais conectados"
        />
      </div>

      <Painel
        titulo="Contas conectadas"
        descricao="Status, sincronização e taxas de cada canal de venda"
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((m) => {
            const status = STATUS_META[m.statusConexao];
            const Icone = status.Icone;
            return (
              <div key={m.id} className="flex flex-col rounded-xl border p-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-[11px] font-bold uppercase text-muted-foreground">
                    {m.nome.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{m.nome}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Nexus Commerce · Loja Oficial
                    </p>
                  </div>
                </div>

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
                    <p className="num text-sm font-bold">{formatNumero(m.skusAtivos)}</p>
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                      SKUs ativos
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 py-2">
                    <p className="num text-sm font-bold">
                      {m.vendasHoje > 0 ? formatBRL(m.vendasHoje) : "—"}
                    </p>
                    <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                      Vendas hoje
                    </p>
                  </div>
                  <div className="flex flex-col items-center justify-center rounded-lg bg-muted/50 py-2">
                    <Clock className="size-3 text-muted-foreground" />
                    <p className="mt-0.5 text-[9px] text-muted-foreground">
                      {m.ultimaSincronizacao ? tempoRelativo(m.ultimaSincronizacao) : "nunca"}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 flex-1 gap-1.5 bg-brand text-[11px] text-brand-foreground hover:bg-brand/90"
                    onClick={() => setEmConfiguracao(m)}
                  >
                    <Settings2 className="size-3.5" />
                    Configurar / Taxas
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 flex-1 gap-1.5 text-[11px]"
                    disabled={testando === m.id}
                    onClick={() => testarConexao(m)}
                  >
                    <RefreshCw className={cn("size-3.5", testando === m.id && "animate-spin")} />
                    Testar Conexão
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </Painel>

      <ModalConfiguracaoMarketplace
        marketplace={emConfiguracao}
        onFechar={() => setEmConfiguracao(null)}
        onSalvar={salvarConfiguracao}
      />
    </div>
  );
}
