// Regras do Agente de SAC que NÃO usam IA — rodam no navegador, de graça:
// classificar a mensagem, achar o assunto, juntar perguntas repetidas e
// preencher as mensagens prontas. A IA só entra quando o seller pede uma
// resposta de pré-venda (ou um rascunho de reclamação).

import type {
  CategoriaSac,
  ConfiguracaoSac,
  MarketplaceId,
  Pedido,
  SituacaoSac,
  TicketSac,
} from "@/types";

/** Tira acento e deixa minúsculo, pra comparar palavra-chave sem erro. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const PALAVRAS_RECLAMACAO = [
  "defeito",
  "quebrad",
  "quebrou",
  "estragad",
  "nao funciona",
  "parou de funcionar",
  "pessim",
  "horrivel",
  "reclam",
  "procon",
  "reembolso",
  "dinheiro de volta",
  "veio errado",
  "veio diferente",
  "faltando",
  "enganad",
  "absurdo",
  "danificad",
  "amassad",
  "descaso",
];

const PALAVRAS_POS_VENDA = [
  "meu pedido",
  "minha compra",
  "comprei",
  "chegou",
  "nao chegou",
  "vai chegar",
  "quando chega",
  "rastreio",
  "rastreamento",
  "codigo de rastreio",
  "cade",
  "foi enviado",
  "ja enviou",
  "despach",
  "nota fiscal",
];

/**
 * Classifica a mensagem pelo texto. Reclamação vem primeiro de propósito:
 * "meu pedido chegou quebrado" é reclamação, não pós-venda.
 */
export function classificarPergunta(texto: string, pedidoId?: string | null): CategoriaSac {
  const t = normalizar(texto);
  if (PALAVRAS_RECLAMACAO.some((p) => t.includes(p))) return "reclamacao";
  if (pedidoId || PALAVRAS_POS_VENDA.some((p) => t.includes(p))) return "pos-venda";
  return "pre-venda";
}

export const ROTULO_CATEGORIA_SAC: Record<CategoriaSac, string> = {
  "pre-venda": "Pré-venda",
  "pos-venda": "Pós-venda",
  reclamacao: "Reclamação",
};

/* ------------------------------------------------------------------ */
/* Assunto da pergunta — pra achar as que se repetem                   */
/* ------------------------------------------------------------------ */

/** Assuntos que, quando se repetem, mostram que o ANÚNCIO está
 * incompleto (é informação do produto, não política da loja). */
const ASSUNTOS: { id: string; rotulo: string; palavras: string[] }[] = [
  {
    id: "compatibilidade",
    rotulo: "compatibilidade (serve em qual modelo)",
    palavras: ["serve", "compativel", "funciona com", "funciona no", "funciona na", "encaixa"],
  },
  {
    id: "medidas",
    rotulo: "tamanho e medidas",
    palavras: ["tamanho", "medida", "altura", "largura", "comprimento", "dimens", " cm", "polegada"],
  },
  { id: "voltagem", rotulo: "voltagem", palavras: ["voltagem", "bivolt", "110", "220", "tomada"] },
  { id: "cor", rotulo: "cores e modelos", palavras: ["outra cor", "cores", "qual cor", "outro modelo"] },
  { id: "material", rotulo: "material", palavras: ["material", "feito de", "tecido", "metal", "plastico"] },
  { id: "conteudo", rotulo: "o que vem na caixa", palavras: ["acompanha", "vem com", "na caixa", "inclui"] },
];

export function assuntoDaPergunta(texto: string): { id: string; rotulo: string } | null {
  const t = normalizar(texto);
  const a = ASSUNTOS.find((x) => x.palavras.some((p) => t.includes(p)));
  return a ? { id: a.id, rotulo: a.rotulo } : null;
}

/** A partir de quantas perguntas do mesmo assunto, no mesmo produto, o
 * SAC sugere completar o anúncio. */
export const MINIMO_PERGUNTAS_REPETIDAS = 3;

export interface PerguntaRepetida {
  chave: string;
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  contaId: string | null;
  anuncioId: string | null;
  assunto: string;
  quantidade: number;
  exemplos: string[];
}

/**
 * Junta as perguntas de pré-venda por produto + assunto. Quando o mesmo
 * assunto aparece `MINIMO_PERGUNTAS_REPETIDAS` vezes ou mais, o anúncio
 * provavelmente não explica aquilo — é caso pro Agente Criativo.
 */
