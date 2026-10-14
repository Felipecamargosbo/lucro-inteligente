/**
 * Frete, taxa fixa e comissão de um anúncio num preço qualquer, perguntados
 * ao próprio canal (o frete do Mercado Livre muda com o peso e a faixa de
 * preço — abaixo de R$ 79, de R$ 79 pra cima etc.).
 *
 * Fica em memória durante a sessão. As telas pedem com `pedirCustos` (num
 * efeito) e leem com `custosEm`; `useVersaoCustos` faz a tela redesenhar
 * quando chega resposta nova.
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
  temporizador = setTimeout(processar, 350);
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
          for (const p of parte) {
            const achado = resposta.find((r) => Math.abs(r.preco - p) < 0.005);
            cache.set(chave(anuncioId, p), achado ?? "erro");
          }
        } catch {
          for (const p of parte) cache.set(chave(anuncioId, p), "erro");
        }
        avisar();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, lote.length) }, trabalhador));
}

/** Esquece o que foi perguntado (depois de "Atualizar anúncios"). */
export function limparCustos() {
  cache.clear();
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
