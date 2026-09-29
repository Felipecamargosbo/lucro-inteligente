import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  BarChart3,
  Bot,
  Boxes,
  MessageCircle,
  ShieldCheck,
  Target,
  TrendingDown,
  Wand2,
  Warehouse,
} from "lucide-react";
import {
  anunciosService,
  adsService,
  auditorService,
  contasService,
  criativoConfigService,
  criativoService,
  estoqueService,
  fichasService,
  modelosSacService,
  regrasSacService,
  sacConfigService,
  eventosAgenteService,
  fulfillmentService,
  mudancasPrecoService,
  produtosService,
  promocoesService,
  sacService,
  vendasService,
  type RascunhoCriativo,
} from "@/services";
import { getMarketplace } from "@/data/mock";
import { useAuth } from "@/context/auth";
import { useConfiguracoes } from "@/context/configuracoes";
import { useSelecaoContas } from "@/context/selecao-contas";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import {
  avaliarCampanhas,
  avaliarMudancaPreco,
  chaveSugestaoPreco,
  precosPorCanal,
  situacaoEstoquePorSku,
  sugerirPrecos,
  analisarFulfillment,
  analisarReposicaoEstoque,
  analisarRoasAnuncios,
  chaveAlertaEstoque,
  mesclarAlertasEstoque,
  auditarCobrancas,
  auditarCobrancasFull,
  auditarMudancasTaxa,
  mesclarOcorrenciasAuditor,
  diagnosticarCurvaAbc,
  diagnosticarDadoFaltando,
  diagnosticarQuedaMargem,
  diagnosticarSaudeContas,
  FAIXAS_MARGEM_PADRAO,
  montarResumoDiario,
  sugerirAnunciosParaAds,
  type AnaliseRoasAnuncio,
} from "@/lib/finance";
import {
  CONFIGURACAO_SAC_PADRAO,
  MODELOS_SAC_PADRAO,
  classificarPergunta,
  perguntasRepetidas,
  type PerguntaRepetida,
} from "@/lib/sac";
import {
  CONFIGURACAO_CRIATIVO_PADRAO,
  limiteTitulo,
  listaPalavrasSeller,
} from "@/lib/criativo";
import { Painel } from "@/components/comum/Indicadores";
import { cn } from "@/lib/utils";
import type {
  AcaoAds,
  AlertaEstoque,
  Anuncio,
  ConfiguracaoCriativo,
  ConfiguracaoSac,
  MarketplaceId,
  Pedido,
  RegraSac,
  SituacaoSac,
  OcorrenciaAuditor,
  StatusOcorrenciaAuditor,
  EventoAds,
  EventoAgente,
  InsightAnalista,
  StatusSugestao,
  SugestaoCriativo,
  TicketSac,
} from "@/types";
import { PainelPrecificacao } from "@/components/agentes/Precificacao";
import { PainelAnalista } from "@/components/agentes/Gestor";
import { PainelSac } from "@/components/agentes/Sac";
import { PainelEstoque } from "@/components/agentes/Estoque";
import { PainelFulfillment } from "@/components/agentes/Fulfillment";
import { PainelAds, montarAcoesAds } from "@/components/agentes/Ads";
import { PainelAuditor } from "@/components/agentes/Auditor";
import { PainelCriativo } from "@/components/agentes/Criativo";
import { ModalFicha, type AlvoFicha } from "@/components/agentes/ModalFicha";

export const Route = createFileRoute("/agentes")({
  head: () => ({
    meta: [
      { title: "Agentes | NEXO" },
      {
        name: "description",
        content:
          "O que os agentes decidiram, por quê, e o que está esperando a sua aprovação.",
      },
      { property: "og:title", content: "Agentes | NEXO" },
    ],
  }),
  component: Agentes,
});


/** Perguntas comuns de cliente de marketplace, só pra semear os
 * primeiros tickets de exemplo — fictícias até a API de mensagens
 * conectar. */
const PERGUNTAS_FICTICIAS = [
  "Esse produto tem garantia? Por quanto tempo?",
  "Qual o prazo de entrega pro meu CEP?",
  "Vocês têm em outra cor ou modelo?",
  "Posso trocar se não servir ou não gostar?",
];

/** Marca da leva de exemplos do Bloco 6 — cria só uma vez por seller. */
const LOTE_EXEMPLOS_SAC = "bloco6";

/**
 * Exemplos de cada tipo de mensagem (FICTÍCIOS, até a API de mensagens
 * conectar): dois de pós-venda (um pedido já despachado, outro não), uma
 * reclamação e três perguntas repetidas sobre o mesmo produto.
 */
function montarTicketsExemploSac(anuncios: Anuncio[], pedidos: Pedido[]) {
  const tickets: {
    contaId: string | null;
    anuncioId: string | null;
    produto: string;
    sku: string;
    marketplaceId: MarketplaceId;
    pergunta: string;
    pedidoId?: string | null;
    cliente?: string | null;
  }[] = [];
  const anuncioDe = (p: Pedido) =>
    anuncios.find((a) => a.contaId === p.contaId && a.sku === p.sku) ?? null;
  const doPedido = (p: Pedido, pergunta: string) => {
    const a = anuncioDe(p);
    tickets.push({
      contaId: p.contaId,
      anuncioId: a?.id ?? null,
      produto: p.produto,
      sku: p.sku,
      marketplaceId: p.marketplaceId,
      pergunta,
      pedidoId: p.id,
      cliente: p.cliente,
    });
  };
  const emTransito = pedidos.find((p) => p.status === "em-transito" && anuncioDe(p));
  const aguardando = pedidos.find((p) => p.status === "aguardando-envio" && anuncioDe(p));
  const entregue = pedidos.find((p) => p.status === "entregue" && anuncioDe(p));
  if (emTransito) doPedido(emTransito, "Oi, comprei faz 3 dias e ainda não chegou. Cadê meu pedido?");
  if (aguardando) doPedido(aguardando, "Meu pedido ainda não foi enviado? Já faz dois dias que comprei.");
  if (entregue)
    doPedido(entregue, "O produto chegou com defeito, não liga de jeito nenhum. Quero meu dinheiro de volta!");

  const pelicula = anuncios.find((a) => a.sku === "PEL-IP15-PM") ?? anuncios[0];
  if (pelicula) {
    for (const pergunta of [
      "Serve no iPhone 15 normal ou só no Pro Max?",
      "É compatível com o iPhone 14 Pro Max?",
      "Serve no iPhone 15 Plus?",
    ]) {
      tickets.push({
        contaId: pelicula.contaId,
        anuncioId: pelicula.id,
        produto: pelicula.produto,
        sku: pelicula.sku,
        marketplaceId: pelicula.marketplaceId,
        pergunta,
      });
    }
  }
  return tickets;
}


