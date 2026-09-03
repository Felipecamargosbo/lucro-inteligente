// Dados FICTÍCIOS usados apenas para demonstrar a interface.
// Nenhuma conexão real com marketplaces existe neste protótipo.
// Quando as APIs forem integradas, basta trocar a origem em src/services.

import type {
  AlteracaoPreco,
  Campanha,
  ContaMarketplace,
  Anuncio,
  CanalNotificacao,
  CanalRecuperacao,
  ItemEstoque,
  ItemEstoqueDetalhado,
  LogAlteracao,
  Marketplace,
  MarketplaceId,
  Notificacao,
  OportunidadeRecuperacao,
  Pedido,
  Produto,
  Promocao,
  OrigemCampanha,
  StatusOportunidadeRecuperacao,
  StatusPedido,
  TipoCampanha,
  TipoLogistica,
  TipoOportunidadeRecuperacao,
  Usuario,
} from "@/types";

/** Gerador pseudoaleatório com semente: os dados são sempre os mesmos. */
function criarRandom(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

export const MARKETPLACES: Marketplace[] = [
  { id: "mercado-livre", nome: "Mercado Livre" },
  { id: "shopee", nome: "Shopee" },
  { id: "amazon", nome: "Amazon" },
  { id: "magalu", nome: "Magalu" },
  { id: "tiktok-shop", nome: "TikTok Shop" },
  { id: "shein", nome: "Shein" },
];

/**
 * Contas do seller. O Mercado Livre aparece com três contas de propósito:
 * é o caso real de quem tem loja oficial, outlet e um CNPJ separado, e é
 * onde a maioria das ferramentas falha ao somar tudo como se fosse um só.
 */
export const CONTAS: ContaMarketplace[] = [
  {
    id: "ml-oficial",
    marketplaceId: "mercado-livre",
    nome: "Loja Oficial",
    cnpj: "42.918.774/0001-06",
    conectada: true,
    statusConexao: "conectado",
    ultimaSincronizacao: new Date(Date.now() - 8 * 60000).toISOString(),
    skusAtivos: 342,
    vendasHoje: 18420.5,
    comissaoPercentual: 0.16,
    taxaFixa: 6.75,
    freteMedio: 22.9,
    metas: { margemMinima: 0.12, margemIdeal: 0.22 },
    reputacao: {
      nivel: "excelente",
      rotuloCanal: "MercadoLíder Platinum",
      taxaAtraso: 0.008,
      taxaCancelamento: 0.004,
      taxaReclamacao: 0.006,
      limiteAtraso: 0.15,
      limiteCancelamento: 0.02,
      alerta: null,
    },
  },
  {
    id: "ml-outlet",
    marketplaceId: "mercado-livre",
    nome: "Outlet",
    cnpj: "42.918.774/0001-06",
    conectada: true,
    statusConexao: "conectado",
    ultimaSincronizacao: new Date(Date.now() - 34 * 60000).toISOString(),
    skusAtivos: 118,
    vendasHoje: 4310,
    comissaoPercentual: 0.16,
    taxaFixa: 6.75,
    freteMedio: 21.5,
    metas: { margemMinima: 0.06, margemIdeal: 0.14 },
    reputacao: {
      nivel: "bom",
      rotuloCanal: "MercadoLíder",
      taxaAtraso: 0.019,
      taxaCancelamento: 0.009,
      taxaReclamacao: 0.012,
      limiteAtraso: 0.15,
      limiteCancelamento: 0.02,
      alerta: null,
    },
  },
  {
    id: "ml-pecas",
    marketplaceId: "mercado-livre",
    nome: "Peças e Acessórios",
    cnpj: "51.207.663/0001-40",
    conectada: true,
    statusConexao: "token-expirando",
    ultimaSincronizacao: new Date(Date.now() - 5 * 3600000).toISOString(),
    skusAtivos: 87,
    vendasHoje: 1980,
    comissaoPercentual: 0.185,
    taxaFixa: 6.75,
    freteMedio: 19.4,
    metas: null,
    reputacao: {
      nivel: "regular",
      rotuloCanal: null,
      taxaAtraso: 0.041,
      taxaCancelamento: 0.017,
      taxaReclamacao: 0.023,
      limiteAtraso: 0.15,
      limiteCancelamento: 0.02,
      alerta: "Token expira em 2 dias — renove para não perder a sincronização.",
    },
  },
  {
    id: "shopee-principal",
    marketplaceId: "shopee",
    nome: "Loja Principal",
    cnpj: "42.918.774/0001-06",
    conectada: true,
    statusConexao: "conectado",
    ultimaSincronizacao: new Date(Date.now() - 52 * 60000).toISOString(),
    skusAtivos: 298,
    vendasHoje: 9870,
    comissaoPercentual: 0.2,
    taxaFixa: 4,
    freteMedio: 18.5,
    metas: { margemMinima: 0.1, margemIdeal: 0.2 },
    reputacao: {
      nivel: "bom",
      rotuloCanal: "Loja Preferida",
      taxaAtraso: 0.031,
      taxaCancelamento: 0.011,
      taxaReclamacao: 0.014,
      limiteAtraso: 0.05,
      limiteCancelamento: 0.02,
      alerta: null,
    },
  },
  {
    id: "amazon-br",
    marketplaceId: "amazon",
    nome: "Nexus BR",
    cnpj: "42.918.774/0001-06",
    conectada: true,
    statusConexao: "conectado",
    ultimaSincronizacao: new Date(Date.now() - 21 * 60000).toISOString(),
    skusAtivos: 210,
    vendasHoje: 11230,
    comissaoPercentual: 0.15,
    taxaFixa: 5.5,
    freteMedio: 19.9,
    metas: { margemMinima: 0.14, margemIdeal: 0.25 },
    reputacao: {
      nivel: "regular",
      rotuloCanal: null,
      taxaAtraso: 0.038,
      taxaCancelamento: 0.019,
      taxaReclamacao: 0.021,
      limiteAtraso: 0.04,
      limiteCancelamento: 0.025,
      alerta: "Taxa de atraso a 0,2 p.p. do limite da conta.",
    },
  },
  {
    id: "magalu-principal",
    marketplaceId: "magalu",
    nome: "Loja Magalu",
    cnpj: "42.918.774/0001-06",
    conectada: true,
    statusConexao: "token-expirando",
    ultimaSincronizacao: new Date(Date.now() - 3 * 3600000).toISOString(),
    skusAtivos: 156,
    vendasHoje: 4120,
    comissaoPercentual: 0.18,
    taxaFixa: 5,
    freteMedio: 20,
    metas: null,
    reputacao: {
      nivel: "em-risco",
      rotuloCanal: "Selo Prata",
      taxaAtraso: 0.062,
      taxaCancelamento: 0.028,
      taxaReclamacao: 0.033,
      limiteAtraso: 0.05,
      limiteCancelamento: 0.02,
      alerta: "Atraso e cancelamento acima do limite — risco de perda do selo.",
    },
  },
  {
    id: "tiktok-principal",
    marketplaceId: "tiktok-shop",
    nome: "Nexus Live",
    cnpj: "42.918.774/0001-06",
    conectada: false,
    statusConexao: "desconectado",
    ultimaSincronizacao: null,
    skusAtivos: 0,
    vendasHoje: 0,
    comissaoPercentual: 0.14,
    taxaFixa: 3.5,
    freteMedio: 15,
    metas: { margemMinima: 0.08, margemIdeal: 0.18 },
    reputacao: null,
  },
  {
    id: "shein-principal",
    marketplaceId: "shein",
    nome: "Loja Shein",
    cnpj: "42.918.774/0001-06",
    conectada: false,
    statusConexao: "desconectado",
    ultimaSincronizacao: null,
    skusAtivos: 0,
    vendasHoje: 0,
    comissaoPercentual: 0.16,
    taxaFixa: 3,
    freteMedio: 12,
    metas: null,
    reputacao: null,
  },
];

/**
 * Espelho mutável de CONTAS. As telas leem e editam as contas através do
 * ConfiguracoesProvider (estado do React), mas as decisões de navegação
 * (ex.: "este canal tem 1 conta só, pula a seleção") rodam no loader das
 * rotas, fora da árvore de componentes — sem acesso a hooks/contexto. Este
 * espelho é a ponte: toda vez que o contexto cria ou edita uma conta, ele
 * atualiza aqui também, e os loaders sempre leem daqui, nunca de CONTAS
 * diretamente.
 */
let contasAtuais: ContaMarketplace[] = CONTAS;

export const obterContasAtuais = () => contasAtuais;

export const definirContasAtuais = (novas: ContaMarketplace[]) => {
  contasAtuais = novas;
};

export const contasDoCanal = (id: MarketplaceId) =>
  contasAtuais.filter((c) => c.marketplaceId === id);

export const getConta = (id: string) => contasAtuais.find((c) => c.id === id);

/** Contas com alguma integração ativa (conectada ou com token expirando). */
export const CONTAS_ATIVAS = CONTAS.filter(
  (c) => c.statusConexao !== "desconectado",
);

export const getMarketplace = (id: MarketplaceId) =>
  MARKETPLACES.find((m) => m.id === id)!;

/** Semente de produto usada só para gerar pedidos/anúncios fictícios — não
 * confundir com o Produto do catálogo (@/types), que é o que o seller edita. */
interface ProdutoSeed {
  sku: string;
  nome: string;
  preco: number;
  cmv: number;
}

export const PRODUTOS: ProdutoSeed[] = [
  { sku: "SW-X-BLK-001", nome: "Smartwatch Series X Titanium Black", preco: 499.9, cmv: 212 },
  { sku: "AU-G3-2026", nome: "Fone Bluetooth Cancelamento de Ruído G3", preco: 289, cmv: 118 },
  { sku: "PWR-GAN-65W", nome: "Carregador Turbo 65W GaN", preco: 189.9, cmv: 74 },
  { sku: "HUB-USBC-7X1", nome: "Hub USB-C 7 em 1 Alumínio", preco: 249.9, cmv: 96 },
  { sku: "PEL-IP15-PM", nome: "Película de Vidro iPhone 15 Pro Max", preco: 39.9, cmv: 8.5 },
  { sku: "CAD-ERG-PRO", nome: "Cadeira Gamer Ergonômica Pro", preco: 1290, cmv: 640 },
  { sku: "TEC-MEC-RGB", nome: "Teclado Mecânico RGB 75%", preco: 359, cmv: 148 },
  { sku: "MON-27-QHD", nome: "Monitor 27'' QHD 165Hz", preco: 1599, cmv: 890 },
  { sku: "CAM-WEB-4K", nome: "Webcam 4K com Microfone Duplo", preco: 429, cmv: 190 },
  { sku: "SSD-1TB-NVME", nome: "SSD NVMe 1TB Gen4", preco: 549, cmv: 288 },
  { sku: "LUM-RING-18", nome: "Ring Light 18'' com Tripé", preco: 219.9, cmv: 82 },
  { sku: "MOU-SF-2K", nome: "Mouse Sem Fio Silencioso 2.4G", preco: 89.9, cmv: 27 },
];

/** Gera um EAN-13 fictício, determinístico pelo índice — só para demonstrar
 * o auto-vínculo por código de barras. Não é um EAN real/válido. */
function gerarEanFicticio(indice: number): string {
  const base = `789${String(1000000 + indice * 37).padStart(9, "0")}`;
  return base.slice(0, 13);
}

/**
 * Catálogo do seller — fonte única do CMV. No protótipo nasce a partir dos
 * mesmos itens usados para gerar pedidos e anúncios; no futuro será cadastro
 * do próprio seller (manual ou puxado do marketplace por SKU/EAN).
 */
export const PRODUTOS_CATALOGO: Produto[] = PRODUTOS.map((p, i) => ({
  id: `prod-${p.sku.toLowerCase()}`,
  sku: p.sku,
  ean: gerarEanFicticio(i),
  nome: p.nome,
  cmv: p.cmv,
}));

const CLIENTES = [
  "Ana Beatriz Souza",
  "Carlos Eduardo Lima",
  "Juliana Ferreira",
  "Marcos Vinícius Rocha",
  "Patrícia Gomes",
  "Rafael Andrade",
  "Tatiane Moreira",
  "Bruno Carvalho",
  "Letícia Nunes",
  "Diego Martins",
];

const STATUS: StatusPedido[] = [
  "entregue",
  "entregue",
  "entregue",
  "em-transito",
  "aguardando-envio",
  "cancelado",
];

const IMPOSTO_PADRAO = 0.1;
const DIAS_HISTORICO = 120;

/**
 * Distribuição aproximada de faturamento e-commerce por estado no Brasil —
 * pesos relativos, não percentuais oficiais. Usada só para sortear a UF de
 * entrega de cada pedido fictício de forma realista (SP e Sudeste concentram
 * a maior parte do volume, o resto se espalha proporcionalmente ao tamanho
 * de cada mercado regional).
 */
const ESTADOS_PESO: [string, number][] = [
  ["SP", 30], ["RJ", 11], ["MG", 10], ["RS", 6], ["PR", 6], ["SC", 5],
  ["BA", 5], ["GO", 4], ["PE", 3], ["CE", 3], ["DF", 3], ["ES", 2],
  ["PA", 2], ["MT", 1.5], ["MA", 1.3], ["AM", 1.2], ["RN", 1.2],
  ["PB", 1], ["MS", 1], ["AL", 0.9], ["PI", 0.9], ["SE", 0.7],
  ["RO", 0.6], ["TO", 0.5], ["AC", 0.35], ["AP", 0.3], ["RR", 0.25],
];
const TOTAL_PESO_ESTADOS = ESTADOS_PESO.reduce((soma, [, peso]) => soma + peso, 0);

function escolherEstado(rand: () => number): string {
  let alvo = rand() * TOTAL_PESO_ESTADOS;
  for (const [uf, peso] of ESTADOS_PESO) {
    alvo -= peso;
    if (alvo <= 0) return uf;
  }
  return "SP";
}

/**
 * Prazo aproximado (em dias corridos) que cada marketplace leva para
 * repassar ao seller o valor de uma venda já entregue. Varia de canal para
 * canal — é por isso que "recebível previsto" precisa olhar canal a canal,
 * não só somar tudo com o mesmo prazo.
 */
const DIAS_REPASSE: Record<MarketplaceId, number> = {
  "mercado-livre": 14,
  shopee: 7,
  amazon: 14,
  magalu: 30,
  "tiktok-shop": 15,
  shein: 20,
};

/** Probabilidade de um pedido do canal ter ido via Full (estoque no centro de
 * distribuição do marketplace) em vez de despachado pelo próprio seller
 * (Flex ou Padrão). */
const PROB_FULL: Record<MarketplaceId, number> = {
  "mercado-livre": 0.62,
  shopee: 0.38,
  amazon: 0.78,
  magalu: 0.45,
  "tiktok-shop": 0.3,
  shein: 0.25,
};

/** Dos pedidos que não foram Full, chance de terem ido via Flex (o próprio
 * seller entrega, geralmente no mesmo dia) em vez de Padrão (Correios ou
 * transportadora comum). */
const PROB_FLEX_SE_NAO_FULL = 0.4;

const MOTIVOS_DEVOLUCAO = [
  "Produto com defeito",
  "Arrependimento da compra",
  "Produto diferente do anunciado",
  "Entrega com atraso",
  "Item incompleto",
];

/* ------------------------------------------------------------------ */
/* Campanhas de promoção                                              */
/* ------------------------------------------------------------------ */

interface CampanhaSeed {
  id: string;
  nome: string | null;
  marketplaceId: MarketplaceId;
  tipo: TipoCampanha;
  origem: OrigemCampanha;
  /** Início da vigência, em dias atrás a partir de hoje */
  inicioDiasAtras: number;
  /** Fim da vigência em dias atrás; negativo = termina no futuro (campanha ativa) */
  fimDiasAtras: number;
  skus: string[];
  descontoPercentual: number;
  /**
   * Quanto a campanha REALMENTE multiplica o volume dos SKUs dela. É o número
   * que separa campanha boa de desconto jogado fora: 1.6 = trouxe venda nova;
   * 1.0 = você só deu desconto pra quem compraria de qualquer jeito. Existe
   * aqui pra a análise de lucro incremental ter um sinal honesto pra medir —
   * com a API conectada, isso vem da comparação com o período anterior real.
   */
  lift: number;
  /** Fração das vendas dos SKUs no período que sai pela campanha */
  adesao: number;
}

const CAMPANHAS_SEED: CampanhaSeed[] = [
  {
    id: "P-MLB1789042",
    nome: "Semana do Consumidor",
    marketplaceId: "mercado-livre",
    tipo: "oferta",
    origem: "nexo",
    inicioDiasAtras: 12,
    fimDiasAtras: -5,
    skus: ["SW-X-BLK-001", "AU-G3-2026", "PWR-GAN-65W"],
    descontoPercentual: 0.12,
    lift: 1.65,
    adesao: 0.8,
  },
  {
    id: "P-MLB1774218",
    nome: "Queima de Estoque",
    marketplaceId: "mercado-livre",
    tipo: "oferta-inteligente",
    origem: "nexo",
    inicioDiasAtras: 35,
    fimDiasAtras: 20,
    skus: ["HUB-USBC-7X1", "TEC-MEC-RGB", "LUM-RING-18"],
    descontoPercentual: 0.18,
    lift: 1.15,
    adesao: 0.85,
  },
  {
    // Entrou direto no painel do canal, sem passar por aqui: o marketplace
    // não devolve o nome, então a tela mostra o id + "entrou sem análise".
    id: "P-SHP0093117",
    nome: null,
    marketplaceId: "shopee",
    tipo: "oferta",
    origem: "externa",
    inicioDiasAtras: 60,
    fimDiasAtras: 45,
    skus: ["PEL-IP15-PM", "MOU-SF-2K"],
    descontoPercentual: 0.22,
    lift: 1.05,
    adesao: 0.9,
  },
  {
    id: "P-AMZ0041920",
    nome: "Frete Grátis Ampliado",
    marketplaceId: "amazon",
    tipo: "oferta",
    origem: "nexo",
    inicioDiasAtras: 8,
    fimDiasAtras: -12,
    skus: ["SSD-1TB-NVME", "CAM-WEB-4K"],
    descontoPercentual: 0.08,
    lift: 1.4,
    adesao: 0.7,
  },
  {
    id: "P-MGL0007745",
    nome: "Cupom Primeira Compra",
    marketplaceId: "magalu",
    tipo: "cupom",
    origem: "nexo",
    inicioDiasAtras: 28,
    fimDiasAtras: 14,
    skus: ["MON-27-QHD", "CAD-ERG-PRO"],
    descontoPercentual: 0.1,
    lift: 1.25,
    adesao: 0.6,
  },
  {
    // O caso didático: desconto permanente que não traz volume nenhum.
    id: "P-MLB1801556",
    nome: null,
    marketplaceId: "mercado-livre",
    tipo: "equiparacao-preco",
    origem: "externa",
    inicioDiasAtras: 20,
    fimDiasAtras: -10,
    skus: ["MOU-SF-2K"],
    descontoPercentual: 0.15,
    lift: 1,
    adesao: 0.95,
  },
];

function construirCampanhas(): Campanha[] {
  const hoje = new Date();
  return CAMPANHAS_SEED.map((s) => {
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - s.inicioDiasAtras);
    inicio.setHours(0, 0, 0, 0);

    const fim = new Date(hoje);
    fim.setDate(hoje.getDate() - s.fimDiasAtras);
    fim.setHours(23, 59, 59, 999);

    return {
      id: s.id,
      nome: s.nome,
      marketplaceId: s.marketplaceId,
      tipo: s.tipo,
      status: fim.getTime() >= hoje.getTime() ? "ativa" : "encerrada",
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      origem: s.origem,
      skus: s.skus,
      descontoPercentual: s.descontoPercentual,
    } satisfies Campanha;
  });
}

