// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useMemo, useState, type ReactNode } from "react";
import { Boxes, Check, Clock, Loader2, Mail } from "lucide-react";
import { formatBRL, formatNumero } from "@/lib/format";
import { DIAS_SEGURANCA_REPOSICAO, resumirReposicao } from "@/lib/finance";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { ModalPedidoCompra } from "@/components/estoque/ModalPedidoCompra";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AlertaEstoque, ItemEstoqueDetalhado, VereditoReposicao } from "@/types";
import type { Aba } from "./comum";

/* ------------------------------------------------------------------ */
/* Peças usadas também pelo painel de Fulfillment                       */
/* ------------------------------------------------------------------ */

export const ESTILO_VEREDITO: Record<VereditoReposicao, { texto: string; cor: string }> = {
  repor: { texto: "Vale repor", cor: "bg-profit-soft text-profit" },
  "repor-com-cuidado": { texto: "Repor com cuidado", cor: "bg-warning-soft text-warning" },
  "nao-repor": { texto: "Não repor agora", cor: "bg-loss-soft text-loss" },
};

/** Selo do veredito + selo da curva ABC. */
export function SelosVeredito({ alerta }: { alerta: AlertaEstoque }) {
  return (
    <>
      {alerta.veredito && (
        <span
          className={cn(
            "rounded px-2 py-0.5 text-[10px] font-semibold",
            ESTILO_VEREDITO[alerta.veredito].cor,
          )}
        >
          {ESTILO_VEREDITO[alerta.veredito].texto}
        </span>
      )}
      {alerta.classeAbc && (
        <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          Curva {alerta.classeAbc}
        </span>
      )}
    </>
  );
}

/** A frase que diz se ainda dá tempo de pedir. */
export function FrasePrazo({ alerta, oQue }: { alerta: AlertaEstoque; oQue: string }) {
  const dias = alerta.diasParaPedir;
  if (dias === undefined) return null;
  if (dias > 0) {
    return (
      <p className="mt-1 text-xs font-medium text-warning">
        {oQue} em até {dias} dia{dias !== 1 ? "s" : ""} pra não faltar.
      </p>
    );
  }
  if (dias === 0) {
    return (
      <p className="mt-1 text-xs font-medium text-loss">
        Hoje é o último dia: {oQue.toLowerCase()} hoje pra não faltar.
      </p>
    );
  }
  return (
    <p className="mt-1 text-xs font-medium text-loss">
      Já passou do ponto: mesmo fazendo isso hoje, vai ficar sem estoque por cerca de{" "}
      {alerta.diasSemEstoque} dia{alerta.diasSemEstoque !== 1 ? "s" : ""}.
    </p>
  );
}

/** Um número pequeno com rótulo, pra faixa de dados do card. */
export function Dado({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: ReactNode;
  destaque?: "profit" | "loss" | "warning";
}) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "num text-sm font-semibold",
          destaque === "profit" && "text-profit",
          destaque === "loss" && "text-loss",
          destaque === "warning" && "text-warning",
        )}
      >
        {valor}
      </p>
    </div>
  );
}

/** Um cartão do resumo do topo. */
export function CardTopo({
  rotulo,
  valor,
  detalhe,
  cor,
}: {
  rotulo: string;
  valor: string;
  detalhe?: string;
  cor?: "profit" | "loss" | "warning";
}) {
  return (
    <div className="rounded-lg bg-muted px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p
        className={cn(
          "num text-base font-bold",
          cor === "profit" && "text-profit",
          cor === "loss" && "text-loss",
          cor === "warning" && "text-warning",
        )}
      >
        {valor}
      </p>
      {detalhe && <p className="text-[10px] text-muted-foreground">{detalhe}</p>}
    </div>
  );
}

