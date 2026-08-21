// Formatação brasileira: R$, datas dd/mm/aaaa e percentuais.

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const brlCompacto = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

const inteiro = new Intl.NumberFormat("pt-BR");

export const formatBRL = (valor: number) => brl.format(valor || 0);
export const formatBRLCompacto = (valor: number) => brlCompacto.format(valor || 0);
export const formatNumero = (valor: number) => inteiro.format(valor || 0);

export const formatPercentual = (fracao: number, casas = 1) =>
  `${((fracao || 0) * 100).toFixed(casas).replace(".", ",")}%`;

export const formatData = (iso: string | Date) =>
  new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export const formatDataHora = (iso: string | Date) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

export const formatHora = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export const paraInputDate = (d: Date) => {
  const mes = `${d.getMonth() + 1}`.padStart(2, "0");
  const dia = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
};

export const tempoRelativo = (iso: string) => {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `${diffMin} min atrás`;
  const horas = Math.round(diffMin / 60);
  if (horas < 24) return `${horas} h atrás`;
  return `${Math.round(horas / 24)} d atrás`;
};
