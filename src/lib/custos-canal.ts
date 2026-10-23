/**
 * Frete, taxa fixa e comissão de um anúncio num preço qualquer, perguntados
 * ao próprio canal (o frete do Mercado Livre muda com o peso e a faixa de
 * preço — abaixo de R$ 79, de R$ 79 pra cima etc.).
 *
 * Fica em memória e também guardado no navegador por 12 horas: um preço
 * que já foi perguntado responde na hora, mesmo depois de recarregar a
 * página. As telas pedem com `pedirCustos` (num efeito) e leem com
 * `custosEm`; `useVersaoCustos` faz a tela redesenhar quando chega resposta
 * nova.
 */
import { useSyncExternalStore } from "react";
import { precosMlService, type CustosNoPreco } from "@/services";
import { emDemonstracao } from "@/lib/demonstracao";

type Entrada = CustosNoPreco | "carregando" | "erro";

const cache = new Map<string, Entrada>();
const fila = new Map<string, Set<number>>();
const ouvintes = new Set<() => void>();
let versao = 0;
let temporizador: ReturnType<typeof setTimeout> | null = null;

const chave = (anuncioId: string, preco: number) => `${anuncioId}|${preco.toFixed(2)}`;

// --- guardado no navegador --------------------------------------------------
const GUARDADO = "nexo:custos-canal:v1";
const VALIDADE_MS = 12 * 3600 * 1000;
const MAXIMO = 4000;
/** Quando cada preço foi perguntado (pra vencer depois de 12 horas). */
const quando = new Map<string, number>();
let gravarDepois: ReturnType<typeof setTimeout> | null = null;

function carregarGuardado() {
  try {
    const bruto = typeof localStorage === "undefined" ? null : localStorage.getItem(GUARDADO);
    if (!bruto) return;
    const lista = JSON.parse(bruto) as [string, CustosNoPreco, number][];
    const agora = Date.now();
    for (const [k, v, t] of lista) {
      if (agora - t < VALIDADE_MS && !cache.has(k)) {
        cache.set(k, v);
        quando.set(k, t);
      }
    }
  } catch {
    // navegador sem armazenamento: segue só com a memória
  }
}

function gravar() {
  if (gravarDepois) clearTimeout(gravarDepois);
  gravarDepois = setTimeout(() => {
    gravarDepois = null;
    try {
      const agora = Date.now();
      const lista: [string, CustosNoPreco, number][] = [];
      for (const [k, v] of cache) {
        const t = quando.get(k) ?? 0;
        if (typeof v === "object" && agora - t < VALIDADE_MS) lista.push([k, v, t]);
      }
      lista.sort((x, y) => y[2] - x[2]);
      localStorage.setItem(GUARDADO, JSON.stringify(lista.slice(0, MAXIMO)));
    } catch {
      // sem espaço ou sem armazenamento: não guarda
    }
  }, 800);
}

carregarGuardado();

function avisar() {
  versao++;
  for (const o of ouvintes) o();
}

/** Lê o que já se sabe. undefined = ainda não perguntado ou carregando. */
export function custosEm(anuncioId: string, preco: number): CustosNoPreco | null | undefined {
  const e = cache.get(chave(anuncioId, preco));
  if (e === undefined || e === "carregando") return undefined;
  if (e === "erro") return null;
  return e;
}

/** Pede ao canal os custos nesse preço (junta os pedidos e manda em lote). */
export function pedirCustos(anuncioId: string, preco: number) {
  if (emDemonstracao() || !(preco > 0)) return;
  const k = chave(anuncioId, preco);
  if (cache.has(k)) return;
  cache.set(k, "carregando");
  const precos = fila.get(anuncioId) ?? new Set<number>();
  precos.add(Math.round(preco * 100) / 100);
  fila.set(anuncioId, precos);
  if (temporizador) clearTimeout(temporizador);
  temporizador = setTimeout(processar, 120);
}

async function processar() {
  temporizador = null;
  const lote = [...fila.entries()];
  fila.clear();
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < lote.length) {
      const [anuncioId, conjunto] = lote[proximo++]!;
      const precos = [...conjunto];
      for (let i = 0; i < precos.length; i += 6) {
        const parte = precos.slice(i, i + 6);
        try {
          const resposta = await precosMlService.custos(anuncioId, parte);
          const agora = Date.now();
          for (const p of parte) {
            const achado = resposta.find((r) => Math.abs(r.preco - p) < 0.005);
            cache.set(chave(anuncioId, p), achado ?? "erro");
            if (achado) quando.set(chave(anuncioId, p), agora);
          }
          gravar();
        } catch {
          for (const p of parte) cache.set(chave(anuncioId, p), "erro");
        }
        avisar();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, lote.length) }, trabalhador));
}

/** Esquece o que foi perguntado (depois de "Atualizar anúncios"). Com o
 * anúncio, esquece só os preços dele (o "atualizar" de uma linha só). */
export function limparCustos(anuncioId?: string) {
  if (anuncioId) {
    for (const k of [...cache.keys()]) {
      if (k.startsWith(`${anuncioId}|`)) {
        cache.delete(k);
        quando.delete(k);
      }
    }
  } else {
    cache.clear();
    quando.clear();
  }
  gravar();
  avisar();
}

export function useVersaoCustos(): number {
  return useSyncExternalStore(
    (ouvir) => {
      ouvintes.add(ouvir);
      return () => ouvintes.delete(ouvir);
    },
    () => versao,
    () => versao,
  );
}