export function perguntasRepetidas(tickets: TicketSac[]): PerguntaRepetida[] {
  const grupos = new Map<string, PerguntaRepetida>();
  for (const t of tickets) {
    if (classificarPergunta(t.pergunta, t.pedidoId) !== "pre-venda") continue;
    const assunto = assuntoDaPergunta(t.pergunta);
    if (!assunto) continue;
    const chave = `${t.sku}:${assunto.id}`;
    const g = grupos.get(chave) ?? {
      chave,
      sku: t.sku,
      produto: t.produto,
      marketplaceId: t.marketplaceId,
      contaId: t.contaId,
      anuncioId: t.anuncioId,
      assunto: assunto.rotulo,
      quantidade: 0,
      exemplos: [],
    };
    g.quantidade++;
    if (g.exemplos.length < 3) g.exemplos.push(t.pergunta);
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .filter((g) => g.quantidade >= MINIMO_PERGUNTAS_REPETIDAS)
    .sort((a, b) => b.quantidade - a.quantidade);
}

/* ------------------------------------------------------------------ */
/* Mensagens prontas de pós-venda                                      */
/* ------------------------------------------------------------------ */

/** Em que pé está o pedido: já saiu (em trânsito/entregue) ou não. */
export function situacaoDoPedido(pedido: Pedido | null | undefined): SituacaoSac | null {
  if (!pedido || pedido.status === "cancelado") return null;
  return pedido.status === "aguardando-envio" ? "pedido-nao-despachado" : "pedido-despachado";
}

export const ROTULO_SITUACAO_SAC: Record<SituacaoSac, string> = {
  "pedido-despachado": "Pedido já despachado",
  "pedido-nao-despachado": "Pedido ainda não despachado",
};

/** Os campos que dá pra usar dentro de uma mensagem pronta. */
export const CAMPOS_MODELO_SAC = ["{cliente}", "{pedido}", "{produto}", "{assinatura}"];

/** Troca {cliente}, {pedido}, {produto} e {assinatura} pelos dados reais. */
export function preencherModelo(
  texto: string,
  dados: { cliente?: string | null; pedido?: string | null; produto?: string; assinatura?: string },
): string {
  const primeiroNome = dados.cliente ? dados.cliente.split(" ")[0]! : "";
  return texto
    .replaceAll("{cliente}", primeiroNome)
    .replaceAll("{pedido}", dados.pedido ?? "")
    .replaceAll("{produto}", dados.produto ?? "")
    .replaceAll("{assinatura}", dados.assinatura ?? "")
    .replace(/ ,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Textos de partida, até o seller editar e salvar os dele. */
export const MODELOS_SAC_PADRAO: Record<SituacaoSac, string> = {
  "pedido-despachado":
    "Olá, {cliente}, tudo bem? Seu pedido {pedido} já foi despachado e está a caminho. Você pode acompanhar a entrega pelo rastreio na página do pedido. Se o prazo passar e ele não chegar, abra um chamado pelo próprio marketplace que a gente acompanha junto com você. {assinatura}",
  "pedido-nao-despachado":
    "Olá, {cliente}, tudo bem? Estamos verificando com a nossa equipe de logística o motivo de o pedido {pedido} ainda não ter sido enviado. Assim que tivermos um retorno, ou assim que ele for despachado, te avisamos por aqui. {assinatura}",
};

/* ------------------------------------------------------------------ */
/* Personalização                                                      */
/* ------------------------------------------------------------------ */

export const CONFIGURACAO_SAC_PADRAO: ConfiguracaoSac = {
  tom: "neutro",
  assinatura: "",
  politicaTroca: "",
  garantia: "",
  prazoEnvio: "",
  frasesProibidas: "",
};

/** Quantas informações da personalização o seller já preencheu. */
export function camposPreenchidosSac(c: ConfiguracaoSac): number {
  return [c.assinatura, c.politicaTroca, c.garantia, c.prazoEnvio, c.frasesProibidas].filter(
    (v) => v.trim().length > 0,
  ).length;
}

/** Frases proibidas da configuração que aparecem no texto. */
export function frasesProibidasNoTexto(texto: string, config: ConfiguracaoSac): string[] {
  const t = normalizar(texto);
  return config.frasesProibidas
    .split("\n")
    .map((f) => f.trim())
    .filter((f) => f.length > 0 && t.includes(normalizar(f)));
}
