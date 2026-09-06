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
 * Contorno do Brasil desenhado a partir dos pontos reais de costa e fronteira
 * (lat/long dos extremos, capitais litorâneas e marcos de divisa), projetados
 * numa viewBox de 400x396. É um mapa simplificado — serve para localizar
 * "onde", não para medir fronteiras.
 */
const CONTORNO_BRASIL =
  "M 136.7 4.3 L 143.9 11.9 L 145.9 21.8 L 153.8 37.7 L 159.8 42.7 L 173.7 37.7 L 183.6 32.8 L 197.5 34.7 L 220.3 20.8 L 227.8 12.9 L 235.2 36.7 L 243.2 46.7 L 248.1 56.6 L 258.1 71.0 L 269.5 62.5 L 282.9 66.5 L 299.8 81.7 L 312.7 80.4 L 324.9 85.4 L 337.5 85.1 L 356.9 93.5 L 364.6 101.7 L 370.9 105.7 L 387.1 107.2 L 390.0 114.0 L 394.1 127.5 L 393.3 136.5 L 384.7 152.6 L 371.5 164.9 L 357.2 185.3 L 352.1 203.4 L 351.8 219.9 L 349.9 232.6 L 339.1 258.3 L 332.5 274.9 L 322.7 283.7 L 310.9 284.6 L 295.8 286.8 L 279.6 294.5 L 264.0 304.7 L 258.1 309.7 L 256.6 323.6 L 257.6 330.5 L 245.9 347.8 L 222.3 374.5 L 209.7 391.6 L 205.5 379.2 L 188.3 363.3 L 168.2 356.3 L 172.8 351.9 L 183.6 338.5 L 187.6 329.5 L 197.8 310.7 L 201.0 295.6 L 186.4 280.2 L 165.0 272.0 L 167.2 245.2 L 166.9 216.1 L 144.4 205.5 L 139.0 190.6 L 124.1 180.6 L 90.9 163.6 L 48.9 165.2 L 16.9 145.9 L 5.2 131.3 L 15.9 116.1 L 45.3 98.8 L 48.6 71.5 L 48.6 56.6 L 73.4 46.7 L 75.9 44.7 L 99.3 26.8 L 134.0 11.9 Z";

/** Centro aproximado de cada UF dentro da mesma viewBox do contorno. */
const POSICAO_UF: Record<string, { x: number; y: number }> = {
  AC: { x: 42.7, y: 146.9 },
  AL: { x: 372.7, y: 151.4 },
  AM: { x: 97.7, y: 97.8 },
  AP: { x: 225.3, y: 43.7 },
  BA: { x: 325.6, y: 181.6 },
  CE: { x: 346.4, y: 108.2 },
  DF: { x: 264.4, y: 213.2 },
  ES: { x: 333.0, y: 250.6 },
  GO: { x: 247.1, y: 214.4 },
  MA: { x: 289.8, y: 107.2 },
  MG: { x: 296.8, y: 240.7 },
  MS: { x: 196.5, y: 259.6 },
  MT: { x: 184.6, y: 184.6 },
  PA: { x: 214.4, y: 98.3 },
  PB: { x: 372.7, y: 128.0 },
  PE: { x: 355.3, y: 140.0 },
  PI: { x: 313.2, y: 132.0 },
  PR: { x: 228.3, y: 300.2 },
  RJ: { x: 311.7, y: 276.4 },
  RN: { x: 372.7, y: 115.1 },
  RO: { x: 113.8, y: 167.9 },
  RR: { x: 130.2, y: 36.2 },
  RS: { x: 209.4, y: 353.3 },
  SC: { x: 240.2, y: 326.1 },
  SE: { x: 365.8, y: 161.3 },
  SP: { x: 257.1, y: 276.9 },
  TO: { x: 260.0, y: 158.3 },
};

const RAIO_MIN = 4;
const RAIO_MAX = 20;
/** A partir deste raio cabe a sigla dentro da bolinha sem ficar espremida. */
const RAIO_COM_SIGLA = 11;

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
  const raio = (v: number) => RAIO_MIN + Math.sqrt(Math.max(0, v) / maxValor) * RAIO_MAX;

  const hover = dados.find((e) => e.uf === hoverUf) ?? null;
  const posHover = hoverUf ? POSICAO_UF[hoverUf] : null;

  // Só entram estados com venda no período e com posição conhecida no mapa.
  // As maiores são desenhadas primeiro pra não cobrirem as menores.
  const comVenda = dados
    .filter((e) => valorDe(e) > 0 && POSICAO_UF[e.uf])
    .sort((a, b) => valorDe(b) - valorDe(a));

  return (
    <div>
      <div className="relative mx-auto w-full max-w-md" style={{ aspectRatio: "400 / 396" }}>
        <svg
          viewBox="0 0 400 396"
          className="absolute inset-0 h-full w-full"
          onMouseLeave={() => setHoverUf(null)}
        >
          <path
            d={CONTORNO_BRASIL}
            fill="var(--muted)"
            stroke="var(--border)"
            strokeWidth={1.5}
            strokeLinejoin="round"
          />
          {comVenda.map((e) => {
            const pos = POSICAO_UF[e.uf];
            if (!pos) return null;
            const r = raio(valorDe(e));
            const apagada = hoverUf !== null && hoverUf !== e.uf;
            return (
              <g key={e.uf} className="cursor-pointer" onMouseEnter={() => setHoverUf(e.uf)}>
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r={r}
                  fill={COR_REGIAO[e.regiao]}
                  fillOpacity={apagada ? 0.28 : 0.8}
                  stroke="var(--card)"
                  strokeWidth={1.5}
                  className="transition-opacity"
                />
                {r >= RAIO_COM_SIGLA && (
                  <text
                    x={pos.x}
                    y={pos.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={10}
                    fontWeight={700}
                    fill="#fff"
                    fillOpacity={apagada ? 0.4 : 1}
                    className="pointer-events-none select-none"
                  >
                    {e.uf}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {hover && posHover && (
          <div
            className="pointer-events-none absolute z-10 min-w-40 -translate-x-1/2 -translate-y-[115%] rounded-xl border bg-card p-2.5 text-[11px] shadow-float"
            style={{
              left: `${(posHover.x / 400) * 100}%`,
              top: `${(posHover.y / 396) * 100}%`,
            }}
          >
            <p className="mb-1.5 font-bold">
              {hover.uf}{" "}
              <span className="font-normal text-muted-foreground">· {hover.regiao}</span>
            </p>
            <div className="space-y-0.5">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Faturamento</span>
                <span className="num font-semibold">{formatBRL(hover.faturamento)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Pedidos</span>
                <span className="num font-semibold">{formatNumero(hover.pedidos)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Lucro</span>
                <span
                  className={cn(
                    "num font-semibold",
                    hover.lucro >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {formatBRL(hover.lucro)}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Margem</span>
                <span className="num font-semibold">{formatPercentual(hover.margem)}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        O tamanho da bolinha representa{" "}
        {metrica === "faturamento" ? "o faturamento" : "o nº de pedidos"} do estado no período.
        Passe o mouse em cima pra ver os detalhes.
      </p>
    </div>
  );
}
