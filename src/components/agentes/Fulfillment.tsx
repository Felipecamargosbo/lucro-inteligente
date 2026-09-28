// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useMemo, useState } from "react";
import { Check, Loader2, Mail, PackageMinus, Warehouse } from "lucide-react";
import { formatBRL, formatNumero } from "@/lib/format";
import {
  DIAS_ALVO_FULL,
  DIAS_PARADO_FULL,
  DIAS_SEGURANCA_REPOSICAO,
  resumirReposicao,
} from "@/lib/finance";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { ModalPedidoCompra } from "@/components/estoque/ModalPedidoCompra";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AlertaEstoque } from "@/types";
import type { Aba } from "./comum";
import {
  CardTopo,
  Dado,
  FrasePrazo,
  SelosVeredito,
  SeloVisto,
  itemParaCotacao,
} from "./Estoque";

/**
 * O Agente de Fulfillment (estoque dentro do Full). Duas frentes:
 * 1. Vai faltar no Full — conta o prazo de ENVIO até o centro de
 *    distribuição, diz quanto mandar do seu estoque e quanto falta comprar.
 * 2. Parado no Full — cobertura acima de 60 dias paga armazenagem mais
 *    cara; diz quanto retirar e quanto isso economiza por mês.
 * Nada é enviado nem retirado sozinho: quem decide é o seller.
 */
export function PainelFulfillment({
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
  const temDadosNovos = pendentes.some((a) => a.tipoAlerta !== undefined);

  return (
    <Painel
      titulo="Fulfillment"
      descricao="O que vai faltar no Full, quanto mandar e o que está parado lá pagando armazenagem"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Warehouse className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Agente de Fulfillment</p>
          <p className="text-[10px] text-muted-foreground">
            Conta o prazo de envio até o centro de distribuição — não envia nem retira nada sozinho
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
            rotulo="Mandar pro Full"
            valor={`${formatNumero(resumo.unidadesEnviar)} un.`}
            detalhe="Do seu estoque próprio, agora"
            cor="profit"
          />
          <CardTopo
            rotulo="Dinheiro pra comprar"
            valor={formatBRL(resumo.dinheiroNecessario)}
            detalhe="Quando o seu estoque não dá conta"
            cor="warning"
          />
          <CardTopo
            rotulo="Parado custando"
            valor={`${formatBRL(resumo.custoParadoMensal)}/mês`}
            detalhe={
              resumo.economiaMensal > 0
                ? `Retirando o excesso: economia de ${formatBRL(resumo.economiaMensal)}/mês`
                : "Armazenagem de estoque parado"
            }
            cor={resumo.custoParadoMensal > 0 ? "loss" : undefined}
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
            Verificando o estoque nos centros de distribuição...
          </div>
        )}

        {!carregando &&
          lista.map((a) =>
            a.tipoAlerta === "parado" ? (
              <CardParado key={a.id} alerta={a} aoDispensar={() => aoDispensar(a)} />
            ) : (
              <CardFaltaNoFull
                key={a.id}
                alerta={a}
                aoDispensar={() => aoDispensar(a)}
                aoCotar={() => setCotacao(a)}
              />
            ),
          )}

        {!carregando && lista.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-muted-foreground">
              {aba === "operacao"
                ? "Nada vai faltar no Full e nada está parado pagando armazenagem a mais."
                : "Nenhum alerta visto ainda."}
            </p>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        "Vai faltar" usa a venda real dos pedidos do Full nos últimos 7 dias e avisa quando o
        estoque de lá dura menos que o prazo de envio + {DIAS_SEGURANCA_REPOSICAO} dias de folga.
        "Parado" é cobertura acima de {DIAS_PARADO_FULL} dias. Prazo de envio, armazenagem e
        retirada ainda são de exemplo — quando a API do canal conectar, passam a ser reais sem
        mudar nada nesta tela.
      </div>

      <ModalPedidoCompra
        item={cotacao ? itemParaCotacao(cotacao) : null}
        quantidade={cotacao?.quantidadeComprar}
        onFechar={() => setCotacao(null)}
      />
    </Painel>
  );
}

