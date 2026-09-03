import type { Campanha, Pedido } from "@/types";

/**
 * Duas perguntas diferentes, e é importante não confundir:
 *
 * 1. "Quanto essa campanha vendeu?" — olha só os pedidos marcados com a
 *    campanha. É a prestação de contas dela.
 *
 * 2. "Valeu a pena ter feito?" — essa não dá pra responder olhando só a
 *    campanha, porque parte dessas vendas teria acontecido de qualquer jeito,
 *    só que a preço cheio. Aqui a gente compara TODAS as vendas dos SKUs da
 *    campanha, naquele canal, contra o mesmo tanto de dias imediatamente
 *    antes dela começar. A diferença de lucro é o que a campanha realmente
 *    somou (ou tirou) do bolso.
 */

/** Só as vendas que saíram pela campanha. */
export function resultadoDaCampanha(campanha: Campanha, pedidos: Pedido[]) {
  const daCampanha = pedidos.filter(
    (p) => p.campanhaId === campanha.id && p.status !== "cancelado",
  );
  const receita = daCampanha.reduce((s, p) => s + p.faturamento, 0);
  const lucro = daCampanha.reduce((s, p) => s + p.lucroLiquido, 0);
  const descontos = daCampanha.reduce((s, p) => s + p.descontos, 0);
  const unidades = daCampanha.reduce((s, p) => s + p.quantidade, 0);

  return {
    pedidos: daCampanha.length,
    unidades,
    receita,
    lucro,
    descontos,
    margem: receita ? lucro / receita : 0,
    itens: daCampanha,
  };
}

/**
 * Margem dos mesmos SKUs vendidos FORA de qualquer campanha, no mesmo canal.
 * É a referência honesta pra comparar com a margem dentro da promoção.
 */
export function margemForaDaPromocao(campanha: Campanha, pedidos: Pedido[]) {
  const fora = pedidos.filter(
    (p) =>
      !p.campanhaId &&
      p.marketplaceId === campanha.marketplaceId &&
      campanha.skus.includes(p.sku) &&
      p.status !== "cancelado",
  );
  const receita = fora.reduce((s, p) => s + p.faturamento, 0);
  const lucro = fora.reduce((s, p) => s + p.lucroLiquido, 0);
  return { pedidos: fora.length, receita, margem: receita ? lucro / receita : 0 };
}

export interface LucroIncremental {
  /** Lucro a mais (ou a menos) que a campanha trouxe no período já decorrido */
  valor: number;
  lucroDurante: number;
  lucroAntes: number;
  unidadesDiaDurante: number;
  unidadesDiaAntes: number;
  diasDecorridos: number;
  pedidosBase: number;
  /** Base de comparação pequena demais pra afirmar qualquer coisa */
  poucosDados: boolean;
  inicioBase: string;
  fimBase: string;
}

/**
 * Abaixo disso a comparação vira chute. Não é número escolhido no olho: com
 * menos de ~10 pedidos na base, a variação normal de uma semana pra outra é
 * maior que o efeito da campanha, e o resultado chega a trocar de sinal. Nesse
 * caso a tela mostra o número mas avisa que não dá pra concluir — é mais útil
 * do que afirmar com confiança uma coisa que pode estar invertida.
 */
const MINIMO_PEDIDOS_BASE = 10;

export function lucroIncremental(
  campanha: Campanha,
  pedidos: Pedido[],
  agora: Date = new Date(),
): LucroIncremental {
  const inicio = +new Date(campanha.inicio);
  // Campanha ainda ativa só pode ser medida pelo que já passou. Usar a janela
  // inteira diluiria o resultado pelos dias que ainda nem aconteceram e faria
  // toda campanha em andamento parecer pior do que é.
  const fim = Math.min(+new Date(campanha.fim), agora.getTime());
  const duracao = Math.max(fim - inicio, 86400000);
  const diasDecorridos = duracao / 86400000;

  const doEscopo = (de: number, ate: number) =>
    pedidos.filter((p) => {
      if (p.status === "cancelado") return false;
      if (p.marketplaceId !== campanha.marketplaceId) return false;
      if (!campanha.skus.includes(p.sku)) return false;
      const t = +new Date(p.data);
      return t >= de && t <= ate;
    });

  const durante = doEscopo(inicio, fim);
  const antes = doEscopo(inicio - duracao, inicio - 1);

  const lucroPorDia = (itens: Pedido[]) =>
    itens.reduce((s, p) => s + p.lucroLiquido, 0) / diasDecorridos;
  const unidadesPorDia = (itens: Pedido[]) =>
    itens.reduce((s, p) => s + p.quantidade, 0) / diasDecorridos;

  const lucroDurante = lucroPorDia(durante) * diasDecorridos;
  const lucroAntes = lucroPorDia(antes) * diasDecorridos;

  return {
    valor: lucroDurante - lucroAntes,
    lucroDurante,
    lucroAntes,
    unidadesDiaDurante: unidadesPorDia(durante),
    unidadesDiaAntes: unidadesPorDia(antes),
    diasDecorridos,
    pedidosBase: antes.length,
    poucosDados: antes.length < MINIMO_PEDIDOS_BASE,
    inicioBase: new Date(inicio - duracao).toISOString(),
    fimBase: new Date(inicio - 1).toISOString(),
  };
}

