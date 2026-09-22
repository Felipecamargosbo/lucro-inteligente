// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import type { SemaforoDecisao } from "@/types";

/** As duas sub-abas que quase todo agente tem: o que está esperando
 * decisão agora, e o que já foi decidido. */
export type Aba = "operacao" | "historico";

export const ESTILO_SEMAFORO: Record<SemaforoDecisao, { ponto: string; texto: string; rotulo: string }> =
  {
    verde: {
      ponto: "bg-profit",
      texto: "text-profit",
      rotulo: "Dentro da sua margem mínima",
    },
    amarelo: {
      ponto: "bg-warning",
      texto: "text-warning",
      rotulo: "Abaixo da margem mínima",
    },
    vermelho: { ponto: "bg-loss", texto: "text-loss", rotulo: "Venda com prejuízo" },
  };
