// Regras do Agente Criativo que NÃO usam IA — rodam no navegador, de graça:
// limite de título por canal, palavras proibidas e a nota do anúncio atual.
// A IA só entra quando o seller clica em "Gerar conteúdo".

import type { Anuncio, ConfiguracaoCriativo, MarketplaceId } from "@/types";

/** Tira acento e deixa minúsculo, pra comparar palavra sem erro. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/* ------------------------------------------------------------------ */
/* Limite de caracteres do título, por canal                           */
/* ------------------------------------------------------------------ */

/**
 * Limite padrão do título em cada canal. Os marketplaces mudam essa regra
 * de tempos em tempos (a Amazon, por exemplo, baixou pra 75 caracteres em
 * julho de 2026), então o seller pode corrigir qualquer número na aba
 * "Regras" do Criativo — o que ele salvar vale mais que o padrão daqui.
 */
export const LIMITES_TITULO_PADRAO: Record<MarketplaceId, number> = {
  "mercado-livre": 60,
  shopee: 120,
  amazon: 75,
  magalu: 150,
  "tiktok-shop": 255,
  shein: 200,
};

/** Abaixo desta fração do limite, o título está "desperdiçando" espaço de
 * busca (ex.: 25 caracteres num canal que aceita 60). */
export const FRACAO_MINIMA_TITULO = 0.6;

export const CONFIGURACAO_CRIATIVO_PADRAO: ConfiguracaoCriativo = {
  palavrasProibidas: "",
  limitesTitulo: { ...LIMITES_TITULO_PADRAO },
};

/**
 * Palavras que os marketplaces não aceitam no TÍTULO, independente do que
 * o seller configurar: contato fora da plataforma e termos de promoção
 * (preço e frete já aparecem em outro lugar do anúncio, e o canal pode
 * pausar o anúncio por isso).
 */
export const PALAVRAS_PROIBIDAS_CANAL = [
  "frete grátis",
  "promoção",
  "oferta",
  "desconto",
  "liquidação",
  "queima de estoque",
  "whatsapp",
  "telefone",
  "instagram",
  "@",
  "www.",
  ".com",
];

/** Lista das palavras proibidas do seller (uma por linha). */
export function listaPalavrasSeller(config: ConfiguracaoCriativo): string[] {
  return config.palavrasProibidas
    .split("\n")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Quais palavras proibidas (do canal e do seller) aparecem no texto. */
export function palavrasProibidasNoTexto(
  texto: string,
  config: ConfiguracaoCriativo,
  incluirDoCanal = true,
): string[] {
  const t = normalizar(texto);
  const todas = [...(incluirDoCanal ? PALAVRAS_PROIBIDAS_CANAL : []), ...listaPalavrasSeller(config)];
  const achadas = todas.filter((p) => t.includes(normalizar(p)));
  return [...new Set(achadas)];
}

export function limiteTitulo(config: ConfiguracaoCriativo, marketplaceId: MarketplaceId): number {
  return config.limitesTitulo[marketplaceId] ?? LIMITES_TITULO_PADRAO[marketplaceId] ?? 60;
}

/* ------------------------------------------------------------------ */
/* Nota do anúncio atual                                               */
/* ------------------------------------------------------------------ */

export interface ItemNotaAnuncio {
  /** true = ok, false = problema, null = sem dado pra avaliar (não conta) */
  ok: boolean | null;
  texto: string;
  peso: number;
}

export interface NotaAnuncio {
  /** 0 a 10, com uma casa decimal */
  nota: number;
  itens: ItemNotaAnuncio[];
}

/**
 * Nota de 0 a 10 do anúncio como ele está hoje — sem IA, só com o que o
 * NEXO já sabe. Sem a API, o NEXO não enxerga a descrição publicada; por
 * isso a nota olha o título, se existe ficha, a conversão do Ads e as
 * perguntas repetidas no SAC. Item sem dado (ex.: anúncio sem Ads) não
 * entra na conta, em vez de puxar a nota pra baixo.
 */
export function notaDoAnuncio(p: {
  titulo: string;
  marketplaceId: MarketplaceId;
  config: ConfiguracaoCriativo;
  temFicha: boolean;
  anuncio: Anuncio | null;
  perguntasRepetidas: number;
}): NotaAnuncio {
  const limite = limiteTitulo(p.config, p.marketplaceId);
  const tamanho = p.titulo.trim().length;
  const proibidas = palavrasProibidasNoTexto(p.titulo, p.config);
  const itens: ItemNotaAnuncio[] = [];

  itens.push({
    ok: tamanho <= limite,
    texto:
      tamanho <= limite
        ? `Título dentro do limite do canal (${tamanho} de ${limite} caracteres)`
        : `Título passa do limite do canal (${tamanho} de ${limite} caracteres) — o canal corta ou recusa`,
    peso: 2,
  });

  const minimo = Math.round(limite * FRACAO_MINIMA_TITULO);
  itens.push({
    ok: tamanho >= minimo,
    texto:
      tamanho >= minimo
        ? "Título aproveita bem o espaço pra palavras de busca"
        : `Título curto (${tamanho} caracteres): sobra espaço pra palavra de busca — o ideal é passar de ${minimo}`,
    peso: 2,
  });

  itens.push({
    ok: proibidas.length === 0,
    texto:
      proibidas.length === 0
        ? "Sem palavra proibida no título"
        : `Palavra proibida no título: ${proibidas.map((x) => `"${x}"`).join(", ")}`,
    peso: 2,
  });

  itens.push({
    ok: p.temFicha,
    texto: p.temFicha
      ? "Tem ficha do produto — a IA escreve com base nela"
      : "Sem ficha do produto — a IA não tem de onde tirar as características",
    peso: 2,
  });

  const ads = p.anuncio?.ads ?? null;
  if (ads && ads.cliques >= 30) {
    const conversao = ads.vendasAtribuidas / ads.cliques;
    const ok = conversao >= 0.01;
    itens.push({
      ok,
      texto: ok
        ? `Conversão do Ads saudável (${(conversao * 100).toFixed(1).replace(".", ",")}% dos cliques viram venda)`
        : `Conversão do Ads baixa: ${ads.cliques} cliques e ${ads.vendasAtribuidas} venda(s) — o anúncio atrai, mas não convence`,
      peso: 1,
    });
  } else {
    itens.push({ ok: null, texto: "Conversão: sem cliques de Ads suficientes pra avaliar", peso: 1 });
  }

  itens.push({
    ok: p.perguntasRepetidas === 0,
    texto:
      p.perguntasRepetidas === 0
        ? "Clientes não estão repetindo perguntas sobre o produto"
        : `${p.perguntasRepetidas} assunto(s) que os clientes perguntam repetido no SAC — falta informação no anúncio`,
    peso: 1,
  });

  const contam = itens.filter((i) => i.ok !== null);
  const total = contam.reduce((s, i) => s + i.peso, 0);
  const pontos = contam.filter((i) => i.ok).reduce((s, i) => s + i.peso, 0);
  const nota = total > 0 ? Math.round((pontos / total) * 100) / 10 : 0;
  return { nota, itens };
}

/** Cor da nota: verde a partir de 8, amarelo de 5 a 8, vermelho abaixo. */
export function corDaNota(nota: number): "profit" | "warning" | "loss" {
  if (nota >= 8) return "profit";
  if (nota >= 5) return "warning";
  return "loss";
}