/**
 * Unidades vendidas por dia de um SKU num canal, separando o que saiu a preço
 * cheio do que saiu em promoção. É o gráfico que mostra, de olho, se a
 * campanha trouxe venda nova ou só trocou venda cheia por venda com desconto.
 */
export function historicoDoProduto(
  sku: string,
  marketplaceId: Campanha["marketplaceId"],
  pedidos: Pedido[],
  dias = 60,
  agora: Date = new Date(),
) {
  const fim = new Date(agora);
  fim.setHours(23, 59, 59, 999);
  const inicio = new Date(fim);
  inicio.setDate(fim.getDate() - (dias - 1));
  inicio.setHours(0, 0, 0, 0);

  const chave = (d: Date) => d.toISOString().slice(0, 10);
  const porDia = new Map<string, { dia: string; precoCheio: number; emPromocao: number }>();

  for (let i = 0; i < dias; i++) {
    const d = new Date(inicio);
    d.setDate(inicio.getDate() + i);
    porDia.set(chave(d), { dia: chave(d), precoCheio: 0, emPromocao: 0 });
  }

  for (const p of pedidos) {
    if (p.sku !== sku || p.marketplaceId !== marketplaceId) continue;
    if (p.status === "cancelado") continue;
    const registro = porDia.get(chave(new Date(p.data)));
    if (!registro) continue;
    if (p.campanhaId) registro.emPromocao += p.quantidade;
    else registro.precoCheio += p.quantidade;
  }

  return [...porDia.values()];
}

/**
 * Todas as campanhas em que este SKU já vendeu, da que deu mais margem para a
 * que deu menos. É a comparação que responde "em qual campanha vale a pena
 * colocar este produto" — pergunta que só faz sentido olhando o produto, não
 * dentro de uma campanha específica.
 */
export function campanhasDoProduto(
  sku: string,
  marketplaceId: Campanha["marketplaceId"],
  campanhas: Campanha[],
  pedidos: Pedido[],
) {
  return campanhas
    .filter((c) => c.marketplaceId === marketplaceId && c.skus.includes(sku))
    .map((campanha) => {
      const itens = pedidos.filter(
        (p) => p.campanhaId === campanha.id && p.sku === sku && p.status !== "cancelado",
      );
      const receita = itens.reduce((s, p) => s + p.faturamento, 0);
      const lucro = itens.reduce((s, p) => s + p.lucroLiquido, 0);
      return {
        campanha,
        pedidos: itens.length,
        unidades: itens.reduce((s, p) => s + p.quantidade, 0),
        receita,
        lucro,
        margem: receita ? lucro / receita : 0,
      };
    })
    .filter((i) => i.pedidos > 0)
    .sort((a, b) => b.margem - a.margem);
}

/** Números do SKU dentro e fora de promoção, no canal. */
export function resumoDoProduto(
  sku: string,
  marketplaceId: Campanha["marketplaceId"],
  pedidos: Pedido[],
) {
  const doSku = pedidos.filter(
    (p) => p.sku === sku && p.marketplaceId === marketplaceId && p.status !== "cancelado",
  );
  const calcular = (itens: Pedido[]) => {
    const receita = itens.reduce((s, p) => s + p.faturamento, 0);
    const lucro = itens.reduce((s, p) => s + p.lucroLiquido, 0);
    return {
      unidades: itens.reduce((s, p) => s + p.quantidade, 0),
      receita,
      lucro,
      margem: receita ? lucro / receita : 0,
    };
  };
  return {
    promocao: calcular(doSku.filter((p) => p.campanhaId)),
    precoCheio: calcular(doSku.filter((p) => !p.campanhaId)),
  };
}

/** Resultado por produto dentro de uma campanha, do que mais rendeu pro que menos. */
export function produtosDaCampanha(campanha: Campanha, pedidos: Pedido[]) {
  const daCampanha = pedidos.filter(
    (p) => p.campanhaId === campanha.id && p.status !== "cancelado",
  );

  const porSku = new Map<
    string,
    { sku: string; produto: string; pedidos: number; unidades: number; receita: number; lucro: number; descontos: number }
  >();

  for (const p of daCampanha) {
    const atual = porSku.get(p.sku) ?? {
      sku: p.sku,
      produto: p.produto,
      pedidos: 0,
      unidades: 0,
      receita: 0,
      lucro: 0,
      descontos: 0,
    };
    atual.pedidos += 1;
    atual.unidades += p.quantidade;
    atual.receita += p.faturamento;
    atual.lucro += p.lucroLiquido;
    atual.descontos += p.descontos;
    porSku.set(p.sku, atual);
  }

  return [...porSku.values()]
    .map((i) => ({ ...i, margem: i.receita ? i.lucro / i.receita : 0 }))
    .sort((a, b) => b.receita - a.receita);
}
