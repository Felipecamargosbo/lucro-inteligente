/**
 * A mesma base de contas da Precificação, para outras telas (Promoções):
 * CMV do produto, ajustes de Ads/Outros, faixas, preço planejado, desconto
 * padrão da conta e margem mínima. Assim as duas telas mostram o mesmo
 * lucro e a mesma situação de promoção para cada anúncio.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ajustesCustoService,
  faixasPrecoService,
  precosPlanejadosService,
  preferenciasPrecoService,
  produtosService,
  type PrecoPlanejado,
} from "@/services";
import { useAuth } from "@/context/auth";
import { useConfiguracoes } from "@/context/configuracoes";
import { FAIXAS_MARGEM_PADRAO } from "@/lib/finance";
import {
  AJUSTE_PADRAO,
  detalharPreco,
  type AjusteCusto,
  type ConfigPrecificacao,
  type Detalhamento,
  type FaixasPorCanal,
} from "@/lib/precificacao";
import { contaDaLinha, type ContaDaLinha } from "@/lib/linha-preco";
import { custosEm, useVersaoCustos } from "@/lib/custos-canal";
import type { Anuncio } from "@/types";

export interface BasePrecificacao {
  pronto: boolean;
  cfg: ConfigPrecificacao;
  planos: Map<string, PrecoPlanejado>;
  margemMinimaDe: (a: Anuncio) => number;
  ajusteDe: (a: Anuncio) => AjusteCusto;
  /** Situação completa do anúncio (preço cheio, promoção, lucro...) */
  linha: (a: Anuncio) => ContaDaLinha;
  /** Lucro e margem do anúncio vendido a `preco` (frete do canal nesse preço) */
  noPreco: (a: Anuncio, preco: number) => Detalhamento;
  recarregar: () => void;
}

export function useBasePrecificacao(): BasePrecificacao {
  const { sessao } = useAuth();
  const { metasPorConta, fiscal, custoOperacionalDetalhado } = useConfiguracoes();
  const [pronto, setPronto] = useState(false);
  const [ajustes, setAjustes] = useState<Map<string, AjusteCusto>>(new Map());
  const [faixas, setFaixas] = useState<FaixasPorCanal>({});
  const [planos, setPlanos] = useState<Map<string, PrecoPlanejado>>(new Map());
  const [padroes, setPadroes] = useState<Record<string, number>>({});
  const [versao, setVersao] = useState(0);
  const versaoCustos = useVersaoCustos();

  useEffect(() => {
    if (!sessao) return;
    let cancelado = false;
    Promise.all([
      produtosService.listar(sessao.user.id),
      ajustesCustoService.listar(sessao.user.id),
      faixasPrecoService.listar(sessao.user.id),
      precosPlanejadosService.listar(sessao.user.id),
      preferenciasPrecoService.listar(sessao.user.id),
    ]).then(([produtos, mapaAjustes, regras, mapaPlanos, mapaPadroes]) => {
      if (cancelado) return;
      // CMV do produto em cada anúncio (pelo SKU).
      produtosService.reconciliarComAnuncios(produtos);
      setAjustes(mapaAjustes);
      setFaixas(regras);
      setPlanos(mapaPlanos);
      setPadroes(mapaPadroes);
      setPronto(true);
    });
    return () => {
      cancelado = true;
    };
  }, [sessao, versao]);

  const cfg: ConfigPrecificacao = useMemo(
    () => ({ aliquotaImposto: fiscal.aliquota, custosOperacionais: custoOperacionalDetalhado, faixas }),
    [fiscal, custoOperacionalDetalhado, faixas],
  );

  const margemMinimaDe = useCallback(
    (a: Anuncio) => metasPorConta[a.contaId]?.margemMinima ?? FAIXAS_MARGEM_PADRAO.margemMinima,
    [metasPorConta],
  );
  const ajusteDe = useCallback((a: Anuncio) => ajustes.get(a.id) ?? AJUSTE_PADRAO, [ajustes]);

  const linha = useCallback(
    (a: Anuncio) =>
      contaDaLinha({
        anuncio: a,
        comCmv: a,
        ajuste: ajusteDe(a),
        cfg,
        plano: planos.get(a.id) ?? null,
        descontoPadrao: padroes[a.contaId] ?? null,
        margemMinima: margemMinimaDe(a),
        custos: (preco) => custosEm(a.id, preco),
      }),
    // versaoCustos: refaz quando chega frete novo do canal
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ajusteDe, cfg, planos, padroes, margemMinimaDe, versaoCustos],
  );

  const noPreco = useCallback(
    (a: Anuncio, preco: number) =>
      detalharPreco(
        a,
        preco,
        ajusteDe(a),
        cfg,
        undefined,
        Math.abs(preco - a.precoAtual) < 0.005 ? null : (custosEm(a.id, preco) ?? null),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ajusteDe, cfg, versaoCustos],
  );

  return {
    pronto,
    cfg,
    planos,
    margemMinimaDe,
    ajusteDe,
    linha,
    noPreco,
    recarregar: () => setVersao((v) => v + 1),
  };
}