export const CAMPANHAS: Campanha[] = construirCampanhas();

export const getCampanha = (id: string | null) =>
  id ? CAMPANHAS.find((c) => c.id === id) : undefined;

/** Nome pra exibir quando o canal não devolveu o nome da campanha. */
export const rotuloCampanha = (campanha: Campanha) => campanha.nome ?? campanha.id;

const PARAMETROS_CAMPANHA = new Map(
  CAMPANHAS_SEED.map((s) => [s.id, { lift: s.lift, adesao: s.adesao }]),
);

/** Campanha vigente para este SKU, neste canal, nesta data. */
function campanhaVigente(sku: string, marketplaceId: MarketplaceId, data: Date) {
  const t = data.getTime();
  return CAMPANHAS.find(
    (c) =>
      c.marketplaceId === marketplaceId &&
      c.skus.includes(sku) &&
      t >= +new Date(c.inicio) &&
      t <= +new Date(c.fim),
  );
}

function gerarPedidos(): Pedido[] {
  const rand = criarRandom(20260821);
  const pedidos: Pedido[] = [];
  const hoje = new Date();

  /** Monta um pedido. `campanha` vem preenchida quando a venda saiu por uma
   * promoção — é o que liga a tela de Vendas à de Resultados. */
  const criarPedido = (
    produto: ProdutoSeed,
    conta: ContaMarketplace,
    data: Date,
    campanha: Campanha | undefined,
  ): Pedido => {
      const quantidade = rand() > 0.82 ? 2 : 1;
      // Em campanha o desconto é o da campanha; fora dela, o seller ainda pode
      // ter dado um desconto pontual no anúncio.
      const desconto = campanha
        ? Math.round(produto.preco * campanha.descontoPercentual * 100) / 100
        : rand() > 0.7
          ? Math.round(produto.preco * 0.05 * 100) / 100
          : 0;
      const precoUnitario = Math.round((produto.preco - desconto) * 100) / 100;
      const faturamento = Math.round(precoUnitario * quantidade * 100) / 100;
      const cmv = Math.round(produto.cmv * quantidade * 100) / 100;
      const comissao = Math.round(faturamento * conta.comissaoPercentual * 100) / 100;
      const taxaFixa = conta.taxaFixa;
      const impostos = Math.round(faturamento * IMPOSTO_PADRAO * 100) / 100;
      const outrosCustos = Math.round((2 + rand() * 12) * 100) / 100;
      // ~40% dos pedidos vêm de um clique de anúncio patrocinado. Dois SKUs
      // são de propósito "gastões" de ADS — pra você ver a tela de "mídia
      // sem retorno" com exemplo real antes de conectar a API de anúncios.
      const SKUS_ADS_SEM_RETORNO = ["CAD-ERG-PRO", "MOU-SF-2K"];
      const ehSkuProblematico = SKUS_ADS_SEM_RETORNO.includes(produto.sku);
      const investeMidia = ehSkuProblematico ? rand() > 0.25 : rand() > 0.6;
      const custoMidia = investeMidia
        ? Math.round(
            faturamento * (ehSkuProblematico ? 0.55 + rand() * 0.35 : 0.03 + rand() * 0.14) * 100,
          ) / 100
        : 0;
      const lucroLiquido =
        Math.round((faturamento - cmv - comissao - taxaFixa - impostos - outrosCustos) * 100) /
        100;
      const status = STATUS[Math.floor(rand() * STATUS.length)]!;
      const clienteIdx = Math.floor(rand() * CLIENTES.length);
      const ddd = 11 + Math.floor(rand() * 78);

      const hora = 8 + Math.floor(rand() * 13);
      const minuto = Math.floor(rand() * 60);
      const dataHora = new Date(data);
      dataHora.setHours(hora, minuto, 0, 0);

      const tipoLogistica: TipoLogistica = (() => {
        if (rand() < PROB_FULL[conta.marketplaceId]) return "full";
        return rand() < PROB_FLEX_SE_NAO_FULL ? "flex" : "padrao";
      })();
      const estado = escolherEstado(rand);

      const previsaoRepasseData = new Date(dataHora);
      previsaoRepasseData.setDate(
        previsaoRepasseData.getDate() + DIAS_REPASSE[conta.marketplaceId],
      );

      // ~5% dos pedidos entregues sofrem devolução depois da entrega — é
      // diferente de "cancelado" (que nunca chegou a ser despachado/entregue).
      const houveDevolucao = status === "entregue" && rand() > 0.95;
      const devolucaoParcial = houveDevolucao && rand() > 0.65;
      const valorDevolvido = houveDevolucao
        ? Math.round(faturamento * (devolucaoParcial ? 0.3 + rand() * 0.4 : 1) * 100) / 100
        : 0;
      const dataDevolucao = houveDevolucao
        ? new Date(dataHora.getTime() + (3 + Math.floor(rand() * 17)) * 86400000).toISOString()
        : null;
      const motivoDevolucao = houveDevolucao
        ? MOTIVOS_DEVOLUCAO[Math.floor(rand() * MOTIVOS_DEVOLUCAO.length)]!
        : null;

      return {
        id: `${conta.marketplaceId.slice(0, 3).toUpperCase()}-${(100000 + Math.floor(rand() * 899999)).toString()}`,
        data: dataHora.toISOString(),
        marketplaceId: conta.marketplaceId,
        contaId: conta.id,
        sku: produto.sku,
        produto: produto.nome,
        quantidade,
        precoUnitario,
        faturamento,
        cmv,
        comissao,
        taxaFixa,
        impostos,
        descontos: Math.round(desconto * quantidade * 100) / 100,
        outrosCustos,
        custoMidia,
        lucroLiquido,
        margem: faturamento ? lucroLiquido / faturamento : 0,
        status,
        cliente: CLIENTES[clienteIdx]!,
        telefone: `(${ddd}) 9${Math.floor(1000 + rand() * 8999)}-${Math.floor(1000 + rand() * 8999)}`,
        tipoLogistica,
        estado,
        previsaoRepasse: previsaoRepasseData.toISOString(),
        valorDevolvido,
        dataDevolucao,
        motivoDevolucao,
        campanhaId: campanha?.id ?? null,
      };
  };

  for (let d = DIAS_HISTORICO; d >= 0; d--) {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() - d);
    // Tendência de crescimento suave + variação de fim de semana
    const fimDeSemana = data.getDay() === 0 || data.getDay() === 6;
    const base = 9 + Math.round((DIAS_HISTORICO - d) / 22);
    const qtdPedidos = Math.max(
      2,
      Math.round((base + rand() * 6) * (fimDeSemana ? 0.65 : 1)),
    );

    // 1) Demanda normal do dia. Quando o SKU está em campanha, parte dessas
    //    vendas sai pela promoção — é a parcela que teria acontecido de
    //    qualquer jeito, só que agora com desconto.
    for (let i = 0; i < qtdPedidos; i++) {
      const produto = PRODUTOS[Math.floor(rand() * PRODUTOS.length)]!;
      const conta = CONTAS_ATIVAS[Math.floor(rand() * CONTAS_ATIVAS.length)]!;
      const vigente = campanhaVigente(produto.sku, conta.marketplaceId, data);
      const adesao = vigente ? (PARAMETROS_CAMPANHA.get(vigente.id)?.adesao ?? 0) : 0;
      const campanha = vigente && rand() < adesao ? vigente : undefined;
      pedidos.push(criarPedido(produto, conta, data, campanha));
    }

    // 2) Volume EXTRA que a campanha trouxe de verdade. Campanha com lift 1
    //    não gera nada aqui — e é exatamente esse o caso em que o desconto
    //    saiu do bolso do seller sem trazer venda nova.
    for (const campanha of CAMPANHAS) {
      const dentroDaJanela =
        data.getTime() >= +new Date(campanha.inicio) &&
        data.getTime() <= +new Date(campanha.fim);
      if (!dentroDaJanela) continue;

      const lift = PARAMETROS_CAMPANHA.get(campanha.id)?.lift ?? 1;
      if (lift <= 1) continue;

      const contasDoCanal = CONTAS_ATIVAS.filter(
        (c) => c.marketplaceId === campanha.marketplaceId,
      );
      if (contasDoCanal.length === 0) continue;

      const baseDiariaPorSku = qtdPedidos / PRODUTOS.length;
      const esperado = baseDiariaPorSku * campanha.skus.length * (lift - 1);
      const extras = Math.max(0, Math.round(esperado + (rand() - 0.5)));

      for (let e = 0; e < extras; e++) {
        const sku = campanha.skus[Math.floor(rand() * campanha.skus.length)]!;
        const produto = PRODUTOS.find((p) => p.sku === sku);
        if (!produto) continue;
        const conta = contasDoCanal[Math.floor(rand() * contasDoCanal.length)]!;
        pedidos.push(criarPedido(produto, conta, data, campanha));
      }
    }
  }

  return pedidos.sort((a, b) => +new Date(b.data) - +new Date(a.data));
}

