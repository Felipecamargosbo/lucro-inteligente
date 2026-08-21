import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { resolverPeriodo, somarDias, type PresetPeriodo } from "@/lib/period";
import type { Periodo } from "@/types";

interface PeriodoContexto {
  preset: PresetPeriodo;
  setPreset: (p: PresetPeriodo) => void;
  inicioPersonalizado: Date;
  fimPersonalizado: Date;
  setPersonalizado: (inicio: Date, fim: Date) => void;
  periodo: Periodo;
}

const Ctx = createContext<PeriodoContexto | null>(null);

export function PeriodoProvider({ children }: { children: ReactNode }) {
  const [preset, setPreset] = useState<PresetPeriodo>("30-dias");
  const [inicioPersonalizado, setInicio] = useState(() => somarDias(new Date(), -14));
  const [fimPersonalizado, setFim] = useState(() => new Date());

  const periodo = useMemo(
    () =>
      resolverPeriodo(preset, {
        inicio: inicioPersonalizado,
        fim: fimPersonalizado,
      }),
    [preset, inicioPersonalizado, fimPersonalizado],
  );

  const valor = useMemo<PeriodoContexto>(
    () => ({
      preset,
      setPreset,
      inicioPersonalizado,
      fimPersonalizado,
      setPersonalizado: (inicio: Date, fim: Date) => {
        setInicio(inicio);
        setFim(fim);
      },
      periodo,
    }),
    [preset, inicioPersonalizado, fimPersonalizado, periodo],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function usePeriodo() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePeriodo precisa estar dentro de PeriodoProvider");
  return ctx;
}
