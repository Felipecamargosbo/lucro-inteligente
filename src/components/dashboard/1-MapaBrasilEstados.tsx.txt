import { useState } from "react";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Regiao = "Norte" | "Nordeste" | "Centro-Oeste" | "Sudeste" | "Sul";

export const REGIAO_POR_UF: Record<string, Regiao> = {
  AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
  AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste",
  PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
  DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste",
  ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
  PR: "Sul", RS: "Sul", SC: "Sul",
};

export const COR_REGIAO: Record<Regiao, string> = {
  Sudeste: "var(--brand)",
  Sul: "var(--info)",
  Nordeste: "var(--warning)",
  "Centro-Oeste": "var(--profit)",
  Norte: "var(--loss)",
};

/**
 * Silhueta simplificada do Brasil (viewBox 400x399) e a posição aproximada
 * de cada UF dentro dela. É um mapa ESTILIZADO para plotar as bolinhas por
 * cima — não é uma projeção cartográfica exata, então não serve para medir
 * fronteiras ou distâncias, só para dar a leitura visual de "onde".
 */
const CONTORNO_BRASIL =
  "M 140.7 3.0 L 144.7 12.1 L 162.8 17.1 L 177.9 36.2 L 197.0 33.2 L 227.1 12.1 L 234.2 44.2 L 258.3 70.9 L 283.4 66.3 L 300.5 81.4 L 313.6 80.4 L 333.7 84.4 L 358.8 93.5 L 373.9 105.5 L 392.0 108.5 L 396.0 128.1 L 395.0 137.2 L 388.9 152.8 L 373.9 166.8 L 358.8 186.9 L 353.8 207.0 L 351.8 235.2 L 340.7 260.3 L 333.7 272.4 L 311.6 287.4 L 294.5 291.5 L 280.4 297.5 L 258.3 312.6 L 258.3 333.7 L 243.2 352.8 L 222.1 377.9 L 209.0 395.5 L 193.0 367.8 L 166.8 359.8 L 186.9 331.7 L 197.0 313.6 L 200.0 297.5 L 185.9 282.4 L 163.8 277.4 L 166.8 247.2 L 158.8 220.1 L 138.7 192.0 L 114.6 185.9 L 88.4 154.8 L 57.3 166.8 L 36.2 166.8 L 12.1 151.8 L 2.2 131.7 L 13.1 107.5 L 42.2 98.5 L 48.2 68.3 L 44.2 50.3 L 69.3 36.2 L 92.5 46.2 L 108.5 17.1 L 132.7 11.1 Z";

const POSICAO_UF: Record<string, { x: number; y: number }> = {
  AC: { x: 37.2, y: 146.7 },
  AM: { x: 97.5, y: 101.5 },
  RR: { x: 128.6, y: 35.2 },
  RO: { x: 112.6, y: 166.8 },
  PA: { x: 218.1, y: 101.5 },
  AP: { x: 225.1, y: 42.2 },
  TO: { x: 260.3, y: 158.8 },
  MA: { x: 290.5, y: 106.5 },
  PI: { x: 315.6, y: 131.7 },
  CE: { x: 347.7, y: 108.5 },
  RN: { x: 377.9, y: 114.6 },
  PB: { x: 377.9, y: 128.6 },
  PE: { x: 364.8, y: 140.7 },
  AL: { x: 377.9, y: 152.8 },
  SE: { x: 369.8, y: 162.8 },
  BA: { x: 326.6, y: 181.9 },
  MT: { x: 183.9, y: 186.9 },
  MS: { x: 198.0, y: 262.3 },
  GO: { x: 247.2, y: 216.1 },
  DF: { x: 265.3, y: 215.1 },
  MG: { x: 297.5, y: 242.2 },
  ES: { x: 337.7, y: 253.3 },
  RJ: { x: 317.6, y: 279.4 },
  SP: { x: 257.3, y: 279.4 },
  PR: { x: 228.1, y: 302.5 },
  SC: { x: 238.2, y: 329.6 },
  RS: { x: 211.1, y: 357.8 },
};

export interface EstadoMapa {
  uf: string;
  regiao: Regiao;
  faturamento: number;
  pedidos: number;
  lucro: number;
  margem: number;
}

export function MapaBrasilEstados({
  dados,
  metrica,
}: {
  dados: EstadoMapa[];
  metrica: "faturamento" | "pedidos";
}) {
  const [hoverUf, setHoverUf] = useState<string | null>(null);

  const valorDe = (e: EstadoMapa) => (metrica === "faturamento" ? e.faturamento : e.pedidos);
  const maxValor = Math.max(1, ...dados.map(valorDe));
  const raio = (v: number) => 4 + Math.sqrt(Math.max(0, v) / maxValor) * 22;

  const hover = dados.find((e) => e.uf === hoverUf) ?? null;
  const posHover = hoverUf ? POSICAO_UF[hoverUf] : null;

  // Estados sem nenhuma venda no período não têm bolinha — só contorno.
  const comVenda = dados.filter((e) => valorDe(e) > 0 && POSICAO_UF[e.uf]);

  return (
    <div>
      <div
        className="relative mx-auto w-full max-w-sm"
        style={{ aspectRatio: "400 / 399" }}
      >
        <svg
          viewBox="0 0 400 399"
          className="absolute inset-0 h-full w-full overflow-visible"
          onMouseLeave={() => setHoverUf(null)}
        >
          <path
            d={CONTORNO_BRASIL}
            fill="var(--muted)"
            stroke="var(--border)"
            strokeWidth={1.5}
          />
          {comVenda
            // desenha as maiores primeiro, pra as menores não ficarem escondidas embaixo
            .slice()
            .sort((a, b) => valorDe(b) - valorDe(a))
            .map((e) => {
              const pos = POSICAO_UF[e.uf];
              if (!pos) return null;
              const r = raio(valorDe(e));
              return (
                <circle
                  key={e.uf}
                  cx={pos.x}
                  cy={pos.y}
                  r={r}
                  fill={COR_REGIAO[e.regiao]}
                  fillOpacity={hoverUf && hoverUf !== e.uf ? 0.3 : 0.78}
                  stroke="var(--card)"
                  strokeWidth={1.5}
                  className="cursor-pointer transition-opacity"
                  onMouseEnter={() => setHoverUf(e.uf)}
                  onFocus={() => setHoverUf(e.uf)}
                  tabIndex={0}
                />
              );
            })}
        </svg>

        {hover && posHover && (
          <div
            className="pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 -translate-y-[110%] rounded-xl border bg-card p-2.5 text-[11px] shadow-float"
            style={{
              left: `${(posHover.x / 400) * 100}%`,
              top: `${(posHover.y / 399) * 100}%`,
            }}
          >
            <p className="mb-1 font-bold">
              {hover.uf} <span className="font-normal text-muted-foreground">· {hover.regiao}</span>
            </p>
            <div className="space-y-0.5">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Faturamento</span>
                <span className="num font-semibold">{formatBRL(hover.faturamento)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Pedidos</span>
                <span className="num font-semibold">{formatNumero(hover.pedidos)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Margem</span>
                <span
                  className={cn(
                    "num font-semibold",
                    hover.lucro >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {formatPercentual(hover.margem)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        O tamanho da bolinha representa {metrica === "faturamento" ? "o faturamento" : "o nº de pedidos"}{" "}
        do estado no período. Passe o mouse em cima pra ver os detalhes.
      </p>
    </div>
  );
}