export const PEDIDOS: Pedido[] = gerarPedidos();

/**
 * Gera anúncios deliberadamente imperfeitos: alguns sem custo cadastrado,
 * alguns sem vínculo com produto, alguns no prejuízo, alguns com taxa ainda
 * estimada. Um catálogo real é assim — e a interface precisa aguentar isso.
 */
function gerarAnuncios(): Anuncio[] {
  const rand = criarRandom(777);
  const anuncios: Anuncio[] = [];

  for (const produto of PRODUTOS) {
    const doCatalogo = PRODUTOS_CATALOGO.find((pc) => pc.sku === produto.sku)!;

    for (const conta of CONTAS_ATIVAS) {
      const sorteio = rand();

      // ~18% do catálogo sem produto vinculado -> sem CMV -> sem margem real
      const vinculado = sorteio > 0.18;
      const produtoId = vinculado ? doCatalogo.id : null;
      const cmv = vinculado ? doCatalogo.cmv : null;

      // Alguns anúncios com preço agressivo demais para caírem no vermelho
      const agressivo = rand() > 0.82;
      const ajuste = agressivo ? 0.72 + rand() * 0.1 : 1 + (rand() - 0.4) * 0.12;
      const precoAtual = Math.round(produto.preco * ajuste * 100) / 100;

      const emPromocao = rand() > 0.7;
      const precoCheio = emPromocao
        ? Math.round(precoAtual * (1.12 + rand() * 0.15) * 100) / 100
        : null;

      // Frete: só é custo do seller acima do limiar de frete grátis do canal
      const temFreteSubsidiado = precoAtual >= 79;
      const freteUnitario = temFreteSubsidiado
        ? Math.round(conta.freteMedio * (0.6 + rand() * 0.6) * 100) / 100
        : 0;

      // ADS: só uma parte do catálogo é impulsionada
      const investeMidia = rand() > 0.6;
      const custoMidiaUnitario = investeMidia
        ? Math.round(precoAtual * (0.02 + rand() * 0.09) * 100) / 100
        : 0;

      // Afiliados: praticamente só no TikTok Shop (lives e criadores)
      const custoAfiliadoUnitario =
        conta.marketplaceId === "tiktok-shop" && rand() > 0.35
          ? Math.round(precoAtual * (0.05 + rand() * 0.1) * 100) / 100
          : 0;

      anuncios.push({
        id: `${conta.id}-${produto.sku}`,
        marketplaceId: conta.marketplaceId,
        contaId: conta.id,
        sku: produto.sku,
        produto: produto.nome,
        precoAtual,
        precoCheio,
        emPromocao,
        cmv,
        impostoPercentual: IMPOSTO_PADRAO,
        comissaoPercentual: conta.comissaoPercentual,
        taxaFixa: conta.taxaFixa,
        freteUnitario,
        custoMidiaUnitario,
        custoAfiliadoUnitario,
        // Canal recém-conectado ainda não liquidou taxas
        origemTaxas:
          conta.statusConexao === "conectado" && rand() > 0.35
            ? "liquidado"
            : "estimado",
        produtoId,
        status: rand() > 0.9 ? "pausado" : rand() > 0.95 ? "sem-estoque" : "ativo",
        elegivelPromocao: rand() > 0.55,
        unidadesVendidas: Math.floor(rand() * rand() * 90),
      });
    }
  }

  return anuncios;
}

