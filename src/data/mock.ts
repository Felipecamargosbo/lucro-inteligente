// Dados FICTÍCIOS usados apenas para demonstrar a interface.
// Nenhuma conexão real com marketplaces existe neste protótipo.
// Quando as APIs forem integradas, basta trocar a origem em src/services.

import type {
  AlteracaoPreco,
  Anuncio,
  ItemEstoque,
  LogAlteracao,
  Marketplace,
  MarketplaceId,
  Notificacao,
  Pedido,
  Promocao,
  StatusPedido,
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
  {
    id: "mercado-livre",
    nome: "Mercado Livre",
    conectado: true,
    ultimaSincronizacao: new Date(Date.now() - 8 * 60000).toISOString(),
    comissaoPercentual: 0.16,
    taxaFixa: 6.75,
  },
  {
    id: "shopee",
    nome: "Shopee",
    conectado: true,
    ultimaSincronizacao: new Date(Date.now() - 52 * 60000).toISOString(),
    comissaoPercentual: 0.2,
    taxaFixa: 4,
  },
  {
    id: "amazon",
    nome: "Amazon",
    conectado: true,
    ultimaSincronizacao: new Date(Date.now() - 21 * 60000).toISOString(),
    comissaoPercentual: 0.15,
    taxaFixa: 5.5,
  },
  {
    id: "magalu",
    nome: "Magalu",
    conectado: false,
    ultimaSincronizacao: null,
    comissaoPercentual: 0.18,
    taxaFixa: 5,
  },
  {
    id: "tiktok-shop",
    nome: "TikTok Shop",
    conectado: false,
    ultimaSincronizacao: null,
    comissaoPercentual: 0.14,
    taxaFixa: 3.5,
  },
  {
    id: "shein",
    nome: "Shein",
    conectado: false,
    ultimaSincronizacao: null,
    comissaoPercentual: 0.16,
    taxaFixa: 3,
  },
];

export const getMarketplace = (id: MarketplaceId) =>
  MARKETPLACES.find((m) => m.id === id)!;

interface Produto {
  sku: string;
  nome: string;
  preco: number;
  cmv: number;
}

export const PRODUTOS: Produto[] = [
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

function gerarPedidos(): Pedido[] {
  const rand = criarRandom(20260821);
  const pedidos: Pedido[] = [];
  const hoje = new Date();

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

    for (let i = 0; i < qtdPedidos; i++) {
      const produto = PRODUTOS[Math.floor(rand() * PRODUTOS.length)]!;
      const marketplace = MARKETPLACES[Math.floor(rand() * 3)]!;
      const quantidade = rand() > 0.82 ? 2 : 1;
      const desconto = rand() > 0.7 ? Math.round(produto.preco * 0.05 * 100) / 100 : 0;
      const precoUnitario = Math.round((produto.preco - desconto) * 100) / 100;
      const faturamento = Math.round(precoUnitario * quantidade * 100) / 100;
      const cmv = Math.round(produto.cmv * quantidade * 100) / 100;
      const comissao = Math.round(faturamento * marketplace.comissaoPercentual * 100) / 100;
      const taxaFixa = marketplace.taxaFixa;
      const impostos = Math.round(faturamento * IMPOSTO_PADRAO * 100) / 100;
      const outrosCustos = Math.round((2 + rand() * 12) * 100) / 100;
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

      pedidos.push({
        id: `${marketplace.id.slice(0, 3).toUpperCase()}-${(100000 + Math.floor(rand() * 899999)).toString()}`,
        data: dataHora.toISOString(),
        marketplaceId: marketplace.id,
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
        lucroLiquido,
        margem: faturamento ? lucroLiquido / faturamento : 0,
        status,
        cliente: CLIENTES[clienteIdx]!,
        telefone: `(${ddd}) 9${Math.floor(1000 + rand() * 8999)}-${Math.floor(1000 + rand() * 8999)}`,
      });
    }
  }

  return pedidos.sort((a, b) => +new Date(b.data) - +new Date(a.data));
}

export const PEDIDOS: Pedido[] = gerarPedidos();

function gerarAnuncios(): Anuncio[] {
  const rand = criarRandom(777);
  const anuncios: Anuncio[] = [];
  for (const produto of PRODUTOS) {
    for (const marketplace of MARKETPLACES.slice(0, 3)) {
      const ajuste = 1 + (rand() - 0.4) * 0.12;
      anuncios.push({
        id: `${marketplace.id}-${produto.sku}`,
        marketplaceId: marketplace.id,
        sku: produto.sku,
        produto: produto.nome,
        precoAtual: Math.round(produto.preco * ajuste * 100) / 100,
        cmv: produto.cmv,
        impostoPercentual: IMPOSTO_PADRAO,
        comissaoPercentual: marketplace.comissaoPercentual,
        taxaFixa: marketplace.taxaFixa,
        status: rand() > 0.9 ? "pausado" : rand() > 0.95 ? "sem-estoque" : "ativo",
        elegivelPromocao: rand() > 0.55,
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
