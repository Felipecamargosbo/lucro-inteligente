import { useEffect, useState } from "react";
import { deslocarCompetencia } from "@/lib/finance";
import type { Lancamento, TipoLancamento } from "@/types";

/**
 * Lançamentos (despesas/receitas fora de venda) salvos no navegador.
 * Interino: enquanto não existe banco de dados (Supabase), o estado vive no
 * localStorage — sobrevive a um F5, mas é por navegador/dispositivo, não é
 * compartilhado entre sessões nem sincroniza em nenhum outro lugar.
 */
const CHAVE_STORAGE = "nexo:lancamentos";

function carregarInicial(): Lancamento[] {
  if (typeof window === "undefined") return [];
  try {
    const bruto = window.localStorage.getItem(CHAVE_STORAGE);
    if (!bruto) return [];
    const dados = JSON.parse(bruto);
    if (!Array.isArray(dados)) return [];
    return dados as Lancamento[];
  } catch {
    return [];
  }
}

export interface DadosNovoLancamento {
  empresaId: string;
  tipo: TipoLancamento;
  categoria: string;
  descricao: string;
  /** Mês em que começa, "2026-09" */
  competencia: string;
  valor: number;
  recorrente: boolean;
}

export function useLancamentos() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>(carregarInicial);

  useEffect(() => {
    try {
      window.localStorage.setItem(CHAVE_STORAGE, JSON.stringify(lancamentos));
    } catch {
      // localStorage indisponível (aba anônima, cota cheia etc.) — segue só em memória
    }
  }, [lancamentos]);

  const criar = (dados: DadosNovoLancamento) => {
    const novo: Lancamento = {
      id: `lanc-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      empresaId: dados.empresaId,
      tipo: dados.tipo,
      categoria: dados.categoria,
      descricao: dados.descricao,
      competencia: dados.competencia,
      valor: dados.valor,
      recorrente: dados.recorrente,
      competenciaFim: null,
      mesesExcluidos: [],
      criadoEm: new Date().toISOString(),
    };
    setLancamentos((atual) => [novo, ...atual]);
    return novo;
  };

  /**
   * Exclui só esta ocorrência (este mês específico). Se o lançamento NÃO for
   * recorrente ele só existia mesmo neste mês, então some de vez; se for
   * recorrente, vira uma exceção pontual — os outros meses continuam iguais.
   */
  const excluirNoMes = (id: string, competencia: string) => {
    setLancamentos((atual) =>
      atual.flatMap((l) => {
        if (l.id !== id) return [l];
        if (!l.recorrente) return [];
        if (l.mesesExcluidos.includes(competencia)) return [l];
        return [{ ...l, mesesExcluidos: [...l.mesesExcluidos, competencia] }];
      }),
    );
  };

  /**
   * Para a recorrência a partir do mês indicado (inclusive) pra frente. Os
   * meses anteriores a esse — já lançados — continuam exatamente como estão.
   */
  const pararRecorrencia = (id: string, competenciaAtual: string) => {
    setLancamentos((atual) =>
      atual.map((l) =>
        l.id === id
          ? { ...l, competenciaFim: deslocarCompetencia(competenciaAtual, -1) }
          : l,
      ),
    );
  };

  return { lancamentos, criar, excluirNoMes, pararRecorrencia };
}