export const ANUNCIOS: Anuncio[] = gerarAnuncios();

export const HISTORICO_PRECOS: AlteracaoPreco[] = [
  {
    id: "hp-1",
    data: new Date(Date.now() - 3 * 3600000).toISOString(),
    sku: "SW-X-BLK-001",
    produto: "Smartwatch Series X Titanium Black",
    marketplaceId: "mercado-livre",
    precoAnterior: 479.9,
    precoNovo: 499.9,
    usuario: "Felipe Camargo",
  },
  {
    id: "hp-2",
    data: new Date(Date.now() - 26 * 3600000).toISOString(),
    sku: "PEL-IP15-PM",
    produto: "Película de Vidro iPhone 15 Pro Max",
    marketplaceId: "shopee",
    precoAnterior: 44.9,
    precoNovo: 39.9,
    usuario: "Marina Alves",
  },
  {
    id: "hp-3",
    data: new Date(Date.now() - 50 * 3600000).toISOString(),
    sku: "TEC-MEC-RGB",
    produto: "Teclado Mecânico RGB 75%",
    marketplaceId: "amazon",
    precoAnterior: 339,
    precoNovo: 359,
    usuario: "Felipe Camargo",
  },
  {
    id: "hp-4",
    data: new Date(Date.now() - 74 * 3600000).toISOString(),
    sku: "MON-27-QHD",
    produto: "Monitor 27'' QHD 165Hz",
    marketplaceId: "mercado-livre",
    precoAnterior: 1699,
    precoNovo: 1599,
    usuario: "Rodrigo Peixoto",
  },
];

