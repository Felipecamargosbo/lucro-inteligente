import { useCallback, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  BarChart3,
  Bot,
  Boxes,
  MessageCircle,
  Target,
  TrendingDown,
  Wand2,
  Warehouse,
} from "lucide-react";
import {
  anunciosService,
  adsService,
  contasService,
  criativoService,
  estoqueService,
  eventosAgenteService,
  fulfillmentService,
  produtosService,
  sacService,
  vendasService,
} from "@/services";
import { useAuth } from "@/context/auth";
import { useConfiguracoes } from "@/context/configuracoes";
import { useSelecaoContas } from "@/context/selecao-contas";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import {
  analisarRoasAnuncios,
  DEGRAU_DESCONTO_PADRAO,
  DIAS_PARADO_PADRAO,
  diagnosticarCurvaAbc,
  diagnosticarDadoFaltando,
  diagnosticarQuedaMargem,
  diagnosticarRuptura,
  diagnosticarSaudeContas,
  FAIXAS_MARGEM_PADRAO,
  montarResumoDiario,
  sugerirAnunciosParaAds,
  sugerirPrecoPorGiro,
  type AnaliseRoasAnuncio,
} from "@/lib/finance";
import { Painel } from "@/components/comum/Indicadores";
import { cn } from "@/lib/utils";
import type {
  AcaoAds,
  AlertaEstoque,
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
import { PainelCriativo } from "@/components/agentes/Criativo";

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


function Agentes() {
  const { metasPorConta, fiscal, custoOperacionalTotal } = useConfiguracoes();
  const { selecionadas: contasSelecionadas, todasSelecionadas: semRestricaoDeConta } =
    useSelecaoContas();
  const { sessao, recursos } = useAuth();
  const [abaAgente, setAbaAgente] = useState<
    "analista" | "precificacao" | "sac" | "estoque" | "fulfillment" | "ads" | "criativo"
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
  const [carregandoTickets, setCarregandoTickets] = useState(true);
  /** Ticket com resposta em andamento de gerar (mostra o spinner só nele) */
  const [gerandoId, setGerandoId] = useState<string | null>(null);
  /** Rascunho editável de cada ticket, por id — separado do que já está
   * salvo, pra o seller poder ajustar antes de aprovar. */
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [sugestoesCriativo, setSugestoesCriativo] = useState<SugestaoCriativo[]>([]);
  const [carregandoCriativo, setCarregandoCriativo] = useState(true);
  const [gerandoCriativoId, setGerandoCriativoId] = useState<string | null>(null);
  const [rascunhosCriativo, setRascunhosCriativo] = useState<
    Record<string, { titulo: string; descricao: string; palavrasChave: string; bulletPoints: string }>
  >({});
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

    const candidatos: Omit<EventoAgente, "id" | "status" | "decididoEm" | "data">[] = [];
    for (const a of anunciosService.listar()) {
      if (a.status !== "ativo") continue;

      const metas = metasPorConta[a.contaId] ?? null;
      const margemMinima = metas?.margemMinima ?? FAIXAS_MARGEM_PADRAO.margemMinima;

      const s = sugerirPrecoPorGiro(
        a,
        margemMinima,
        { aliquotaImposto: fiscal.aliquota, custosOperacionais: custoOperacionalTotal },
        { diasParado: DIAS_PARADO_PADRAO, degrau: DEGRAU_DESCONTO_PADRAO },
      );
      if (!s) continue;

      candidatos.push({
        agenteId: "precificacao",
        anuncioId: a.id,
        sku: a.sku,
        produto: a.produto,
        marketplaceId: a.marketplaceId,
        contaId: a.contaId,
        motivo: s.travadoNoPiso
          ? `Parado há ${s.diasParado} dias. O corte de ${formatPercentual(DEGRAU_DESCONTO_PADRAO, 0)} passaria do piso, então parei no preço mínimo.`
          : `Parado há ${s.diasParado} dias. Sugiro cortar ${formatPercentual(DEGRAU_DESCONTO_PADRAO, 0)} e ver se volta a girar.`,
        diasParado: s.diasParado,
        precoAtual: a.precoAtual,
        precoSugerido: s.precoSugerido,
        margemAtual: s.margemAtual,
        margemSugerida: s.margemSugerida,
        precoMinimo: s.precoMinimo,
        semaforo: s.semaforo,
        travadoNoPiso: s.travadoNoPiso,
      });
    }

    const jaPendentes = await eventosAgenteService.skusPendentes(perfilId, "precificacao");
    for (const c of candidatos) {
      if (jaPendentes.has(c.sku)) continue;
      const erro = await eventosAgenteService.criar(perfilId, c);
      if (erro) console.error("Não consegui gravar a sugestão:", erro);
    }

    const lista = await eventosAgenteService.listar(perfilId);
    setEventos(lista);
    setCarregando(false);
  }, [sessao, recursos.agentes, metasPorConta, fiscal, custoOperacionalTotal]);

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

    const existentes = await sacService.listar(perfilId);
    if (existentes.length === 0) {
      const anunciosAtivos = anunciosService.listar().filter((a) => a.status === "ativo");
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

    const lista = await sacService.listar(perfilId);
    setTickets(lista);
    setCarregandoTickets(false);
  }, [sessao, recursos.agentes]);

  /** Semeia algumas sugestões de exemplo, uma vez só, a partir de
   * anúncios ativos reais — igual o SAC faz com as perguntas fictícias. */
  const carregarSugestoesCriativo = useCallback(async () => {
    if (!sessao || !recursos.agentes) return;
    const perfilId = sessao.user.id;

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
   * Projeta ruptura a partir da venda real dos últimos 7 dias de cada SKU
   * — não do número médio que já vem no cadastro de estoque.
   */
  const carregarAlertasEstoque = useCallback(async () => {
    if (!sessao || !recursos.agentes) return;
    const perfilId = sessao.user.id;

    const itens = estoqueService.listarDetalhado();
    const pedidos = vendasService.listar();
    const diagnosticos = diagnosticarRuptura(itens, pedidos);

    const jaPendentes = await estoqueService.skusPendentes(perfilId);
    for (const d of diagnosticos) {
      if (jaPendentes.has(d.sku)) continue;
      const erro = await estoqueService.criarAlerta(perfilId, {
        contaId: null,
        sku: d.sku,
        produto: d.produto,
        marketplaceId: d.marketplaceId,
        estoqueAtual: d.estoqueAtual,
        vendidoUltimos7Dias: d.vendidoUltimos7Dias,
        mediaDiaria: d.mediaDiaria,
        diasRestantes: d.diasRestantes,
        quantidadeSugerida: d.quantidadeSugerida,
        diasAlvoCobertura: d.diasAlvoCobertura,
      });
      if (erro) console.error("Não consegui gravar o alerta de estoque:", erro);
    }

    const lista = await estoqueService.listarAlertas(perfilId);
    setAlertasEstoque(lista);
    setCarregandoEstoque(false);
  }, [sessao, recursos.agentes]);

  /** Mesma lógica do Estoque, só que olhando o estoque alocado nos
   * centros de distribuição do marketplace (Full), não o próprio. */
  const carregarAlertasFulfillment = useCallback(async () => {
    if (!sessao || !recursos.agentes) return;
    const perfilId = sessao.user.id;

    const itens = fulfillmentService.listarDetalhado();
    const pedidos = vendasService.listar();
    const diagnosticos = diagnosticarRuptura(itens, pedidos);

    const jaPendentes = await fulfillmentService.skusPendentes(perfilId);
    for (const d of diagnosticos) {
      if (jaPendentes.has(d.sku)) continue;
      const erro = await fulfillmentService.criarAlerta(perfilId, {
        contaId: null,
        sku: d.sku,
        produto: d.produto,
        marketplaceId: d.marketplaceId,
        estoqueAtual: d.estoqueAtual,
        vendidoUltimos7Dias: d.vendidoUltimos7Dias,
        mediaDiaria: d.mediaDiaria,
        diasRestantes: d.diasRestantes,
        quantidadeSugerida: d.quantidadeSugerida,
        diasAlvoCobertura: d.diasAlvoCobertura,
      });
      if (erro) console.error("Não consegui gravar o alerta de fulfillment:", erro);
    }

    const lista = await fulfillmentService.listarAlertas(perfilId);
    setAlertasFulfillment(lista);
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

  useEffect(() => {
    carregarEventos();
    carregarInsights();
    carregarTickets();
    carregarAlertasEstoque();
    carregarAlertasFulfillment();
    carregarAvaliacoesAds();
    carregarSugestoesCriativo();
  }, [
    carregarEventos,
    carregarInsights,
    carregarTickets,
    carregarAlertasEstoque,
    carregarAlertasFulfillment,
    carregarAvaliacoesAds,
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
    const { resposta, erro } = await sacService.gerarResposta(ticket.pergunta, ticket.produto);
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

  const decidirTicket = async (
    ticket: TicketSac,
    status: Extract<StatusSugestao, "aprovada" | "recusada">,
  ) => {
    const rascunho = rascunhos[ticket.id];
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

  /** Os quatro campos vêm juntos — só aqui sai custo de token de verdade. */
  const gerarConteudoCriativo = async (s: SugestaoCriativo) => {
    setGerandoCriativoId(s.id);
    const { conteudo, erro } = await criativoService.gerarConteudo(s.produto);
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
              descricaoSugerida: conteudo.descricao,
              palavrasChave: conteudo.palavrasChave,
              bulletPoints: conteudo.bulletPoints,
            }
          : item,
      ),
    );
    setRascunhosCriativo((atual) => ({ ...atual, [s.id]: conteudo }));
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
  const sugestoesCriativoPendentes = sugestoesCriativo.filter(
    (s) => s.status === "pendente",
  ).length;

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
          aoAbrirCriativo={() => setAbaAgente("criativo")}
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
        />
      )}
    </div>
  );
}