function Agentes() {
  const { metasPorConta, fiscal, custoOperacionalTotal } = useConfiguracoes();
  const { selecionadas: contasSelecionadas, todasSelecionadas: semRestricaoDeConta } =
    useSelecaoContas();
  const { sessao, recursos } = useAuth();
  const [abaAgente, setAbaAgente] = useState<
    | "analista"
    | "precificacao"
    | "sac"
    | "estoque"
    | "fulfillment"
    | "ads"
    | "auditor"
    | "criativo"
  >("analista");
  const [eventos, setEventos] = useState<EventoAgente[]>([]);
  const [insights, setInsights] = useState<InsightAnalista[]>([]);
  const [tickets, setTickets] = useState<TicketSac[]>([]);
  const [alertasEstoque, setAlertasEstoque] = useState<AlertaEstoque[]>([]);
  const [carregandoEstoque, setCarregandoEstoque] = useState(true);
  const [alertasFulfillment, setAlertasFulfillment] = useState<AlertaEstoque[]>([]);
  const [carregandoFulfillment, setCarregandoFulfillment] = useState(true);
  const [avaliacoesAds, setAvaliacoesAds] = useState<EventoAds[]>([]);
  const [analisesAds, setAnalisesAds] = useState<AnaliseRoasAnuncio[]>([]);
  const [acoesAds, setAcoesAds] = useState<AcaoAds[]>([]);
  const [carregandoAds, setCarregandoAds] = useState(true);
  const [ocorrenciasAuditor, setOcorrenciasAuditor] = useState<OcorrenciaAuditor[]>([]);
  const [carregandoAuditor, setCarregandoAuditor] = useState(true);
  const [carregandoTickets, setCarregandoTickets] = useState(true);
  /** Ticket com resposta em andamento de gerar (mostra o spinner só nele) */
  const [gerandoId, setGerandoId] = useState<string | null>(null);
  /** O que deixa a resposta do SAC com a cara da loja: personalização,
   * regras aprendidas, fichas dos produtos e mensagens prontas. */
  const [configSac, setConfigSac] = useState<ConfiguracaoSac>(CONFIGURACAO_SAC_PADRAO);
  const [regrasSac, setRegrasSac] = useState<RegraSac[]>([]);
  const [fichas, setFichas] = useState<Map<string, string>>(new Map());
  const [modelosSac, setModelosSac] = useState<Record<SituacaoSac, string>>(MODELOS_SAC_PADRAO);
  /** Rascunho editável de cada ticket, por id — separado do que já está
   * salvo, pra o seller poder ajustar antes de aprovar. */
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [sugestoesCriativo, setSugestoesCriativo] = useState<SugestaoCriativo[]>([]);
  const [carregandoCriativo, setCarregandoCriativo] = useState(true);
  const [gerandoCriativoId, setGerandoCriativoId] = useState<string | null>(null);
  const [rascunhosCriativo, setRascunhosCriativo] = useState<Record<string, RascunhoCriativo>>({});
  /** Palavras proibidas e limite de título por canal do Criativo */
  const [configCriativo, setConfigCriativo] = useState<ConfiguracaoCriativo>(
    CONFIGURACAO_CRIATIVO_PADRAO,
  );
  /** Produto com a janela da ficha aberta (a mesma no SAC e no Criativo) */
  const [alvoFicha, setAlvoFicha] = useState<AlvoFicha | null>(null);
  const [carregando, setCarregando] = useState(true);

  /**
   * A varredura do agente. Hoje roda quando a tela abre; quando houver
   * servidor, é esta mesma função que passa a rodar de hora em hora sem
   * ninguém olhando. Só GRAVA sugestão nova pra SKU que ainda não tem
   * uma pendente — sem isso, toda vez que a tela abrisse duplicaria tudo.
   */
  const carregarEventos = useCallback(async () => {
    if (!sessao || !recursos.agentes) return;
    const perfilId = sessao.user.id;

    // Garante que o CMV dos produtos reais já está espalhado pros
    // anúncios de exemplo, mesmo que o seller nunca tenha passado pela
    // tela de Custos nesta sessão — senão o agente avalia sem custo.
    const produtos = await produtosService.listar(perfilId);
    produtosService.reconciliarComAnuncios(produtos);

    // Frentes 1 e 2: subir (vende rápido e o estoque vai acabar) e baixar
    // (parado, com corte que cresce com o tempo parado e o dinheiro preso).
    const candidatos = sugerirPrecos(
      anunciosService.listar(),
      situacaoEstoquePorSku(
        estoqueService.listarDetalhado(),
        fulfillmentService.listarDetalhado(),
        vendasService.listar(),
      ),
      (contaId) => metasPorConta[contaId] ?? FAIXAS_MARGEM_PADRAO,
      { aliquotaImposto: fiscal.aliquota, custosOperacionais: custoOperacionalTotal },
    );

    const jaPendentes = await eventosAgenteService.chavesPendentesPreco(perfilId);
    for (const c of candidatos) {
      if (jaPendentes.has(chaveSugestaoPreco(c))) continue;
      const erro = await eventosAgenteService.criar(perfilId, c);
      if (erro) console.error("Não consegui gravar a sugestão:", erro);
    }

    const lista = await eventosAgenteService.listar(perfilId, "precificacao");
    setEventos(lista);
    setCarregando(false);
  }, [sessao, recursos.agentes, metasPorConta, fiscal, custoOperacionalTotal]);

  /** Frentes 4 e 5 (campanhas e preço por canal): só leitura, recalculadas
   * sempre que as metas ou os custos mudam — não vão pro banco. */
  const analisesPreco = useMemo(() => {
    const metasDe = (contaId: string) => metasPorConta[contaId] ?? FAIXAS_MARGEM_PADRAO;
    const opcoes = { aliquotaImposto: fiscal.aliquota, custosOperacionais: custoOperacionalTotal };
    const anuncios = anunciosService.listar();
    const situacao = situacaoEstoquePorSku(
      estoqueService.listarDetalhado(),
      fulfillmentService.listarDetalhado(),
      vendasService.listar(),
    );
    return {
      campanhas: avaliarCampanhas(promocoesService.listar(), anuncios, situacao, metasDe, opcoes),
      porCanal: precosPorCanal(anuncios, metasDe, opcoes),
    };
  }, [metasPorConta, fiscal, custoOperacionalTotal]);

  const [carregandoInsights, setCarregandoInsights] = useState(true);

  /**
   * As cinco frentes do Analista, rodando de uma vez: queda de margem,
   * curva ABC, dado faltando, saúde da conta e o resumo do dia. Cada
   * frente só vira aviso quando tem algo que realmente merece atenção —
   * sem novidade, fica quieto.
   */
  const carregarInsights = useCallback(async () => {
    if (!sessao || !recursos.agentes) return;
    const perfilId = sessao.user.id;

    const pedidos = vendasService.listar();
    const anuncios = anunciosService.listar();
    const contasAtivas = contasService.ativas();
    const opcoesCusto = {
      aliquotaImposto: fiscal.aliquota,
      custosOperacionais: custoOperacionalTotal,
    };

    const quedaMargem = diagnosticarQuedaMargem(pedidos);
    const abc = diagnosticarCurvaAbc(anuncios, opcoesCusto);
    const dadoFaltando = diagnosticarDadoFaltando(anuncios, contasAtivas, metasPorConta);
    const saude = diagnosticarSaudeContas(contasAtivas);
    const hoje = new Date();
    const pedidosHoje = pedidos.filter(
      (p) => new Date(p.data).toDateString() === hoje.toDateString(),
    );
    const resumo = montarResumoDiario(pedidosHoje, quedaMargem, dadoFaltando, saude, abc);

    const candidatos: Omit<InsightAnalista, "id" | "status" | "decididoEm" | "data">[] = [];

    if (quedaMargem) {
      candidatos.push({
        tipo: "queda_margem",
        contaId: null,
        motivo: `Margem caiu ${Math.abs(quedaMargem.diferencaPP).toFixed(1)} pontos percentuais — de ${formatPercentual(quedaMargem.margemAnterior)} para ${formatPercentual(quedaMargem.margemAtual)} no período.`,
        semaforo: "amarelo",
        dados: { ...quedaMargem },
      });
    }

    if (abc && abc.cEmPrejuizo.length > 0) {
      candidatos.push({
        tipo: "curva_abc",
        contaId: null,
        motivo: `${abc.cEmPrejuizo.length} produto${abc.cEmPrejuizo.length > 1 ? "s" : ""} de baixo faturamento vendendo com prejuízo — candidato a rever preço ou descontinuar.`,
        semaforo: "vermelho",
        dados: {
          cEmPrejuizo: abc.cEmPrejuizo.map((i) => ({
            produto: i.anuncio.produto,
            sku: i.anuncio.sku,
          })),
          topA: abc.topA.map((i) => ({ produto: i.anuncio.produto, participacao: i.participacao })),
        },
      });
    } else if (abc && abc.topA.length > 0) {
      candidatos.push({
        tipo: "curva_abc",
        contaId: null,
        motivo: `${abc.topA.length} produto${abc.topA.length > 1 ? "s" : ""} concentra${abc.topA.length > 1 ? "m" : ""} a maior parte do seu faturamento.`,
        semaforo: "verde",
        dados: {
          topA: abc.topA.map((i) => ({ produto: i.anuncio.produto, participacao: i.participacao })),
        },
      });
    }

    if (dadoFaltando) {
      candidatos.push({
        tipo: "dado_faltando",
        contaId: null,
        motivo: `${dadoFaltando.anunciosSemCusto} anúncio(s) sem CMV e ${dadoFaltando.contasSemMeta} conta(s) sem margem mínima configurada — os cálculos desses ficam incompletos até isso ser preenchido.`,
        semaforo: "amarelo",
        dados: { ...dadoFaltando },
      });
    }

    for (const item of saude) {
      candidatos.push({
        tipo: "saude_conta",
        contaId: item.conta.id,
        motivo: item.alerta,
        semaforo: "vermelho",
        dados: { contaNome: item.conta.nome, marketplaceId: item.conta.marketplaceId },
      });
    }

    candidatos.push({
      tipo: "resumo_diario",
      contaId: null,
      motivo: `Hoje: ${formatBRL(resumo.faturamento)} em ${formatNumero(resumo.pedidos)} pedido(s), margem de ${formatPercentual(resumo.margem)}.`,
      semaforo: resumo.quedaDeMargem || resumo.contasEmAlerta > 0 ? "amarelo" : "verde",
      dados: { ...resumo },
    });

    const jaPendentes = await eventosAgenteService.tiposPendentes(perfilId);
    for (const c of candidatos) {
      const chave = `${c.tipo}:${c.contaId ?? ""}`;
      if (jaPendentes.has(chave)) continue;
      const erro = await eventosAgenteService.criarInsight(perfilId, c);
      if (erro) console.error("Não consegui gravar o aviso:", erro);
    }

    const lista = await eventosAgenteService.listarInsights(perfilId);
    setInsights(lista);
    setCarregandoInsights(false);
  }, [sessao, recursos.agentes, metasPorConta, fiscal, custoOperacionalTotal]);

  /**
   * Quatro perguntas comuns de cliente de marketplace, usadas só pra
   * semear os primeiros tickets de exemplo — a API de mensagens ainda
   * não existe, então a pergunta em si é sempre fictícia.
   */
  const carregarTickets = useCallback(async () => {
    if (!sessao || !recursos.agentes) return;
    const perfilId = sessao.user.id;

    // O contexto do SAC vem junto: personalização, regras, fichas e
    // mensagens prontas. Nada disso gasta token — é só leitura do banco.
    const [config, regras, mapaFichas, modelos] = await Promise.all([
      sacConfigService.carregar(perfilId),
      regrasSacService.listar(perfilId),
      fichasService.listar(perfilId),
      modelosSacService.listar(perfilId),
    ]);
    setConfigSac(config);
    setRegrasSac(regras);
    setFichas(mapaFichas);
    setModelosSac(modelos);

    const anunciosAtivos = anunciosService.listar().filter((a) => a.status === "ativo");
    const existentes = await sacService.listar(perfilId);
    if (existentes.length === 0) {
      const amostra = anunciosAtivos.slice(0, Math.min(4, anunciosAtivos.length));
      for (let i = 0; i < amostra.length; i++) {
        const a = amostra[i]!;
        const erro = await sacService.criarTicket(perfilId, {
          contaId: a.contaId,
          anuncioId: a.id,
          produto: a.produto,
          sku: a.sku,
          marketplaceId: a.marketplaceId,
          pergunta: PERGUNTAS_FICTICIAS[i % PERGUNTAS_FICTICIAS.length]!,
        });
        if (erro) console.error("Não consegui criar o ticket de exemplo:", erro);
      }
    }

    // Leva de exemplos do Bloco 6 (uma vez só): pós-venda, reclamação e
    // perguntas repetidas — pra mostrar cada tipo de mensagem na tela.
    const lotes = await sacService.lotesCriados(perfilId);
    if (!lotes.has(LOTE_EXEMPLOS_SAC)) {
      for (const t of montarTicketsExemploSac(anunciosAtivos, vendasService.listar())) {
        const erro = await sacService.criarTicket(perfilId, { ...t, lote: LOTE_EXEMPLOS_SAC });
        if (erro) console.error("Não consegui criar o ticket de exemplo:", erro);
      }
    }

    const lista = await sacService.listar(perfilId);
    setTickets(lista);
    setCarregandoTickets(false);
  }, [sessao, recursos.agentes]);

  /** Semeia algumas sugestões de exemplo, uma vez só, a partir de
   * anúncios ativos reais — igual o SAC faz com as perguntas fictícias. */
  const carregarSugestoesCriativo = useCallback(async () => {
    if (!sessao || !recursos.agentes) return;
    const perfilId = sessao.user.id;

    setConfigCriativo(await criativoConfigService.carregar(perfilId));

    const existentes = await criativoService.listar(perfilId);
    if (existentes.length === 0) {
      const anunciosAtivos = anunciosService.listar().filter((a) => a.status === "ativo");
      const amostra = anunciosAtivos.slice(0, Math.min(4, anunciosAtivos.length));
      for (const a of amostra) {
        const erro = await criativoService.criarSugestao(perfilId, {
          contaId: a.contaId,
          anuncioId: a.id,
          produto: a.produto,
          sku: a.sku,
          marketplaceId: a.marketplaceId,
        });
        if (erro) console.error("Não consegui criar a sugestão criativa de exemplo:", erro);
      }
    }

    const lista = await criativoService.listar(perfilId);
    setSugestoesCriativo(lista);
    setCarregandoCriativo(false);
  }, [sessao, recursos.agentes]);

  /**
   * Agente de Estoque (estoque próprio): avisa a tempo de o fornecedor
   * entregar, diz se vale a pena repor (margem depois do Ads + curva ABC)
   * e quanto dinheiro a reposição exige. O banco guarda o status de cada
   * alerta; os números vêm sempre do cálculo de agora.
   */
  const carregarAlertasEstoque = useCallback(async () => {
    if (!sessao || !recursos.agentes) return;
    const perfilId = sessao.user.id;

    const calculados = analisarReposicaoEstoque(
      estoqueService.listarDetalhado(),
      vendasService.listar(),
      contasService.ativas(),
    );

    const jaPendentes = await estoqueService.chavesPendentes(perfilId);
    for (const a of calculados) {
      if (jaPendentes.has(chaveAlertaEstoque(a))) continue;
      const erro = await estoqueService.criarAlerta(perfilId, { ...a, contaId: null });
      if (erro) console.error("Não consegui gravar o alerta de estoque:", erro);
    }

    const gravados = await estoqueService.listarAlertas(perfilId);
    setAlertasEstoque(mesclarAlertasEstoque(gravados, calculados));
    setCarregandoEstoque(false);
  }, [sessao, recursos.agentes]);

  /** Agente de Fulfillment: o que vai faltar no Full (contando o prazo de
   * envio até o centro de distribuição, quanto mandar e quanto comprar)
   * e o que está parado lá pagando armazenagem. */
  const carregarAlertasFulfillment = useCallback(async () => {
    if (!sessao || !recursos.agentes) return;
    const perfilId = sessao.user.id;

    const calculados = analisarFulfillment(
      fulfillmentService.listarDetalhado(),
      estoqueService.listarDetalhado(),
      vendasService.listar(),
      contasService.ativas(),
    );

    const jaPendentes = await fulfillmentService.chavesPendentes(perfilId);
    for (const a of calculados) {
      if (jaPendentes.has(chaveAlertaEstoque(a))) continue;
      const erro = await fulfillmentService.criarAlerta(perfilId, { ...a, contaId: null });
      if (erro) console.error("Não consegui gravar o alerta de fulfillment:", erro);
    }

    const gravados = await fulfillmentService.listarAlertas(perfilId);
    setAlertasFulfillment(mesclarAlertasEstoque(gravados, calculados));
    setCarregandoFulfillment(false);
  }, [sessao, recursos.agentes]);

  /**
   * O Agente de Ads, em duas partes:
   * 1. Candidatos: produtos que vendem bem sem nenhum Ads (a partir dos
   *    pedidos dos últimos 30 dias).
   * 2. ROAS: cada anúncio em Ads comparado com o ROAS mínimo que a margem
   *    dele aguenta — daí saem as ações (ajustar objetivo, mover verba,
   *    anúncio cansado). As ações vão pro banco pra ter aprovar/recusar e
   *    histórico; a análise em si é recalculada toda vez, sempre fresca.
   */
  const carregarAvaliacoesAds = useCallback(async () => {
    if (!sessao || !recursos.agentes) return;
    const perfilId = sessao.user.id;

    const pedidos = vendasService.listar();
    const fim = new Date();
    const inicio = new Date(fim.getTime() - 29 * 86400000);
    const periodo = { inicio, fim, rotulo: "Últimos 30 dias" };

    const jaSugeridos = await adsService.skusPendentes(perfilId, "sugestao");
    for (const s of sugerirAnunciosParaAds(pedidos, periodo)) {
      if (jaSugeridos.has(s.sku)) continue;
      const erro = await adsService.criarEvento(perfilId, {
        tipo: "sugestao",
        contaId: null,
        sku: s.sku,
        produto: s.produto,
        quantidade: s.quantidade,
        unidadesPorDia: s.unidadesPorDia,
        faturamento: s.faturamento,
        investimento: 0,
        lucroLiquido: s.lucroLiquido,
        margemSemAds: s.margem,
        margemComAds: s.margem,
        valeAPena: null,
      });
      if (erro) console.error("Não consegui gravar a sugestão de Ads:", erro);
    }

    // Garante o CMV dos produtos reais nos anúncios antes de calcular a
    // margem de contribuição (mesmo cuidado do agente de Precificação).
    const produtos = await produtosService.listar(perfilId);
    produtosService.reconciliarComAnuncios(produtos);

    const analises = analisarRoasAnuncios(
      anunciosService.listar(),
      adsService.historico(),
      estoqueService.listarDetalhado(),
      { aliquotaImposto: fiscal.aliquota, custosOperacionais: custoOperacionalTotal },
    );
    setAnalisesAds(analises);

    const jaPendentes = await adsService.chavesAcoesPendentes(perfilId);
    for (const { chave, acao } of montarAcoesAds(analises)) {
      if (jaPendentes.has(chave)) continue;
      const erro = await adsService.criarAcao(perfilId, acao, chave);
      if (erro) console.error("Não consegui gravar a ação de Ads:", erro);
    }

    const [lista, acoes] = await Promise.all([
      adsService.listar(perfilId),
      adsService.listarAcoes(perfilId),
    ]);
    setAvaliacoesAds(lista);
    setAcoesAds(acoes);
    setCarregandoAds(false);
  }, [sessao, recursos.agentes, fiscal, custoOperacionalTotal]);

  /**
   * A varredura do Auditor: confere os pedidos dos últimos 30 dias contra
   * a regra de cada conta e junta as mudanças de taxa detectadas. Só grava
   * o que ainda não foi registrado — inclusive o que o seller já ignorou
   * não volta.
   */
  const carregarAuditor = useCallback(async () => {
    if (!sessao || !recursos.agentes) return;
    const perfilId = sessao.user.id;

    const contas = contasService.ativas();
    const pedidos = vendasService.listar();
    const encontradas = [
      ...auditarMudancasTaxa(
        auditorService.historicoTaxas(),
        anunciosService.listar(),
        pedidos,
        contas,
      ),
      ...auditarCobrancas(pedidos, contas),
      ...auditarCobrancasFull(
        auditorService.cobrancasFull(),
        fulfillmentService.listarDetalhado(),
        contas,
      ),
    ];

    const jaRegistradas = await auditorService.chavesRegistradas(perfilId);
    for (const o of encontradas) {
      if (jaRegistradas.has(o.chave)) continue;
      const erro = await auditorService.criar(perfilId, o);
      if (erro) console.error("Não consegui gravar a ocorrência do Auditor:", erro);
    }

    // O banco guarda o status; a conta e as explicações vêm sempre do
    // cálculo de agora — assim ocorrências antigas ganham as melhorias.
    const gravadas = await auditorService.listar(perfilId);
    setOcorrenciasAuditor(mesclarOcorrenciasAuditor(gravadas, encontradas));
    setCarregandoAuditor(false);
  }, [sessao, recursos.agentes]);

  useEffect(() => {
    carregarEventos();
    carregarInsights();
    carregarTickets();
    carregarAlertasEstoque();
    carregarAlertasFulfillment();
    carregarAvaliacoesAds();
    carregarAuditor();
    carregarSugestoesCriativo();
  }, [
    carregarEventos,
    carregarInsights,
    carregarTickets,
    carregarAlertasEstoque,
    carregarAlertasFulfillment,
    carregarAvaliacoesAds,
    carregarAuditor,
    carregarSugestoesCriativo,
  ]);

  // O filtro de canal ("Todas as contas") só recorta o que aparece — não
  // muda o que o agente já gravou. Assim trocar o filtro não refaz a
  // varredura nem conversa de novo com o banco.
  const eventosNaSelecao = semRestricaoDeConta
    ? eventos
    : eventos.filter((e) => contasSelecionadas.has(e.contaId));

  const pendentes = eventosNaSelecao.filter((e) => e.status === "pendente");
  const decididos = eventosNaSelecao.filter((e) => e.status !== "pendente");
  const aprovadas = decididos.filter((e) => e.status === "aprovada").length;

  /** Frente 3: o resultado de cada mudança de preço aprovada (e dos
   * exemplos fictícios, enquanto não há histórico real). */
  const resultadosPreco = useMemo(() => {
    const pedidos = vendasService.listar();
    const aprovadasReais = eventosNaSelecao
      .filter((e) => e.status === "aprovada" && e.decididoEm)
      .map((e) => ({
        id: e.id,
        anuncioId: e.anuncioId,
        sku: e.sku,
        produto: e.produto,
        marketplaceId: e.marketplaceId,
        contaId: e.contaId,
        precoAntes: e.precoAtual,
        precoDepois: e.precoSugerido,
        data: e.decididoEm!,
        exemplo: false,
      }));
    return [...aprovadasReais, ...mudancasPrecoService.exemplos()]
      .map((m) => avaliarMudancaPreco(m, pedidos))
      .sort((a, b) => a.diasDesde - b.diasDesde);
  }, [eventosNaSelecao]);

  const decidir = async (evento: EventoAgente, status: StatusSugestao) => {
    if (status !== "aprovada" && status !== "recusada") return;
    // Otimista: a tela responde na hora.
    setEventos((atual) =>
      atual.map((e) =>
        e.id === evento.id ? { ...e, status, decididoEm: new Date().toISOString() } : e,
      ),
    );
    const erro = await eventosAgenteService.decidir(evento.id, status);
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      await carregarEventos();
      return;
    }
    if (status === "aprovada") {
      toast.success(
        `Aprovado: ${evento.produto} de ${formatBRL(evento.precoAtual)} para ${formatBRL(evento.precoSugerido)}. Aplique no marketplace — sem API conectada, o agente ainda não altera sozinho.`,
      );
    } else {
      toast(`Recusado: ${evento.produto} segue em ${formatBRL(evento.precoAtual)}.`);
    }
  };

  const dispensarInsight = async (insight: InsightAnalista) => {
    setInsights((atual) =>
      atual.map((i) =>
        i.id === insight.id ? { ...i, status: "aprovada", decididoEm: new Date().toISOString() } : i,
      ),
    );
    const erro = await eventosAgenteService.decidir(insight.id, "aprovada");
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      await carregarInsights();
    }
  };

  const dispensarAlertaEstoque = async (alerta: AlertaEstoque) => {
    setAlertasEstoque((atual) =>
      atual.map((a) =>
        a.id === alerta.id ? { ...a, status: "aprovada", decididoEm: new Date().toISOString() } : a,
      ),
    );
    const erro = await eventosAgenteService.decidir(alerta.id, "aprovada");
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      await carregarAlertasEstoque();
    }
  };

  const dispensarAlertaFulfillment = async (alerta: AlertaEstoque) => {
    setAlertasFulfillment((atual) =>
      atual.map((a) =>
        a.id === alerta.id ? { ...a, status: "aprovada", decididoEm: new Date().toISOString() } : a,
      ),
    );
    const erro = await eventosAgenteService.decidir(alerta.id, "aprovada");
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      await carregarAlertasFulfillment();
    }
  };

  const decidirAcaoAds = async (
    acao: AcaoAds,
    status: Extract<StatusSugestao, "aprovada" | "recusada">,
  ) => {
    setAcoesAds((atual) =>
      atual.map((a) =>
        a.id === acao.id ? { ...a, status, decididoEm: new Date().toISOString() } : a,
      ),
    );
    const erro = await eventosAgenteService.decidir(acao.id, status);
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      await carregarAvaliacoesAds();
      return;
    }
    toast.success(
      status === "aprovada"
        ? "Aprovado. Agora faça o ajuste no Ads do marketplace — sem API conectada, o NEXO ainda não altera sozinho."
        : `Recusado: ${acao.produto}.`,
    );
  };

  const dispensarAvaliacaoAds = async (av: EventoAds) => {
    setAvaliacoesAds((atual) =>
      atual.map((a) =>
        a.id === av.id ? { ...a, status: "aprovada", decididoEm: new Date().toISOString() } : a,
      ),
    );
    const erro = await eventosAgenteService.decidir(av.id, "aprovada");
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      await carregarAvaliacoesAds();
    }
  };

  /** Só aqui sai custo de token de verdade — por isso é sempre um clique
   * do seller, nunca automático. */
  const gerarRespostaSac = async (ticket: TicketSac) => {
    setGerandoId(ticket.id);
    const { resposta, erro } = await sacService.gerarResposta({
      pergunta: ticket.pergunta,
      produto: ticket.produto,
      categoria: classificarPergunta(ticket.pergunta, ticket.pedidoId),
      ficha: fichas.get(ticket.sku) ?? null,
      config: configSac,
      regras: regrasSac.filter((r) => r.ativa).map((r) => r.regra),
    });
    setGerandoId(null);
    if (erro) {
      toast.error(`Não consegui gerar a resposta: ${erro}`);
      return;
    }
    if (!resposta) return;
    const erroSalvar = await sacService.salvarResposta(ticket.id, resposta);
    if (erroSalvar) {
      toast.error(`Gerei a resposta, mas não consegui salvar: ${erroSalvar}`);
      return;
    }
    setTickets((atual) => atual.map((t) => (t.id === ticket.id ? { ...t, resposta } : t)));
    setRascunhos((atual) => ({ ...atual, [ticket.id]: resposta }));
  };

  /** O seller editou a resposta da IA e pediu pra aprender: o Gestor
   * compara as duas versões e propõe uma regra (o seller confirma antes). */
  const aprenderComEdicaoSac = async (
    ticket: TicketSac,
    original: string,
    editada: string,
  ): Promise<string | null> => {
    const { regra, erro } = await sacService.aprenderComEdicao({
      pergunta: ticket.pergunta,
      produto: ticket.produto,
      respostaOriginal: original,
      respostaEditada: editada,
    });
    if (erro) {
      toast.error(`Não consegui analisar a edição: ${erro}`);
      return null;
    }
    if (!regra) toast("A edição foi pequena demais pra virar uma regra — nada foi mudado.");
    return regra;
  };

  const salvarRegraSac = async (regra: string, origem: RegraSac["origem"]) => {
    if (!sessao) return;
    const erro = await regrasSacService.criar(sessao.user.id, regra, origem);
    if (erro) {
      toast.error(`Não consegui salvar a regra: ${erro}`);
      return;
    }
    setRegrasSac(await regrasSacService.listar(sessao.user.id));
    toast.success("Regra salva. As próximas respostas do SAC já seguem ela.");
  };

  const salvarModeloSac = async (situacao: SituacaoSac, texto: string) => {
    if (!sessao) return;
    const erro = await modelosSacService.salvar(sessao.user.id, situacao, texto);
    if (erro) {
      toast.error(`Não consegui salvar a mensagem: ${erro}`);
      return;
    }
    setModelosSac((atual) => ({ ...atual, [situacao]: texto }));
    toast.success("Mensagem salva como padrão pras próximas.");
  };

  /** Perguntas repetidas = anúncio incompleto: manda pro Criativo. */
  const enviarRepetidaParaCriativo = async (g: PerguntaRepetida) => {
    if (!sessao) return;
    const erro = await criativoService.criarSugestao(sessao.user.id, {
      contaId: g.contaId,
      anuncioId: g.anuncioId,
      produto: g.produto,
      sku: g.sku,
      marketplaceId: g.marketplaceId,
      origem: "sac",
      motivo: `${g.quantidade} clientes perguntaram sobre ${g.assunto} de "${g.produto}". O anúncio provavelmente não explica isso — inclua essa informação na descrição, nos bullet points ou nas fotos.`,
    });
    if (erro) {
      toast.error(`Não consegui mandar pro Criativo: ${erro}`);
      return;
    }
    toast.success("Enviado pro Agente Criativo, com o motivo junto.");
    await carregarSugestoesCriativo();
  };

  const decidirTicket = async (
    ticket: TicketSac,
    status: Extract<StatusSugestao, "aprovada" | "recusada">,
    /** Texto final quando não veio da IA (mensagem pronta de pós-venda
     * ou resposta escrita pelo seller numa reclamação) */
    textoFinal?: string,
  ) => {
    const rascunho = textoFinal ?? rascunhos[ticket.id];
    if (status === "aprovada" && rascunho && rascunho !== ticket.resposta) {
      const erroSalvar = await sacService.salvarResposta(ticket.id, rascunho);
      if (erroSalvar) {
        toast.error(`Não consegui salvar a edição: ${erroSalvar}`);
        return;
      }
    }
    setTickets((atual) =>
      atual.map((t) =>
        t.id === ticket.id
          ? {
              ...t,
              status,
              decididoEm: new Date().toISOString(),
              resposta: status === "aprovada" ? (rascunho ?? t.resposta) : t.resposta,
            }
          : t,
      ),
    );
    const erro = await eventosAgenteService.decidir(ticket.id, status);
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      await carregarTickets();
      return;
    }
    toast.success(
      status === "aprovada"
        ? "Aprovado. Sem canal de mensagem conectado ainda — copie e envie essa resposta no marketplace."
        : `Descartado: pergunta sobre "${ticket.produto}".`,
    );
  };

  /** Os quatro campos vêm juntos — só aqui sai custo de token de verdade.
   * Vai junto o contexto: canal e limite do título, ficha do produto, o
   * motivo (SAC/Ads) e as palavras proibidas do seller. */
  const gerarConteudoCriativo = async (s: SugestaoCriativo) => {
    setGerandoCriativoId(s.id);
    const { conteudo, erro } = await criativoService.gerarConteudo({
      produto: s.produto,
      marketplace: getMarketplace(s.marketplaceId).nome,
      limiteTitulo: limiteTitulo(configCriativo, s.marketplaceId),
      ficha: fichas.get(s.sku) ?? null,
      motivo: s.origem === "exemplo" ? "" : s.motivo,
      palavrasProibidas: listaPalavrasSeller(configCriativo),
    });
    setGerandoCriativoId(null);
    if (erro) {
      toast.error(`Não consegui gerar o conteúdo: ${erro}`);
      return;
    }
    if (!conteudo) return;
    const erroSalvar = await criativoService.salvarConteudo(s.id, conteudo);
    if (erroSalvar) {
      toast.error(`Gerei o conteúdo, mas não consegui salvar: ${erroSalvar}`);
      return;
    }
    setSugestoesCriativo((atual) =>
      atual.map((item) =>
        item.id === s.id
          ? {
              ...item,
              tituloSugerido: conteudo.titulo,
              titulosAlternativos: conteudo.titulos,
              descricaoSugerida: conteudo.descricao,
              palavrasChave: conteudo.palavrasChave,
              bulletPoints: conteudo.bulletPoints,
            }
          : item,
      ),
    );
    setRascunhosCriativo((atual) => ({
      ...atual,
      [s.id]: {
        titulo: conteudo.titulo,
        descricao: conteudo.descricao,
        palavrasChave: conteudo.palavrasChave,
        bulletPoints: conteudo.bulletPoints,
      },
    }));
  };

  /** Ads achou um anúncio com muito clique e pouca compra: manda pro
   * Criativo com o motivo junto. Se já tem um pendente pra esse anúncio,
   * só abre o Criativo — não duplica. */
  const enviarAdsParaCriativo = async (acao: AcaoAds) => {
    if (!sessao) return;
    const jaExiste = sugestoesCriativo.some(
      (x) => x.status === "pendente" && x.anuncioId === acao.anuncioId,
    );
    if (!jaExiste) {
      const erro = await criativoService.criarSugestao(sessao.user.id, {
        contaId: acao.contaId,
        anuncioId: acao.anuncioId,
        produto: acao.produto,
        sku: acao.sku,
        marketplaceId: acao.marketplaceId,
        origem: "ads",
        motivo: `O Agente de Ads viu muito clique e pouca compra: ${acao.motivo} Reescreva o título e a descrição pra convencer quem já clicou.`,
      });
      if (erro) {
        toast.error(`Não consegui mandar pro Criativo: ${erro}`);
        return;
      }
      toast.success("Enviado pro Agente Criativo, com o motivo junto.");
      await carregarSugestoesCriativo();
    }
    setAbaAgente("criativo");
  };

  /** Salva a ficha de um SKU — chamado pelo SAC e pelo Criativo. */
  const salvarFicha = async (sku: string, texto: string): Promise<boolean> => {
    if (!sessao) return false;
    const erro = await fichasService.salvar(sessao.user.id, sku, texto);
    if (erro) {
      toast.error(`Não consegui salvar a ficha: ${erro}`);
      return false;
    }
    setFichas((atual) => {
      const novo = new Map(atual);
      if (texto.trim()) novo.set(sku, texto.trim());
      else novo.delete(sku);
      return novo;
    });
    toast.success(texto.trim() ? "Ficha salva. O SAC e o Criativo já usam." : "Ficha apagada.");
    return true;
  };

  const salvarConfigCriativo = async (c: ConfiguracaoCriativo): Promise<boolean> => {
    if (!sessao) return false;
    const erro = await criativoConfigService.salvar(sessao.user.id, c);
    if (erro) {
      toast.error(`Não consegui salvar as regras: ${erro}`);
      return false;
    }
    setConfigCriativo(c);
    toast.success("Regras do Criativo salvas.");
    return true;
  };

  const decidirCriativo = async (
    s: SugestaoCriativo,
    status: Extract<StatusSugestao, "aprovada" | "recusada">,
  ) => {
    const rascunho = rascunhosCriativo[s.id];
    if (status === "aprovada" && rascunho) {
      const erroSalvar = await criativoService.salvarConteudo(s.id, rascunho);
      if (erroSalvar) {
        toast.error(`Não consegui salvar a edição: ${erroSalvar}`);
        return;
      }
    }
    setSugestoesCriativo((atual) =>
      atual.map((item) =>
        item.id === s.id
          ? {
              ...item,
              status,
              decididoEm: new Date().toISOString(),
              ...(status === "aprovada" && rascunho
                ? {
                    tituloSugerido: rascunho.titulo,
                    descricaoSugerida: rascunho.descricao,
                    palavrasChave: rascunho.palavrasChave,
                    bulletPoints: rascunho.bulletPoints,
                  }
                : {}),
            }
          : item,
      ),
    );
    const erro = await eventosAgenteService.decidir(s.id, status);
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      await carregarSugestoesCriativo();
      return;
    }
    toast.success(
      status === "aprovada"
        ? "Aprovado. Copie e cole no marketplace — publicar direto ainda depende da API de escrita."
        : `Descartado: sugestão para "${s.produto}".`,
    );
  };

  const atualizarStatusAuditor = async (
    o: OcorrenciaAuditor,
    status: StatusOcorrenciaAuditor,
  ) => {
    setOcorrenciasAuditor((atual) =>
      atual.map((item) =>
        item.id === o.id
          ? { ...item, status, atualizadoEm: new Date().toISOString() }
          : item,
      ),
    );
    const erro = await auditorService.atualizarStatus(o, status);
    if (erro) {
      toast.error(`Não consegui salvar: ${erro}`);
      await carregarAuditor();
      return;
    }
    if (status === "reembolsado") toast.success("Marcado como resolvido.");
    else if (status === "ignorado") toast("Ocorrência ignorada.");
  };

  const insightsPendentes = insights.filter((i) => i.status === "pendente").length;
  const ticketsPendentes = tickets.filter((t) => t.status === "pendente").length;
  const alertasEstoquePendentes = alertasEstoque.filter((a) => a.status === "pendente").length;
  const alertasFulfillmentPendentes = alertasFulfillment.filter(
    (a) => a.status === "pendente",
  ).length;
  // O filtro de contas também vale pro Ads: a análise e as ações têm conta.
  const analisesAdsNaSelecao = semRestricaoDeConta
    ? analisesAds
    : analisesAds.filter((x) => contasSelecionadas.has(x.anuncio.contaId));
  const acoesAdsNaSelecao = semRestricaoDeConta
    ? acoesAds
    : acoesAds.filter((a) => a.contaId === null || contasSelecionadas.has(a.contaId));
  const avaliacoesAdsPendentes =
    avaliacoesAds.filter((a) => a.status === "pendente" && a.tipo === "sugestao").length +
    acoesAdsNaSelecao.filter((a) => a.status === "pendente").length;
  const ocorrenciasAuditorNaSelecao = semRestricaoDeConta
    ? ocorrenciasAuditor
    : ocorrenciasAuditor.filter((o) => contasSelecionadas.has(o.contaId));
  const ocorrenciasAuditorAbertas = ocorrenciasAuditorNaSelecao.filter(
    (o) => o.status === "aberto" || o.status === "reclamacao-aberta",
  ).length;
  const sugestoesCriativoPendentes = sugestoesCriativo.filter(
    (s) => s.status === "pendente",
  ).length;

  /** Um produto por SKU, pra aba Fichas do Criativo */
  const produtosFicha = useMemo(() => {
    const vistos = new Map<string, AlvoFicha>();
    for (const a of anunciosService.listar()) {
      if (!vistos.has(a.sku)) vistos.set(a.sku, { sku: a.sku, produto: a.produto });
    }
    return [...vistos.values()];
  }, []);

  /** SKU → quantos assuntos os clientes perguntam repetido no SAC */
  const repetidasPorSku = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const g of perguntasRepetidas(tickets)) mapa.set(g.sku, (mapa.get(g.sku) ?? 0) + 1);
    return mapa;
  }, [tickets]);

  if (!recursos.agentes) {
    return (
      <div className="mx-auto max-w-[1100px]">
        <Painel titulo="Agentes" descricao="Recurso do plano com Agentes">
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-brand/15 text-brand">
              <Bot className="size-5" />
            </div>
            <p className="text-sm font-semibold">Isso ainda não está no seu plano</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Os agentes de IA fazem parte do plano com Agentes. Fale com o suporte pra
              fazer o upgrade e ligar essa tela pra sua conta.
            </p>
          </div>
        </Painel>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      {/* Um agente por vez, ocupando a tela toda — antes ficavam os três
          empilhados, e pra responder o SAC era preciso rolar a tela
          inteira passando pelos outros dois. */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            ["analista", "Analista", BarChart3, insightsPendentes] as const,
            ["precificacao", "Precificação", TrendingDown, pendentes.length] as const,
            ["sac", "SAC", MessageCircle, ticketsPendentes] as const,
            ["estoque", "Estoque", Boxes, alertasEstoquePendentes] as const,
            ["fulfillment", "Fulfillment", Warehouse, alertasFulfillmentPendentes] as const,
            ["ads", "Ads", Target, avaliacoesAdsPendentes] as const,
            ["auditor", "Auditor", ShieldCheck, ocorrenciasAuditorAbertas] as const,
            ["criativo", "Criativo", Wand2, sugestoesCriativoPendentes] as const,
          ] as const
        ).map(([id, nome, Icone, contagem]) => (
          <button
            key={id}
            onClick={() => setAbaAgente(id)}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors",
              abaAgente === id
                ? "border-brand bg-brand/10 text-foreground"
                : "border-transparent bg-muted/50 text-muted-foreground hover:text-foreground",
            )}
          >
            <Icone className="size-3.5" />
            {nome}
            {contagem > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  abaAgente === id ? "bg-brand text-white" : "bg-muted-foreground/20",
                )}
              >
                {contagem}
              </span>
            )}
          </button>
        ))}
      </div>

      {abaAgente === "analista" && (
        <PainelAnalista
          insights={insights}
          carregando={carregandoInsights}
          aoDispensar={dispensarInsight}
          perfilId={sessao?.user.id ?? null}
        />
      )}

      {abaAgente === "precificacao" && (
        <PainelPrecificacao
          pendentes={pendentes}
          decididos={decididos}
          aprovadas={aprovadas}
          carregando={carregando}
          aoDecidir={decidir}
          campanhas={analisesPreco.campanhas}
          precosPorCanal={analisesPreco.porCanal}
          resultados={resultadosPreco}
        />
      )}

      {abaAgente === "sac" && (
        <PainelSac
          tickets={tickets}
          carregando={carregandoTickets}
          gerandoId={gerandoId}
          rascunhos={rascunhos}
          aoMudarRascunho={(id, texto) => setRascunhos((atual) => ({ ...atual, [id]: texto }))}
          aoGerar={gerarRespostaSac}
          aoDecidir={decidirTicket}
          config={configSac}
          regrasAtivas={regrasSac.filter((r) => r.ativa).length}
          fichas={fichas}
          modelos={modelosSac}
          buscarPedido={(id) => vendasService.buscarPorId(id)}
          aoAprender={aprenderComEdicaoSac}
          aoSalvarRegra={(regra) => salvarRegraSac(regra, "aprendida")}
          aoSalvarModelo={salvarModeloSac}
          aoEnviarParaCriativo={enviarRepetidaParaCriativo}
          aoAbrirFicha={setAlvoFicha}
        />
      )}

      {abaAgente === "estoque" && (
        <PainelEstoque
          alertas={alertasEstoque}
          carregando={carregandoEstoque}
          aoDispensar={dispensarAlertaEstoque}
        />
      )}

      {abaAgente === "fulfillment" && (
        <PainelFulfillment
          alertas={alertasFulfillment}
          carregando={carregandoFulfillment}
          aoDispensar={dispensarAlertaFulfillment}
        />
      )}

      {abaAgente === "ads" && (
        <PainelAds
          analises={analisesAdsNaSelecao}
          acoes={acoesAdsNaSelecao}
          candidatos={avaliacoesAds}
          carregando={carregandoAds}
          opcoesCusto={{ aliquotaImposto: fiscal.aliquota, custosOperacionais: custoOperacionalTotal }}
          aoDecidirAcao={decidirAcaoAds}
          aoDispensarCandidato={dispensarAvaliacaoAds}
          aoAbrirCriativo={enviarAdsParaCriativo}
        />
      )}

      {abaAgente === "auditor" && (
        <PainelAuditor
          ocorrencias={ocorrenciasAuditorNaSelecao}
          carregando={carregandoAuditor}
          aoAtualizarStatus={atualizarStatusAuditor}
        />
      )}

      {abaAgente === "criativo" && (
        <PainelCriativo
          sugestoes={sugestoesCriativo}
          carregando={carregandoCriativo}
          gerandoId={gerandoCriativoId}
          rascunhos={rascunhosCriativo}
          aoMudarRascunho={(id, campo, texto) =>
            setRascunhosCriativo((atual) => ({
              ...atual,
              [id]: {
                titulo: atual[id]?.titulo ?? "",
                descricao: atual[id]?.descricao ?? "",
                palavrasChave: atual[id]?.palavrasChave ?? "",
                bulletPoints: atual[id]?.bulletPoints ?? "",
                [campo]: texto,
              },
            }))
          }
          aoGerar={gerarConteudoCriativo}
          aoDecidir={decidirCriativo}
          fichas={fichas}
          produtos={produtosFicha}
          aoAbrirFicha={setAlvoFicha}
          config={configCriativo}
          aoSalvarConfig={salvarConfigCriativo}
          buscarAnuncio={(id) => (id ? anunciosService.buscarPorId(id) : null)}
          repetidasPorSku={repetidasPorSku}
        />
      )}

      <ModalFicha
        alvo={alvoFicha}
        textoAtual={alvoFicha ? (fichas.get(alvoFicha.sku) ?? "") : ""}
        aoFechar={() => setAlvoFicha(null)}
        aoSalvar={salvarFicha}
      />
    </div>
  );
}