export const PROMOCOES: Promocao[] = PRODUTOS.slice(0, 7).map((produto, i) => {
  const rebate = Math.round(produto.preco * (0.04 + i * 0.008) * 100) / 100;
  const desconto = Math.round(produto.preco * (0.1 + i * 0.01) * 100) / 100;
  return {
    id: `promo-${produto.sku}`,
    marketplaceId: "mercado-livre",
    sku: produto.sku,
    produto: produto.nome,
    precoAtual: produto.preco,
    tipo: i % 3 === 0 ? "Oferta do Dia" : i % 3 === 1 ? "Campanha Semana Tech" : "Promoção Relâmpago",
    rebate,
    precoFinal: Math.round((produto.preco - desconto + rebate) * 100) / 100,
    cmv: produto.cmv,
    impostoPercentual: IMPOSTO_PADRAO,
    comissaoPercentual: 0.16,
    taxaFixa: 6.75,
  };
});

export const ESTOQUE: ItemEstoque[] = PRODUTOS.map((produto, i) => ({
  sku: produto.sku,
  produto: produto.nome,
  marketplaceId: MARKETPLACES[i % 3]!.id,
  estoqueAtual: [12, 320, 145, 60, 45, 18, 210, 95, 33, 410, 78, 640][i] ?? 100,
  estoqueFulfillment: [4, 180, 60, 22, 12, 6, 120, 40, 15, 260, 30, 380][i] ?? 50,
}));