function CardFaltaNoFull({
  alerta,
  aoDispensar,
  aoCotar,
}: {
  alerta: AlertaEstoque;
  aoDispensar: () => void;
  aoCotar: () => void;
}) {
  const urgente = (alerta.diasSemEstoque ?? 0) > 0 || alerta.diasRestantes <= 3;
  const completo = alerta.tipoAlerta !== undefined;
  const enviar = alerta.quantidadeEnviar ?? 0;
  const comprar = alerta.quantidadeComprar ?? 0;
  const pendente = alerta.status === "pendente";
  // Quando precisa comprar e não tem nada pra mandar, o prazo que conta é
  // o do fornecedor + o do envio.
  const dependeDeCompra = comprar > 0 && enviar === 0;

  return (
    <div className="px-4 py-4">
      <div className="flex gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            urgente ? "bg-loss-soft text-loss" : "bg-warning-soft text-warning",
          )}
        >
          <Warehouse className="size-3.5" />
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
            No Full, vendeu{" "}
            <strong className="text-foreground">{formatNumero(alerta.vendidoUltimos7Dias)} un.</strong>{" "}
            nos últimos 7 dias (média de {alerta.mediaDiaria.toFixed(1).replace(".", ",")}/dia). O
            estoque de lá acaba em{" "}
            <strong className={cn(urgente ? "text-loss" : "text-warning")}>
              {alerta.diasRestantes} dia{alerta.diasRestantes !== 1 ? "s" : ""}
            </strong>
            {alerta.prazoEnvioFullDias !== undefined && (
              <>
                {" "}
                e levar mercadoria até o centro de distribuição leva{" "}
                <strong className="text-foreground">{alerta.prazoEnvioFullDias} dias</strong>
                {dependeDeCompra && alerta.prazoFornecedorDias !== undefined && (
                  <>
                    {" "}
                    (mais {alerta.prazoFornecedorDias} dias do fornecedor, porque o seu estoque não
                    tem sobra pra mandar)
                  </>
                )}
              </>
            )}
            .
          </p>
          {pendente && completo && alerta.veredito !== "nao-repor" && (
            <FrasePrazo
              alerta={alerta}
              oQue={dependeDeCompra ? "Faça o pedido ao fornecedor" : "Mande a mercadoria pro Full"}
            />
          )}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
            <Dado rotulo="No Full" valor={formatNumero(alerta.estoqueAtual)} />
            {completo ? (
              <>
                <Dado
                  rotulo="Mandar agora"
                  valor={enviar > 0 ? `${formatNumero(enviar)} un.` : "—"}
                  destaque={enviar > 0 ? "profit" : undefined}
                />
                <Dado
                  rotulo="Comprar"
                  valor={comprar > 0 ? `${formatNumero(comprar)} un.` : "—"}
                  destaque={comprar > 0 ? "warning" : undefined}
                />
                <Dado
                  rotulo="Custo da compra"
                  valor={alerta.custoReposicao && alerta.custoReposicao > 0 ? formatBRL(alerta.custoReposicao) : "—"}
                />
              </>
            ) : (
              <Dado
                rotulo={`Repor pra ${alerta.diasAlvoCobertura} dias`}
                valor={`+${formatNumero(alerta.quantidadeSugerida)}`}
                destaque="profit"
              />
            )}
          </div>

          {completo && alerta.veredito !== "nao-repor" && alerta.quantidadeSugerida > 0 && (
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              O Full precisa de {formatNumero(alerta.quantidadeSugerida)} un. pra cobrir o envio +{" "}
              {alerta.diasAlvoCobertura} dias de venda (sem mandar demais, pra não pagar
              armazenagem à toa).{" "}
              {enviar > 0 &&
                `Do seu estoque próprio dá pra mandar ${formatNumero(enviar)} un. — é o que sobra depois de reservar o que ele mesmo vai vender até uma compra nova chegar. `}
              {comprar > 0 && `O resto (${formatNumero(comprar)} un.) precisa comprar do fornecedor.`}
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

          {pendente && (
            <div className="mt-3 flex flex-wrap gap-2">
              {comprar > 0 && alerta.veredito !== "nao-repor" && (
                <Button size="sm" onClick={aoCotar}>
                  <Mail className="size-3.5" />
                  Gerar cotação ({formatNumero(comprar)} un.)
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

function CardParado({
  alerta,
  aoDispensar,
}: {
  alerta: AlertaEstoque;
  aoDispensar: () => void;
}) {
  const retirar = alerta.quantidadeRetirar ?? 0;
  const custoRetirada = alerta.custoRetirada ?? 0;
  const economia = alerta.economiaMensal ?? 0;
  // Em quantos dias a economia paga o custo da retirada.
  const diasPraPagar = economia > 0 ? Math.ceil((custoRetirada / economia) * 30) : null;

  return (
    <div className="px-4 py-4">
      <div className="flex gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning">
          <PackageMinus className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeloMarketplace id={alerta.marketplaceId} />
            <span className="truncate text-xs font-medium">{alerta.produto}</span>
            <span className="num text-[10px] text-muted-foreground">{alerta.sku}</span>
            <span className="rounded bg-warning-soft px-2 py-0.5 text-[10px] font-semibold text-warning">
              Parado no Full
            </span>
            {alerta.classeAbc && (
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                Curva {alerta.classeAbc}
              </span>
            )}
            <SeloVisto alerta={alerta} />
          </div>

          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Tem <strong className="text-foreground">{formatNumero(alerta.estoqueAtual)} un.</strong> no
            Full, o bastante pra{" "}
            <strong className="text-warning">{alerta.diasRestantes} dias</strong> de venda. Acima de{" "}
            {DIAS_PARADO_FULL} dias o canal cobra a taxa de estoque parado: hoje isso custa{" "}
            <strong className="text-loss">
              {formatBRL(alerta.custoArmazenagemMensal ?? 0)} por mês
            </strong>
            .
          </p>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
            <Dado rotulo="No Full" valor={formatNumero(alerta.estoqueAtual)} />
            <Dado rotulo="Retirar" valor={`${formatNumero(retirar)} un.`} destaque="warning" />
            <Dado rotulo="Custo da retirada" valor={formatBRL(custoRetirada)} />
            <Dado rotulo="Economia por mês" valor={formatBRL(economia)} destaque="profit" />
          </div>

          <p className="mt-2 rounded-lg bg-warning-soft px-3 py-2 text-[11px] leading-relaxed text-warning">
            Sugestão: retire {formatNumero(retirar)} un. e deixe no Full só o suficiente pra{" "}
            {DIAS_ALVO_FULL} dias de venda. A retirada custa {formatBRL(custoRetirada)} e você deixa
            de pagar cerca de {formatBRL(economia)} por mês
            {diasPraPagar !== null && ` — ela se paga em uns ${diasPraPagar} dias`}. Outra saída é
            fazer uma promoção pra girar mais rápido (Agente de Precificação).
          </p>

          {alerta.status === "pendente" && (
            <div className="mt-3">
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
