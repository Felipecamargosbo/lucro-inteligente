import type { Periodo } from "@/types";

export type PresetPeriodo =
  | "hoje"
  | "ontem"
  | "7-dias"
  | "30-dias"
  | "este-mes"
  | "mes-passado"
  | "personalizado";

export const PRESETS: { id: PresetPeriodo; rotulo: string }[] = [
  { id: "hoje", rotulo: "Hoje" },
  { id: "ontem", rotulo: "Ontem" },
  { id: "7-dias", rotulo: "Últimos 7 dias" },
  { id: "30-dias", rotulo: "Últimos 30 dias" },
  { id: "este-mes", rotulo: "Este mês" },
  { id: "mes-passado", rotulo: "Mês passado" },
  { id: "personalizado", rotulo: "Período personalizado" },
];

export const inicioDoDia = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);

export const fimDoDia = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

export const somarDias = (d: Date, dias: number) => {
  const nova = new Date(d);
  nova.setDate(nova.getDate() + dias);
  return nova;
};

export function resolverPeriodo(
  preset: PresetPeriodo,
  personalizado?: { inicio: Date; fim: Date },
  hoje = new Date(),
): Periodo {
  const rotulo = PRESETS.find((p) => p.id === preset)?.rotulo ?? "Período";

  switch (preset) {
    case "hoje":
      return { inicio: inicioDoDia(hoje), fim: fimDoDia(hoje), rotulo };
    case "ontem": {
      const ontem = somarDias(hoje, -1);
      return { inicio: inicioDoDia(ontem), fim: fimDoDia(ontem), rotulo };
    }
    case "7-dias":
      return { inicio: inicioDoDia(somarDias(hoje, -6)), fim: fimDoDia(hoje), rotulo };
    case "30-dias":
      return { inicio: inicioDoDia(somarDias(hoje, -29)), fim: fimDoDia(hoje), rotulo };
    case "este-mes":
      return {
        inicio: inicioDoDia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)),
        fim: fimDoDia(hoje),
        rotulo,
      };
    case "mes-passado": {
      const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      const fim = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      return { inicio: inicioDoDia(inicio), fim: fimDoDia(fim), rotulo };
    }
    case "personalizado":
    default:
      return {
        inicio: inicioDoDia(personalizado?.inicio ?? somarDias(hoje, -6)),
        fim: fimDoDia(personalizado?.fim ?? hoje),
        rotulo,
      };
  }
}

/** Período imediatamente anterior, com a mesma duração — usado nos comparativos. */
export function periodoAnterior(periodo: Periodo): Periodo {
  const duracao = periodo.fim.getTime() - periodo.inicio.getTime();
  return {
    inicio: new Date(periodo.inicio.getTime() - duracao - 1),
    fim: new Date(periodo.inicio.getTime() - 1),
    rotulo: "Período anterior",
  };
}

export function dentroDoPeriodo(iso: string, periodo: Periodo) {
  const t = new Date(iso).getTime();
  return t >= periodo.inicio.getTime() && t <= periodo.fim.getTime();
}

export function listarDias(periodo: Periodo): Date[] {
  const dias: Date[] = [];
  let atual = inicioDoDia(periodo.inicio);
  const fim = inicioDoDia(periodo.fim);
  while (atual <= fim && dias.length < 400) {
    dias.push(atual);
    atual = somarDias(atual, 1);
  }
  return dias;
}