export const NOTIFICACOES: Notificacao[] = [
  {
    id: "n1",
    tipo: "promocao",
    titulo: "Nova promoção disponível",
    descricao: "Mercado Livre abriu a campanha \"Semana Tech\". 7 anúncios elegíveis.",
    data: new Date(Date.now() - 12 * 60000).toISOString(),
    lida: false,
  },
  {
    id: "n2",
    tipo: "sincronizacao",
    titulo: "Sincronização concluída",
    descricao: "Amazon sincronizada com sucesso. 142 SKUs atualizados.",
    data: new Date(Date.now() - 70 * 60000).toISOString(),
    lida: false,
  },
  {
    id: "n3",
    tipo: "desconexao",
    titulo: "Marketplace desconectado",
    descricao: "A conexão com o Magalu ainda não foi configurada.",
    data: new Date(Date.now() - 6 * 3600000).toISOString(),
    lida: true,
  },
  {
    id: "n4",
    tipo: "erro",
    titulo: "Erro de sincronização",
    descricao: "Não foi possível ler 3 anúncios da Shopee. Tentaremos novamente.",
    data: new Date(Date.now() - 9 * 3600000).toISOString(),
    lida: true,
  },
  {
    id: "n5",
    tipo: "configuracao",
    titulo: "Alteração de configuração",
    descricao: "Alíquota de imposto alterada de 8% para 10% por Felipe Camargo.",
    data: new Date(Date.now() - 30 * 3600000).toISOString(),
    lida: true,
  },
];

