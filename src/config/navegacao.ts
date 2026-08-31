import {
  BadgePercent,
  Boxes,
  Calculator,
  LayoutDashboard,
  LifeBuoy,
  Megaphone,
  PackageCheck,
  Settings,
  ShoppingCart,
  Store,
} from "lucide-react";

import type { MarketplaceId } from "@/types";

export interface ItemMenu {
  titulo: string;
  url: string;
  icone: typeof LayoutDashboard;
  grupo: "Análise" | "Operação" | "Gestão" | "Configuração";
  descricao: string;
  usaPeriodo: boolean;
}

export const MENU: ItemMenu[] = [
  {
    titulo: "Dashboard",
    url: "/",
    icone: LayoutDashboard,
    grupo: "Análise",
    descricao: "Visão executiva do seu resultado",
    usaPeriodo: true,
  },
  {
    titulo: "Vendas",
    url: "/vendas",
    icone: ShoppingCart,
    grupo: "Análise",
    descricao: "Cada pedido, do preço de venda ao lucro",
    usaPeriodo: true,
  },
  {
    titulo: "Anúncios",
    url: "/anuncios",
    icone: Megaphone,
    grupo: "Análise",
    descricao: "Preço atual e lucro estimado por anúncio",
    usaPeriodo: false,
  },
  {
    titulo: "Calculadora",
    url: "/calculadora",
    icone: Calculator,
    grupo: "Análise",
    descricao: "Descubra o preço ideal de venda",
    usaPeriodo: false,
  },
  {
    titulo: "Promoções",
    url: "/promocoes",
    icone: BadgePercent,
    grupo: "Análise",
    descricao: "Oportunidades dos marketplaces — você decide",
    usaPeriodo: false,
  },
  {
    titulo: "Recuperação de vendas",
    url: "/recuperacao",
    icone: LifeBuoy,
    grupo: "Análise",
    descricao: "Pedidos cancelados que podem ser retomados",
    usaPeriodo: true,
  },
  {
    titulo: "Estoque",
    url: "/estoque",
    icone: Boxes,
    grupo: "Operação",
    descricao: "Cobertura de estoque em dias",
    usaPeriodo: true,
  },
  {
    titulo: "Fulfillment",
    url: "/fulfillment",
    icone: PackageCheck,
    grupo: "Operação",
    descricao: "Estoque nos centros de distribuição",
    usaPeriodo: true,
  },
  {
    titulo: "Marketplaces",
    url: "/marketplaces",
    icone: Store,
    grupo: "Gestão",
    descricao: "Canais conectados",
    usaPeriodo: false,
  },
  {
    titulo: "Configurações",
    url: "/configuracoes",
    icone: Settings,
    grupo: "Configuração",
    descricao: "Empresa, regime fiscal, margens e custos",
    usaPeriodo: false,
  },
];

export const GRUPOS = ["Análise", "Operação", "Gestão", "Configuração"] as const;

/* ------------------------------------------------------------------ */
/* Navegação por canal                                                */
/* ------------------------------------------------------------------ */

/**
 * Canais que aparecem como sub-itens do grupo "Gestão de Marketplaces".
 * O slug é o que vai na URL (/marketplaces/mercado-livre).
 */
export interface CanalMenu {
  id: MarketplaceId;
  slug: string;
  titulo: string;
}

export const CANAIS: CanalMenu[] = [
  { id: "mercado-livre", slug: "mercado-livre", titulo: "Mercado Livre" },
  { id: "shopee", slug: "shopee", titulo: "Shopee" },
  { id: "amazon", slug: "amazon", titulo: "Amazon" },
  { id: "magalu", slug: "magalu", titulo: "Magalu" },
  { id: "tiktok-shop", slug: "tiktok-shop", titulo: "TikTok Shop" },
  { id: "shein", slug: "shein", titulo: "Shein" },
];

export const getCanalPorSlug = (slug: string) => CANAIS.find((c) => c.slug === slug);

/** Abas internas de cada canal. */
export type AbaCanal =
  | "dashboard"
  | "raio-x"
  | "promocoes"
  | "reputacao"
  | "pendencias";

export interface AbaCanalDef {
  id: AbaCanal;
  titulo: string;
  descricao: string;
}

export const ABAS_CANAL: AbaCanalDef[] = [
  {
    id: "dashboard",
    titulo: "Dashboard",
    descricao: "Faturamento, pedidos e composição das taxas do canal",
  },
  {
    id: "raio-x",
    titulo: "Raio-X de Anúncios",
    descricao: "Cada taxa exposta na linha, com o que sobra no bolso",
  },
  {
    id: "promocoes",
    titulo: "Promoções",
    descricao: "Campanhas do canal e se elas compensam",
  },
  {
    id: "reputacao",
    titulo: "Reputação",
    descricao: "Atraso, cancelamento e risco de perda de medalha",
  },
  {
    id: "pendencias",
    titulo: "Pendências",
    descricao: "O que impede o cálculo de margem confiável",
  },
];