/** "visto" + quando, pros alertas do histórico. */
export function SeloVisto({ alerta }: { alerta: AlertaEstoque }) {
  if (alerta.status === "pendente") return null;
  return (
    <>
      <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        visto
      </span>
      {alerta.decididoEm && (
        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="size-3" />
          {new Date(alerta.decididoEm).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      )}
    </>
  );
}

/** Monta o item que a janela de cotação por e-mail espera, a partir do
 * alerta — assim o agente reaproveita a mesma cotação da tela de Estoque. */
export function itemParaCotacao(a: AlertaEstoque): ItemEstoqueDetalhado {
  const custo = a.custoUnitario ?? 0;
  return {
    sku: a.sku,
    produto: a.produto,
    marketplaceId: a.marketplaceId,
    quantidade: a.estoqueAtual,
    vendasDia: a.mediaDiaria,
    coberturaDias: a.diasRestantes,
    custoUnitario: custo,
    valorEstoque: Math.round(a.estoqueAtual * custo * 100) / 100,
    prazoFornecedorDias: a.prazoFornecedorDias ?? 0,
    custoArmazenagemMensal: a.custoArmazenagemMensal ?? 0,
  };
}

/* ------------------------------------------------------------------ */
/* Painel de Estoque                                                   */
/* ------------------------------------------------------------------ */

/**
 * O Agente de Estoque (estoque próprio). Responde o que a tela de Estoque
 * não responde:
 * 1. Quando pedir, contando o prazo do fornecedor — não quando já acabou.
 * 2. Se vale a pena repor (margem depois do Ads + curva ABC).
 * 3. Quanto dinheiro a reposição exige.
 * 4. Deixa a cotação por e-mail pronta pro fornecedor.
 * Ele não compra nada sozinho: quem manda a cotação é o seller.
 */
export function PainelEstoque({
  alertas,
  carregando,
  aoDispensar,
}: {
  alertas: AlertaEstoque[];
  carregando: boolean;
  aoDispensar: (a: AlertaEstoque) => void;
}) {
  const [aba, setAba] = useState<Aba>("operacao");
  const [cotacao, setCotacao] = useState<AlertaEstoque | null>(null);
  const pendentes = alertas.filter((a) => a.status === "pendente");
  const decididos = alertas.filter((a) => a.status !== "pendente");
  const lista = aba === "operacao" ? pendentes : decididos;
  const resumo = useMemo(() => resumirReposicao(alertas), [alertas]);
  const temDadosNovos = pendentes.some((a) => a.veredito !== undefined);

  return (
    <Painel
      titulo="Estoque"
      descricao="Quando pedir ao fornecedor, se vale a pena repor e quanto dinheiro isso exige"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Boxes className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Agente de Estoque</p>
          <p className="text-[10px] text-muted-foreground">
            Avisa a tempo do fornecedor entregar e deixa a cotação pronta — quem compra é você
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      {temDadosNovos && (
        <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
          <CardTopo
            rotulo="Dinheiro pra repor"
            valor={formatBRL(resumo.dinheiroNecessario)}
            detalhe="Soma das compras que o agente recomenda"
            cor="warning"
          />
          <CardTopo
            rotulo="Vale repor"
            valor={formatNumero(resumo.itensRepor + resumo.itensCuidado)}
            detalhe={
              resumo.itensCuidado > 0
                ? `${resumo.itensCuidado} com cuidado (compra menor)`
                : "produto(s)"
            }
            cor="profit"
          />
          <CardTopo
            rotulo="Não repor agora"
            valor={formatNumero(resumo.itensNaoRepor)}
            detalhe="Vendem no prejuízo: resolva o preço antes"
            cor={resumo.itensNaoRepor > 0 ? "loss" : undefined}
          />
        </div>
      )}

      <div className="flex gap-1 border-b px-4 pt-3">
        {(
          [
            ["operacao", `Operação (${pendentes.length})`],
            ["historico", `Histórico (${decididos.length})`],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
              aba === id
                ? "border-b-2 border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="divide-y">
        {carregando && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Verificando ritmo de venda e prazo dos fornecedores...
          </div>
        )}

        {!carregando &&
          lista.map((a) => (
            <CardAlertaEstoque
              key={a.id}
              alerta={a}
              aoDispensar={() => aoDispensar(a)}
              aoCotar={() => setCotacao(a)}
            />
          ))}

        {!carregando && lista.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-muted-foreground">
              {aba === "operacao"
                ? "Nenhum produto perto do ponto de pedir: dá tempo do fornecedor entregar em todos."
                : "Nenhum alerta visto ainda."}
            </p>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        O alerta sai quando o estoque que resta dura menos que o prazo do fornecedor + {DIAS_SEGURANCA_REPOSICAO} dias
        de folga. O ritmo é a venda real dos últimos 7 dias que sai do seu estoque (pedidos fora
        do Full). A quantidade, o prazo do fornecedor e o custo ainda são de exemplo — quando o
        ERP ou o marketplace conectar, passam a ser reais sem mudar nada nesta tela.
      </div>

      <ModalPedidoCompra
        item={cotacao ? itemParaCotacao(cotacao) : null}
        quantidade={cotacao?.quantidadeSugerida}
        onFechar={() => setCotacao(null)}
      />
    </Painel>
  );
}

function CardAlertaEstoque({
  alerta,
  aoDispensar,
  aoCotar,
}: {
  alerta: AlertaEstoque;
  aoDispensar: () => void;
  aoCotar: () => void;
}) {
  const urgente = (alerta.diasSemEstoque ?? 0) > 0 || alerta.diasRestantes <= 3;
  // Alerta gravado antes desta versão: mostra só o básico.
  const completo = alerta.veredito !== undefined;
  const podeCotar =
    alerta.status === "pendente" && alerta.veredito !== "nao-repor" && alerta.quantidadeSugerida > 0;

  return (
    <div className="px-4 py-4">
      <div className="flex gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            urgente ? "bg-loss-soft text-loss" : "bg-warning-soft text-warning",
          )}
        >
          <Boxes className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeloMarketplace id={alerta.marketplaceId} />
            <span className="truncate text-xs font-medium">{alerta.produto}</span>
            <span className="num text-[10px] text-muted-foreground">{alerta.sku}</span>
            <SelosVeredito alerta={alerta} />
            <SeloVisto alerta={alerta} />
          </div>

          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Vendeu <strong className="text-foreground">{formatNumero(alerta.vendidoUltimos7Dias)} un.</strong>{" "}
            nos últimos 7 dias (média de {alerta.mediaDiaria.toFixed(1).replace(".", ",")}/dia). O
            estoque acaba em{" "}
            <strong className={cn(urgente ? "text-loss" : "text-warning")}>
              {alerta.diasRestantes} dia{alerta.diasRestantes !== 1 ? "s" : ""}
            </strong>
            {alerta.prazoFornecedorDias !== undefined && (
              <>
                {" "}
                e o fornecedor leva{" "}
                <strong className="text-foreground">
                  {alerta.prazoFornecedorDias} dia{alerta.prazoFornecedorDias !== 1 ? "s" : ""}
                </strong>{" "}
                pra entregar
              </>
            )}
            .
          </p>
          {alerta.status === "pendente" && alerta.veredito !== "nao-repor" && (
            <FrasePrazo alerta={alerta} oQue="Faça o pedido ao fornecedor" />
          )}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
            <Dado rotulo="Estoque atual" valor={formatNumero(alerta.estoqueAtual)} />
            {completo ? (
              <>
                <Dado
                  rotulo="Comprar"
                  valor={
                    alerta.quantidadeSugerida > 0
                      ? `${formatNumero(alerta.quantidadeSugerida)} un.`
                      : "—"
                  }
                  destaque={alerta.quantidadeSugerida > 0 ? "profit" : undefined}
                />
                <Dado
                  rotulo="Custo da compra"
                  valor={
                    alerta.custoReposicao && alerta.custoReposicao > 0
                      ? formatBRL(alerta.custoReposicao)
                      : "—"
                  }
                />
                {alerta.margem30d !== undefined && alerta.margem30d !== null && (
                  <Dado
                    rotulo="Margem após Ads (30d)"
                    valor={`${(alerta.margem30d * 100).toFixed(1).replace(".", ",")}%`}
                    destaque={alerta.margem30d <= 0 ? "loss" : undefined}
                  />
                )}
              </>
            ) : (
              <Dado
                rotulo={`Repor pra ${alerta.diasAlvoCobertura} dias`}
                valor={`+${formatNumero(alerta.quantidadeSugerida)}`}
                destaque="profit"
              />
            )}
          </div>

          {completo && alerta.quantidadeSugerida > 0 && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              A compra cobre o prazo do fornecedor + {alerta.diasAlvoCobertura} dias de venda
              depois que a mercadoria chegar.
            </p>
          )}

          {alerta.motivoVeredito && (
            <p
              className={cn(
                "mt-2 rounded-lg px-3 py-2 text-[11px] leading-relaxed",
                alerta.veredito === "nao-repor"
                  ? "bg-loss-soft text-loss"
                  : alerta.veredito === "repor-com-cuidado"
                    ? "bg-warning-soft text-warning"
                    : "bg-profit-soft text-profit",
              )}
            >
              {alerta.motivoVeredito}
            </p>
          )}

          {alerta.status === "pendente" && (
            <div className="mt-3 flex flex-wrap gap-2">
              {podeCotar && (
                <Button size="sm" onClick={aoCotar}>
                  <Mail className="size-3.5" />
                  Gerar cotação
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={aoDispensar}>
                <Check className="size-3.5" />
                Marcar como visto
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