export const USUARIOS: Usuario[] = [
  {
    id: "u1",
    nome: "Felipe Camargo",
    email: "felipe@nexuscommerce.com.br",
    papel: "administrador",
    ativo: true,
    ultimoAcesso: new Date(Date.now() - 20 * 60000).toISOString(),
  },
  {
    id: "u2",
    nome: "Marina Alves",
    email: "marina@nexuscommerce.com.br",
    papel: "analista",
    ativo: true,
    ultimoAcesso: new Date(Date.now() - 4 * 3600000).toISOString(),
  },
  {
    id: "u3",
    nome: "Rodrigo Peixoto",
    email: "rodrigo@nexuscommerce.com.br",
    papel: "operacional",
    ativo: true,
    ultimoAcesso: new Date(Date.now() - 28 * 3600000).toISOString(),
  },
  {
    id: "u4",
    nome: "Camila Duarte",
    email: "camila@nexuscommerce.com.br",
    papel: "operacional",
    ativo: false,
    ultimoAcesso: new Date(Date.now() - 20 * 24 * 3600000).toISOString(),
  },
];

export const LOGS: LogAlteracao[] = [
  {
    id: "l1",
    data: new Date(Date.now() - 3 * 3600000).toISOString(),
    usuario: "Felipe Camargo",
    acao: "Alteração de preço — SW-X-BLK-001",
    valorAnterior: "R$ 479,90",
    valorNovo: "R$ 499,90",
  },
  {
    id: "l2",
    data: new Date(Date.now() - 26 * 3600000).toISOString(),
    usuario: "Marina Alves",
    acao: "Alteração de preço — PEL-IP15-PM",
    valorAnterior: "R$ 44,90",
    valorNovo: "R$ 39,90",
  },
  {
    id: "l3",
    data: new Date(Date.now() - 30 * 3600000).toISOString(),
    usuario: "Felipe Camargo",
    acao: "Regra financeira — Alíquota de imposto",
    valorAnterior: "8%",
    valorNovo: "10%",
  },
  {
    id: "l4",
    data: new Date(Date.now() - 54 * 3600000).toISOString(),
    usuario: "Rodrigo Peixoto",
    acao: "Permissão de usuário — Camila Duarte",
    valorAnterior: "Analista",
    valorNovo: "Operacional",
  },
  {
    id: "l5",
    data: new Date(Date.now() - 100 * 3600000).toISOString(),
    usuario: "Felipe Camargo",
    acao: "Margem desejada padrão",
    valorAnterior: "18%",
    valorNovo: "22%",
  },
];

export const EMPRESA = {
  nome: "Nexus Commerce LTDA",
  cnpj: "42.918.774/0001-06",
  regime: "Simples Nacional",
  plano: "Plano Enterprise",
  email: "financeiro@nexuscommerce.com.br",
  telefone: "(11) 4002-8922",
  endereco: "Av. Paulista, 1578 — São Paulo/SP",
};

export const USUARIO_ATUAL = USUARIOS[0]!;

export const REGRAS_FINANCEIRAS = {
  impostoPercentual: IMPOSTO_PADRAO,
  margemDesejada: 0.22,
  outrosCustosPadrao: 0,
};

const TIPOS_RECUPERACAO: TipoOportunidadeRecuperacao[] = [
  "boleto-pendente",
  "pix-nao-pago",
  "cancelamento-solicitado",
];
const CANAIS_RECUPERACAO: CanalRecuperacao[] = ["whatsapp", "email", "sms"];

function gerarOportunidadesRecuperacao(): OportunidadeRecuperacao[] {
  const rand = criarRandom(20260915);
  const alvos = { total: 38450, recuperado: 14210 };

  const oportunidades: OportunidadeRecuperacao[] = [];
  for (let i = 0; i < 67; i++) {
    const recuperado = i < 25;
    const status: StatusOportunidadeRecuperacao = recuperado
      ? "recuperado"
      : i < 55
        ? "aguardando-acao"
        : "mensagem-enviada";
    const tipo = TIPOS_RECUPERACAO[Math.floor(rand() * TIPOS_RECUPERACAO.length)]!;
    const canal = CANAIS_RECUPERACAO[Math.floor(rand() * CANAIS_RECUPERACAO.length)]!;
    const conta = CONTAS_ATIVAS[Math.floor(rand() * CONTAS_ATIVAS.length)]!;
    const produto = PRODUTOS[Math.floor(rand() * PRODUTOS.length)]!;
    const cliente = CLIENTES[Math.floor(rand() * CLIENTES.length)]!;
    const valor = Math.round((200 + rand() * 800) * 100) / 100;
    const horas = Math.floor(1 + rand() * 47);

    oportunidades.push({
      id: `REC-${1000 + i}`,
      cliente,
      pedidoId: `${conta.marketplaceId.slice(0, 3).toUpperCase()}-${(100000 + Math.floor(rand() * 899999)).toString()}`,
      marketplaceId: conta.marketplaceId,
      contaId: conta.id,
      valor,
      tipo,
      tempoRestante: recuperado ? "—" : `${horas}h`,
      status,
      canal,
      dataCriacao: new Date(Date.now() - Math.floor(rand() * 10 * 24 * 3600000)).toISOString(),
      dataUltimoContato: recuperado
        ? new Date(Date.now() - Math.floor(rand() * 5 * 24 * 3600000)).toISOString()
        : null,
    });
  }

  const somaTotal = oportunidades.reduce((acc, o) => acc + o.valor, 0);
  const somaRecuperado = oportunidades
    .filter((o) => o.status === "recuperado")
    .reduce((acc, o) => acc + o.valor, 0);
  const somaPendente = somaTotal - somaRecuperado;

  const fatorRecuperado = alvos.recuperado / somaRecuperado;
  const fatorPendente = (alvos.total - alvos.recuperado) / somaPendente;

  for (const o of oportunidades) {
    const fator = o.status === "recuperado" ? fatorRecuperado : fatorPendente;
    o.valor = Math.round(o.valor * fator * 100) / 100;
  }

  return oportunidades.sort((a, b) => +new Date(b.dataCriacao) - +new Date(a.dataCriacao));
}

