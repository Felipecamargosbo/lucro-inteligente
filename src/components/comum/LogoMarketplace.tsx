import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MarketplaceId } from "@/types";

/**
 * Identidade visual de cada canal.
 *
 * `arquivo` aponta para o logo oficial em /public/logos/. Enquanto o arquivo
 * não existir, o componente cai no selo colorido com as iniciais — nunca
 * mostra imagem quebrada. Para usar os logos reais, baixe-os nas páginas de
 * marca de cada marketplace e salve com estes nomes em public/logos/.
 */
const MARCA: Record<
  MarketplaceId,
  { sigla: string; fundo: string; texto: string; arquivo: string }
> = {
  "mercado-livre": {
    sigla: "ML",
    fundo: "#FFE600",
    texto: "#2D3277",
    arquivo: "/logos/mercado-livre.png",
  },
  shopee: {
    sigla: "SH",
    fundo: "#EE4D2D",
    texto: "#FFFFFF",
    arquivo: "/logos/shopee.png",
  },
  amazon: {
    sigla: "AM",
    fundo: "#FF9900",
    texto: "#141F33",
    arquivo: "/logos/amazon.png",
  },
  magalu: {
    sigla: "MG",
    fundo: "#0086FF",
    texto: "#FFFFFF",
    arquivo: "/logos/magalu.png",
  },
  "tiktok-shop": {
    sigla: "TT",
    fundo: "#111111",
    texto: "#FFFFFF",
    arquivo: "/logos/tiktok-shop.png",
  },
  shein: {
    sigla: "SN",
    fundo: "#222222",
    texto: "#FFFFFF",
    arquivo: "/logos/shein.png",
  },
};

const TAMANHOS = {
  xs: "size-4 text-[7px] rounded",
  sm: "size-5 text-[8px] rounded-md",
  md: "size-8 text-[10px] rounded-lg",
  lg: "size-11 text-xs rounded-xl",
} as const;

export function LogoMarketplace({
  id,
  tamanho = "sm",
  className,
}: {
  id: MarketplaceId;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const marca = MARCA[id];
  // Só sabemos se o logo existe depois de tentar carregá-lo.
  const [temLogo, setTemLogo] = useState(false);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden font-bold uppercase leading-none ring-1 ring-black/5",
        TAMANHOS[tamanho],
        className,
      )}
      style={
        // Com logo real, fundo escuro neutro: funciona tanto para marcas
        // claras (o "a" branco da Amazon) quanto para as coloridas.
        temLogo
          ? { backgroundColor: "var(--color-sidebar)" }
          : { backgroundColor: marca.fundo, color: marca.texto }
      }
    >
      {/* As iniciais ficam por baixo; se o logo existir, ele cobre. */}
      {!temLogo && marca.sigla}
      <img
        src={marca.arquivo}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className={cn(
          "absolute inset-0 size-full object-contain p-[8%]",
          !temLogo && "opacity-0",
        )}
        onLoad={() => setTemLogo(true)}
        // Sem o arquivo, some com a imagem e deixa as iniciais aparecerem.
        onError={(e) => {
          e.currentTarget.remove();
        }}
      />
    </span>
  );
}
