import type { TipoLogistica } from "@/types";

/**
 * Fonte única dos rótulos e cores de logística. Antes cada tela tinha o seu
 * mapa — a navegação já dizia "coleta" enquanto a tela mostrava "Padrão".
 * Toda tela nova deve importar daqui em vez de escrever o nome à mão.
 */

export const TIPOS_LOGISTICA: TipoLogistica[] = ["full", "flex", "padrao"];

/** O valor interno segue "padrao" por compatibilidade com os dados; o nome
 * exibido é "Coleta", que é como o marketplace chama (ele busca com o seller). */
export const ROTULO_LOGISTICA: Record<TipoLogistica, string> = {
  full: "Full",
  flex: "Flex",
  padrao: "Coleta",
};

/** Explicação curta, pra tooltip ou legenda. */
export const DESCRICAO_LOGISTICA: Record<TipoLogistica, string> = {
  full: "Estoque no centro de distribuição do marketplace",
  flex: "O próprio seller entrega, normalmente no mesmo dia",
  padrao: "O marketplace coleta com o seller e despacha",
};

/** Cor em CSS var, para gráficos. */
export const COR_LOGISTICA: Record<TipoLogistica, string> = {
  full: "var(--brand)",
  flex: "var(--info)",
  padrao: "var(--warning)",
};

/** Classe de fundo sólida, para pontos de legenda e barras. */
export const PONTO_LOGISTICA: Record<TipoLogistica, string> = {
  full: "bg-brand",
  flex: "bg-info",
  padrao: "bg-warning",
};

/** Classe da etiqueta usada nas listagens de pedidos. */
export const ETIQUETA_LOGISTICA: Record<TipoLogistica, string> = {
  full: "bg-brand-soft text-brand",
  flex: "bg-info-soft text-info",
  padrao: "bg-warning-soft text-foreground",
};