export const OPORTUNIDADES_RECUPERACAO: OportunidadeRecuperacao[] =
  gerarOportunidadesRecuperacao();

export const CANAIS_NOTIFICACAO: CanalNotificacao[] = [
  {
    id: "whatsapp",
    nome: "WhatsApp",
    icone: "MessageCircle",
    conectado: true,
    disparosAutomaticos: true,
    ultimoDisparo: new Date(Date.now() - 12 * 60000).toISOString(),
    taxaAbertura: 0.78,
    custoEstimado: 0.08,
  },
  {
    id: "email",
    nome: "E-mail",
    icone: "Mail",
    conectado: true,
    disparosAutomaticos: false,
    ultimoDisparo: new Date(Date.now() - 3 * 3600000).toISOString(),
    taxaAbertura: 0.42,
    custoEstimado: 0.02,
  },
  {
    id: "sms",
    nome: "SMS",
    icone: "Smartphone",
    conectado: false,
    disparosAutomaticos: false,
    ultimoDisparo: new Date(Date.now() - 2 * 24 * 3600000).toISOString(),
    taxaAbertura: 0.65,
    custoEstimado: 0.12,
  },
];


// ---------------------------------------------------------------------------
// Estoque detalhado (cobertura em dias). Dados fictícios com números realistas.
// ---------------------------------------------------------------------------

const ESTOQUE_QTD = [8, 320, 145, 0, 45, 18, 210, 95, 0, 410, 78, 640];
const ESTOQUE_VENDAS_DIA = [2.4, 4.1, 9.8, 1.2, 6.5, 0.4, 7.2, 2.1, 1.8, 3.4, 0.9, 12.5];

export const ESTOQUE_DETALHADO: ItemEstoqueDetalhado[] = PRODUTOS.map((produto, i) => {
  const quantidade = ESTOQUE_QTD[i] ?? 100;
  const vendasDia = ESTOQUE_VENDAS_DIA[i] ?? 2;
  const cobertura = vendasDia > 0 ? Math.round(quantidade / vendasDia) : 0;
  return {
    sku: produto.sku,
    produto: produto.nome,
    marketplaceId: MARKETPLACES[i % 3]!.id,
    quantidade,
    vendasDia,
    coberturaDias: cobertura,
    custoUnitario: produto.cmv,
    valorEstoque: Math.round(quantidade * produto.cmv * 100) / 100,
  };
});

/** Resumo consolidado da operação (considera os 142 SKUs ativos da conta). */
export const RESUMO_ESTOQUE = {
  /** CMV total das unidades paradas em estoque */
  capitalInvestido: 185200,
  skusAtivos: 142,
  /** SKUs com menos de 10 unidades disponíveis */
  skusRuptura: ESTOQUE_DETALHADO.filter((i) => i.quantidade > 0 && i.quantidade < 10).length || 5,
  valorParado: 12400,
  /** Unidades paradas (cobertura acima de 60 dias) */
  unidadesParadas:
    ESTOQUE_DETALHADO.filter((i) => i.coberturaDias > 60).reduce(
      (t, i) => t + i.quantidade,
      0,
    ) || 485,
};

// ---------------------------------------------------------------------------
// Fulfillment (estoque alocado nos galpões dos marketplaces). Dados fictícios.
// ---------------------------------------------------------------------------

const FULL_QTD = [4, 180, 60, 0, 12, 6, 120, 40, 0, 260, 30, 380];
const FULL_VENDAS_DIA = [1.8, 3.2, 7.4, 0.9, 5.1, 0.3, 6.0, 1.6, 1.2, 2.6, 0.5, 9.8];

export const FULFILLMENT_DETALHADO: ItemEstoqueDetalhado[] = PRODUTOS.map((produto, i) => {
  const quantidade = FULL_QTD[i] ?? 40;
  const vendasDia = FULL_VENDAS_DIA[i] ?? 1.5;
  const cobertura = vendasDia > 0 ? Math.round(quantidade / vendasDia) : 0;
  return {
    sku: produto.sku,
    produto: produto.nome,
    marketplaceId: MARKETPLACES[i % 3]!.id,
    quantidade,
    vendasDia,
    coberturaDias: cobertura,
    custoUnitario: produto.cmv,
    valorEstoque: Math.round(quantidade * produto.cmv * 100) / 100,
  };
});

/** Resumo consolidado do fulfillment. */
export const RESUMO_FULFILLMENT = {
  /** CMV total das unidades alocadas nos galpões */
  capitalInvestido: 92400,
  /** SKUs com estoque alocado em fulfillment */
  skusFull: FULFILLMENT_DETALHADO.filter((i) => i.quantidade > 0).length,
  /** SKUs com menos de 10 unidades no galpão */
  skusRuptura: FULFILLMENT_DETALHADO.filter((i) => i.quantidade > 0 && i.quantidade < 10).length,
  /** Unidades paradas (cobertura acima de 60 dias) */
  unidadesParadas:
    FULFILLMENT_DETALHADO.filter((i) => i.coberturaDias > 60).reduce(
      (t, i) => t + i.quantidade,
      0,
    ) || 320,
};
