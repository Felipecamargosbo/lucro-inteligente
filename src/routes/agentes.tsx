import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Boxes,
  Check,
  Clock,
  Loader2,
  MessageCircle,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  X,
} from "lucide-react";
import {
  anunciosService,
  adsService,
  contasService,
  estoqueService,
  eventosAgenteService,
  produtosService,
  sacService,
  vendasService,
} from "@/services";
import { useAuth } from "@/context/auth";
import { useConfiguracoes } from "@/context/configuracoes";
import { useSelecaoContas } from "@/context/selecao-contas";
import { formatBRL, formatNumero, formatPercentual } from "@/lib/format";
import {
  analisarAnunciosEmAds,
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
} from "@/lib/finance";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  AlertaEstoque,
  EventoAds,
  EventoAgente,
  InsightAnalista,
  SemaforoDecisao,
  StatusSugestao,
  TicketSac,
  TipoInsightAnalista,
} from "@/types";

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

const NOME_AGENTE = "Agente de Precificação";
const NOME_ANALISTA = "Agente Analista";
const NOME_SAC = "Agente de SAC";

/** Perguntas comuns de cliente de marketplace, só pra semear os
 * primeiros tickets de exemplo — fictícias até a API de mensagens
 * conectar. */
const PERGUNTAS_FICTICIAS = [
  "Esse produto tem garantia? Por quanto tempo?",
  "Qual o prazo de entrega pro meu CEP?",
  "Vocês têm em outra cor ou modelo?",
  "Posso trocar se não servir ou não gostar?",
];

type Aba = "operacao" | "historico";

function Agentes() {
  const { metasPorConta, fiscal, custoOperacionalTotal } = useConfiguracoes();
  const { selecionadas: contasSelecionadas, todasSelecionadas: semRestricaoDeConta } =
    useSelecaoContas();
  const { sessao, recursos } = useAuth();
  const [aba, setAba] = useState<Aba>("operacao");
  const [abaAgente, setAbaAgente] = useState<
    "analista" | "precificacao" | "sac" | "estoque" | "ads"
  >("analista");
  const [eventos, setEventos] = useState<EventoAgente[]>([]);
  const [insights, setInsights] = useState<InsightAnalista[]>([]);
  const [tickets, setTickets] = useState<TicketSac[]>([]);
  const [alertasEstoque, setAlertasEstoque] = useState<AlertaEstoque[]>([]);
  const [carregandoEstoque, setCarregandoEstoque] = useState(true);
  const [avaliacoesAds, setAvaliacoesAds] = useState<EventoAds[]>([]);
  const [carregandoAds, setCarregandoAds] = useState(true);
  const [carregandoTickets, setCarregandoTickets] = useState(true);
  /** Ticket com resposta em andamento de gerar (mostra o spinner só nele) */
  const [gerandoId, setGerandoId] = useState<string | null>(null);
  /** Rascunho editável de cada ticket, por id — separado do que já está
   * salvo, pra o seller poder ajustar antes de aprovar. */
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
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

  /**
   * Avalia cada anúncio que tem Ads ativo: a margem real, com o Ads já
   * descontado, comparada com a margem mínima do canal. Nunca julga só
   * pelo ROAS.
   */
  const carregarAvaliacoesAds = useCallback(async () => {
    if (!sessao || !recursos.agentes) return;
    const perfilId = sessao.user.id;

    const pedidos = vendasService.listar();
    // Últimos 30 dias — a mesma janela que faz sentido pra avaliar Ads:
    // curta o bastante pra refletir o investimento recente, longa o
    // bastante pra não julgar um produto por 2 ou 3 dias de sorte.
    const fim = new Date();
    const inicio = new Date(fim.getTime() - 29 * 86400000);
    const periodo = { inicio, fim, rotulo: "Últimos 30 dias" };

    const [jaSugeridos, jaAnalisados] = await Promise.all([
      adsService.skusPendentes(perfilId, "sugestao"),
      adsService.skusPendentes(perfilId, "analise"),
    ]);

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
        margem: s.margem,
        valeAPena: null,
      });
      if (erro) console.error("Não consegui gravar a sugestão de Ads:", erro);
    }

    for (const item of analisarAnunciosEmAds(pedidos, periodo)) {
      if (jaAnalisados.has(item.sku)) continue;
      const erro = await adsService.criarEvento(perfilId, {
        tipo: "analise",
        contaId: null,
        sku: item.sku,
        produto: item.produto,
        quantidade: item.quantidade,
        unidadesPorDia: item.unidadesPorDia,
        faturamento: item.faturamento,
        investimento: item.custoMidia,
        lucroLiquido: item.lucroPosAds,
        margem: item.margem,
        valeAPena: !item.semRetorno,
      });
      if (erro) console.error("Não consegui gravar a análise de Ads:", erro);
    }

    const lista = await adsService.listar(perfilId);
    setAvaliacoesAds(lista);
    setCarregandoAds(false);
  }, [sessao, recursos.agentes]);

  useEffect(() => {
    carregarEventos();
    carregarInsights();
    carregarTickets();
    carregarAlertasEstoque();
    carregarAvaliacoesAds();
  }, [
    carregarEventos,
    carregarInsights,
    carregarTickets,
    carregarAlertasEstoque,
    carregarAvaliacoesAds,
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

  const lista = aba === "operacao" ? pendentes : decididos;
  const insightsPendentes = insights.filter((i) => i.status === "pendente").length;
  const ticketsPendentes = tickets.filter((t) => t.status === "pendente").length;
  const alertasEstoquePendentes = alertasEstoque.filter((a) => a.status === "pendente").length;
  const avaliacoesAdsPendentes = avaliacoesAds.filter((a) => a.status === "pendente").length;

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
            ["ads", "Ads", Target, avaliacoesAdsPendentes] as const,
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
        />
      )}

      {abaAgente === "precificacao" && (
        <Painel
          titulo="Agentes"
          descricao="Cada decisão vem com o motivo, o antes e o depois. Nada é aplicado sem você aprovar"
        >
        {/* Indicadores */}
        <div className="grid gap-3 border-b p-4 sm:grid-cols-3">
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Esperando sua aprovação
            </p>
            <p
              className={cn(
                "num text-lg font-bold",
                pendentes.length > 0 && "text-warning",
              )}
            >
              {formatNumero(pendentes.length)}
            </p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Aprovadas nesta sessão
            </p>
            <p className="num text-lg font-bold text-profit">{formatNumero(aprovadas)}</p>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Regra ativa
            </p>
            <p className="text-xs font-semibold leading-tight">
              Parado há {DIAS_PARADO_PADRAO}+ dias → corta{" "}
              {formatPercentual(DEGRAU_DESCONTO_PADRAO, 0)}
            </p>
          </div>
        </div>

        {/* Quem está trabalhando */}
        <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
            <Bot className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold">{NOME_AGENTE}</p>
            <p className="text-[10px] text-muted-foreground">
              Procura produto encalhado e propõe corte sem furar a sua margem mínima
            </p>
          </div>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
            <span className="size-1.5 rounded-full bg-profit" />
            Ativo
          </span>
        </div>

        {/* Abas */}
        <div className="flex gap-1 border-b px-4 pt-3">
          {(
            [
              ["operacao", `Operação (${pendentes.length})`],
              ["historico", `Histórico (${decididos.length})`],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={cn(
                "rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
                aba === id
                  ? "border-b-2 border-brand text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {/* Feed */}
        <div className="divide-y">
          {carregando && (
            <div className="flex items-center justify-center gap-2 px-4 py-14 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Verificando seus produtos...
            </div>
          )}

          {!carregando && lista.map((e) => (
            <CardDecisao key={e.id} evento={e} aoDecidir={decidir} />
          ))}

          {!carregando && lista.length === 0 && (
            <div className="px-4 py-14 text-center">
              <p className="text-xs text-muted-foreground">
                {aba === "operacao"
                  ? "Nada parado além do limite. O agente não tem o que propor agora."
                  : "Nenhuma decisão registrada ainda."}
              </p>
            </div>
          )}
        </div>

        <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
          Sem API conectada, o agente sugere mas não executa: depois de aprovar, o preço
          precisa ser alterado no marketplace. A margem mínima de cada canal vem das metas
          em Configurações.
        </div>
      </Painel>
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

      {abaAgente === "ads" && (
        <PainelAds
          avaliacoes={avaliacoesAds}
          carregando={carregandoAds}
          aoDispensar={dispensarAvaliacaoAds}
        />
      )}
    </div>
  );
}

/**
 * O painel de SAC: uma pergunta de cliente por card. Diferente dos
 * outros dois agentes, tem um passo intermediário — "Gerar resposta" —
 * porque é o único ponto do sistema que gasta token de verdade, então
 * fica sempre atrás de um clique explícito, nunca automático.
 */
function PainelSac({
  tickets,
  carregando,
  gerandoId,
  rascunhos,
  aoMudarRascunho,
  aoGerar,
  aoDecidir,
}: {
  tickets: TicketSac[];
  carregando: boolean;
  gerandoId: string | null;
  rascunhos: Record<string, string>;
  aoMudarRascunho: (id: string, texto: string) => void;
  aoGerar: (t: TicketSac) => void;
  aoDecidir: (t: TicketSac, status: Extract<StatusSugestao, "aprovada" | "recusada">) => void;
}) {
  const [aba, setAba] = useState<Aba>("operacao");
  const pendentes = tickets.filter((t) => t.status === "pendente");
  const decididos = tickets.filter((t) => t.status !== "pendente");
  const lista = aba === "operacao" ? pendentes : decididos;

  return (
    <Painel
      titulo="SAC"
      descricao="Perguntas de cliente esperando resposta — a IA sugere, você decide"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <MessageCircle className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{NOME_SAC}</p>
          <p className="text-[10px] text-muted-foreground">
            Sugere a resposta; enviar ainda é manual até a API de mensagens conectar
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b px-4 pt-3">
        {(
          [
            ["operacao", `Operação (${pendentes.length})`],
            ["historico", `Histórico (${decididos.length})`],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
              aba === id
                ? "border-b-2 border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="divide-y">
        {carregando && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Carregando perguntas...
          </div>
        )}

        {!carregando &&
          lista.map((t) => (
            <CardTicketSac
              key={t.id}
              ticket={t}
              gerando={gerandoId === t.id}
              rascunho={rascunhos[t.id] ?? t.resposta ?? ""}
              aoMudarRascunho={(texto) => aoMudarRascunho(t.id, texto)}
              aoGerar={() => aoGerar(t)}
              aoDecidir={(status) => aoDecidir(t, status)}
            />
          ))}

        {!carregando && lista.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-muted-foreground">
              {aba === "operacao"
                ? "Nenhuma pergunta pendente agora."
                : "Nenhuma decisão registrada ainda."}
            </p>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        A pergunta do cliente ainda é de exemplo — não há API de mensagens conectada. A
        resposta, essa é gerada de verdade por IA quando você pede.
      </div>
    </Painel>
  );
}

function CardTicketSac({
  ticket,
  gerando,
  rascunho,
  aoMudarRascunho,
  aoGerar,
  aoDecidir,
}: {
  ticket: TicketSac;
  gerando: boolean;
  rascunho: string;
  aoMudarRascunho: (texto: string) => void;
  aoGerar: () => void;
  aoDecidir: (status: Extract<StatusSugestao, "aprovada" | "recusada">) => void;
}) {
  const temResposta = ticket.resposta !== null;
  const decidido = ticket.status !== "pendente";

  return (
    <div className="px-4 py-4">
      <div className="flex gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <MessageCircle className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeloMarketplace id={ticket.marketplaceId} />
            <span className="truncate text-xs font-medium">{ticket.produto}</span>
            <span className="num text-[10px] text-muted-foreground">{ticket.sku}</span>
            {decidido && (
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-semibold",
                  ticket.status === "aprovada"
                    ? "bg-profit-soft text-profit"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {ticket.status === "aprovada" ? "aprovada" : "descartada"}
              </span>
            )}
            {decidido && ticket.decididoEm && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="size-3" />
                {new Date(ticket.decididoEm).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            )}
          </div>

          <div className="mt-2 rounded-lg bg-muted/50 px-3 py-2">
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
              Pergunta do cliente
            </p>
            <p className="mt-0.5 text-xs">{ticket.pergunta}</p>
          </div>

          {decidido ? (
            // Histórico: só leitura — o que foi decidido já foi decidido.
            ticket.resposta && (
              <div className="mt-2 rounded-lg bg-muted/30 px-3 py-2">
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  {ticket.status === "aprovada" ? "Resposta enviada" : "Resposta descartada"}
                </p>
                <p className="mt-0.5 text-xs">{ticket.resposta}</p>
              </div>
            )
          ) : !temResposta ? (
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={aoGerar} disabled={gerando}>
                {gerando ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {gerando ? "Gerando..." : "Gerar resposta com IA"}
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Resposta sugerida — pode editar antes de aprovar
              </p>
              <Textarea
                value={rascunho}
                onChange={(e) => aoMudarRascunho(e.target.value)}
                className="min-h-20 text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => aoDecidir("aprovada")}>
                  <Check className="size-3.5" />
                  Aprovar
                </Button>
                <Button size="sm" variant="outline" onClick={() => aoDecidir("recusada")}>
                  <X className="size-3.5" />
                  Descartar
                </Button>
                <Button size="sm" variant="ghost" onClick={aoGerar} disabled={gerando}>
                  {gerando ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="size-3.5" />
                  )}
                  Gerar de novo
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * O painel de Estoque: só leitura, só alerta — nenhum campo pra editar
 * quantidade. O número de verdade mora no ERP do seller ou no
 * marketplace; aqui é só o aviso de que algo merece atenção antes que
 * vire ruptura.
 */
function PainelEstoque({
  alertas,
  carregando,
  aoDispensar,
}: {
  alertas: AlertaEstoque[];
  carregando: boolean;
  aoDispensar: (a: AlertaEstoque) => void;
}) {
  const [aba, setAba] = useState<Aba>("operacao");
  const pendentes = alertas.filter((a) => a.status === "pendente");
  const decididos = alertas.filter((a) => a.status !== "pendente");
  const lista = aba === "operacao" ? pendentes : decididos;

  return (
    <Painel
      titulo="Estoque"
      descricao="Projeção de ruptura a partir da venda real dos últimos 7 dias"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Boxes className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Agente de Estoque</p>
          <p className="text-[10px] text-muted-foreground">
            Avisa antes de faltar — não edita nem envia quantidade pra lugar nenhum
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b px-4 pt-3">
        {(
          [
            ["operacao", `Operação (${pendentes.length})`],
            ["historico", `Histórico (${decididos.length})`],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
              aba === id
                ? "border-b-2 border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="divide-y">
        {carregando && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Verificando ritmo de venda...
          </div>
        )}

        {!carregando &&
          lista.map((a) => (
            <CardAlertaEstoque key={a.id} alerta={a} aoDispensar={() => aoDispensar(a)} />
          ))}

        {!carregando && lista.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-muted-foreground">
              {aba === "operacao"
                ? "Nenhum produto perto de esgotar no ritmo atual de venda."
                : "Nenhum alerta visto ainda."}
            </p>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        A quantidade em estoque ainda é de exemplo — quando o ERP ou o marketplace
        conectar, esse número passa a ser real, sem mudar nada nesta tela.
      </div>
    </Painel>
  );
}

function CardAlertaEstoque({
  alerta,
  aoDispensar,
}: {
  alerta: AlertaEstoque;
  aoDispensar: () => void;
}) {
  const urgente = alerta.diasRestantes <= 3;

  return (
    <div className="px-4 py-4">
      <div className="flex gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            urgente ? "bg-loss-soft text-loss" : "bg-warning-soft text-warning",
          )}
        >
          <Boxes className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeloMarketplace id={alerta.marketplaceId} />
            <span className="truncate text-xs font-medium">{alerta.produto}</span>
            <span className="num text-[10px] text-muted-foreground">{alerta.sku}</span>
            {alerta.status !== "pendente" && (
              <>
                <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  visto
                </span>
                {alerta.decididoEm && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock className="size-3" />
                    {new Date(alerta.decididoEm).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </>
            )}
          </div>

          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Vendeu <strong className="text-foreground">{formatNumero(alerta.vendidoUltimos7Dias)} un.</strong> nos
            últimos 7 dias (média de {alerta.mediaDiaria.toFixed(1)}/dia). No ritmo atual, o
            estoque acaba em{" "}
            <strong className={cn(urgente ? "text-loss" : "text-warning")}>
              {alerta.diasRestantes} dia{alerta.diasRestantes !== 1 ? "s" : ""}
            </strong>
            .
          </p>

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Estoque atual
              </p>
              <p className="num text-sm font-semibold">{formatNumero(alerta.estoqueAtual)}</p>
            </div>
            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Repor pra {alerta.diasAlvoCobertura} dias
              </p>
              <p className="num text-sm font-bold text-profit">
                +{formatNumero(alerta.quantidadeSugerida)}
              </p>
            </div>
          </div>

          {alerta.status === "pendente" && (
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={aoDispensar}>
                <Check className="size-3.5" />
                Marcar como visto
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * O painel de Ads: cada card mostra o veredito (vale ou não vale a pena)
 * em cima da margem de verdade, não só do ROAS — junto com as métricas
 * cruas (ROAS, ACOS, CTR, CPC) pra quem quiser conferir a conta.
 */
/**
 * O Agente de Ads, em duas janelas — cada uma responde uma pergunta
 * diferente:
 *
 * "Análise" — dos produtos que JÁ estão em Ads, quais valem a pena?
 * Uma tabela, tudo visível de uma vez: vendas por dia, quanto investiu,
 * quanto sobrou de lucro líquido no final, e um veredito colorido.
 *
 * "Sugestão" — quais produtos vendem bem SOZINHOS, sem nenhum Ads, e
 * são candidatos a começar a investir.
 *
 * De propósito, sem ROAS/ACOS/CTR/CPC aqui — essas métricas já têm
 * casa própria no Dashboard. Aqui é só o que decide "vale ou não vale".
 */
function PainelAds({
  eventos,
  carregando,
  aoDispensar,
}: {
  eventos: EventoAds[];
  carregando: boolean;
  aoDispensar: (e: EventoAds) => void;
}) {
  const [janela, setJanela] = useState<"analise" | "sugestao">("analise");

  const analisePendente = eventos.filter((e) => e.status === "pendente" && e.tipo === "analise");
  const sugestaoPendente = eventos.filter((e) => e.status === "pendente" && e.tipo === "sugestao");
  const lista = janela === "analise" ? analisePendente : sugestaoPendente;

  return (
    <Painel
      titulo="Ads"
      descricao="Se o investimento em anúncio patrocinado está valendo a pena, pelo que sobra de lucro"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Target className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Agente de Ads</p>
          <p className="text-[10px] text-muted-foreground">
            Olha o lucro líquido depois do Ads, não só o retorno do anúncio
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      <div className="flex gap-1 border-b px-4 pt-3">
        {(
          [
            ["analise", `Análise (${analisePendente.length})`],
            ["sugestao", `Sugestão de anúncio (${sugestaoPendente.length})`],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setJanela(id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
              janela === id
                ? "border-b-2 border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {carregando && (
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Avaliando os últimos 30 dias...
        </div>
      )}

      {!carregando && janela === "analise" && (
        <TabelaAnaliseAds itens={analisePendente} aoDispensar={aoDispensar} />
      )}

      {!carregando && janela === "sugestao" && (
        <TabelaSugestaoAds itens={sugestaoPendente} aoDispensar={aoDispensar} />
      )}

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        Investimento e vendas vêm do pedido real dos últimos 30 dias — o mesmo número que
        a tela de Ads do Dashboard já mostra.
      </div>
    </Painel>
  );
}

/** "Vale a pena" = sobrou lucro líquido positivo depois do Ads. Simples
 * assim de propósito: é a pergunta que o seller realmente faz. */
function TabelaAnaliseAds({
  itens,
  aoDispensar,
}: {
  itens: EventoAds[];
  aoDispensar: (e: EventoAds) => void;
}) {
  if (itens.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-xs text-muted-foreground">Nenhum produto em Ads pra avaliar agora.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left">
        <thead>
          <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-bold">Produto / SKU</th>
            <th className="px-4 py-3 text-right font-bold">Vendas/dia</th>
            <th className="px-4 py-3 text-right font-bold">Investimento</th>
            <th className="px-4 py-3 text-right font-bold">Lucro líquido</th>
            <th className="px-4 py-3 text-right font-bold">Margem</th>
            <th className="px-4 py-3 font-bold">Situação</th>
            <th className="px-4 py-3 text-right font-bold">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {itens.map((e) => (
            <tr key={e.id} className="transition-colors hover:bg-muted/40">
              <td className="max-w-[220px] px-4 py-3">
                <p className="truncate text-xs font-medium">{e.produto}</p>
                <p className="num text-[10px] text-muted-foreground">{e.sku}</p>
              </td>
              <td className="num px-4 py-3 text-right text-xs">
                {e.unidadesPorDia.toFixed(1)}
              </td>
              <td className="num px-4 py-3 text-right text-xs">{formatBRL(e.investimento)}</td>
              <td
                className={cn(
                  "num px-4 py-3 text-right text-xs font-bold",
                  e.valeAPena ? "text-profit" : "text-loss",
                )}
              >
                {formatBRL(e.lucroLiquido)}
              </td>
              <td className="num px-4 py-3 text-right text-xs">{formatPercentual(e.margem)}</td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold",
                    e.valeAPena ? "bg-profit-soft text-profit" : "bg-loss-soft text-loss",
                  )}
                >
                  <span
                    className={cn("size-1.5 rounded-full", e.valeAPena ? "bg-profit" : "bg-loss")}
                  />
                  {e.valeAPena ? "Vale a pena" : "Está no prejuízo"}
                </span>
              </td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="outline" onClick={() => aoDispensar(e)}>
                  <Check className="size-3.5" />
                  Visto
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Vendeu bem sozinho, sem gastar nada em Ads — candidato a testar. */
function TabelaSugestaoAds({
  itens,
  aoDispensar,
}: {
  itens: EventoAds[];
  aoDispensar: (e: EventoAds) => void;
}) {
  if (itens.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-xs text-muted-foreground">
          Nenhum produto vendendo bem sem Ads no momento.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-left">
        <thead>
          <tr className="border-b bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3 font-bold">Produto / SKU</th>
            <th className="px-4 py-3 text-right font-bold">Vendas/dia</th>
            <th className="px-4 py-3 text-right font-bold">Total vendido</th>
            <th className="px-4 py-3 text-right font-bold">Margem atual</th>
            <th className="px-4 py-3 text-right font-bold">Ação</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {itens.map((e) => (
            <tr key={e.id} className="transition-colors hover:bg-muted/40">
              <td className="max-w-[220px] px-4 py-3">
                <p className="truncate text-xs font-medium">{e.produto}</p>
                <p className="num text-[10px] text-muted-foreground">{e.sku}</p>
              </td>
              <td className="num px-4 py-3 text-right text-xs font-semibold text-brand">
                {e.unidadesPorDia.toFixed(1)}
              </td>
              <td className="num px-4 py-3 text-right text-xs">{formatNumero(e.quantidade)} un.</td>
              <td className="num px-4 py-3 text-right text-xs">{formatPercentual(e.margem)}</td>
              <td className="px-4 py-3 text-right">
                <Button size="sm" variant="outline" onClick={() => aoDispensar(e)}>
                  <Check className="size-3.5" />
                  Visto
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const ICONE_INSIGHT: Record<TipoInsightAnalista, typeof AlertTriangle> = {
  queda_margem: TrendingDown,
  curva_abc: BarChart3,
  dado_faltando: AlertTriangle,
  saude_conta: ShieldAlert,
  resumo_diario: Sparkles,
};

const TITULO_INSIGHT: Record<TipoInsightAnalista, string> = {
  queda_margem: "Margem em queda",
  curva_abc: "Curva ABC",
  dado_faltando: "Dado faltando",
  saude_conta: "Saúde da conta",
  resumo_diario: "Resumo do dia",
};

/**
 * O painel do Analista: cinco frentes, um card por aviso ativo. Diferente
 * do Precificação, aqui não tem aprovar/recusar — é "marcar como visto",
 * porque não é uma decisão de preço, é uma observação.
 */
function PainelAnalista({
  insights,
  carregando,
  aoDispensar,
}: {
  insights: InsightAnalista[];
  carregando: boolean;
  aoDispensar: (i: InsightAnalista) => void;
}) {
  const pendentes = insights.filter((i) => i.status === "pendente");

  return (
    <Painel
      titulo="Analista"
      descricao="Cinco frentes, sempre olhando: margem, curva ABC, dado faltando, saúde da conta e o resumo do dia"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Bot className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">{NOME_ANALISTA}</p>
          <p className="text-[10px] text-muted-foreground">
            Lê os números do negócio e avisa o que merece atenção
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      <div className="divide-y">
        {carregando && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Analisando seus números...
          </div>
        )}

        {!carregando &&
          pendentes.map((i) => (
            <CardInsight key={i.id} insight={i} aoDispensar={aoDispensar} />
          ))}

        {!carregando && pendentes.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-muted-foreground">
              Nada fora do esperado agora. Quando algo merecer atenção, aparece aqui.
            </p>
          </div>
        )}
      </div>
    </Painel>
  );
}

function CardInsight({
  insight,
  aoDispensar,
}: {
  insight: InsightAnalista;
  aoDispensar: (i: InsightAnalista) => void;
}) {
  const Icone = ICONE_INSIGHT[insight.tipo];
  const sem = ESTILO_SEMAFORO[insight.semaforo];
  const d = insight.dados;

  return (
    <div className="px-4 py-4">
      <div className="flex gap-3">
        <div
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            insight.semaforo === "vermelho"
              ? "bg-loss-soft text-loss"
              : insight.semaforo === "amarelo"
                ? "bg-warning-soft text-warning"
                : "bg-profit-soft text-profit",
          )}
        >
          <Icone className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">{TITULO_INSIGHT[insight.tipo]}</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="size-3" />
              {new Date(insight.data).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>

          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {insight.motivo}
          </p>

          {/* Resumo diário ganha três números em destaque — os outros
              tipos já contam tudo que precisam no `motivo`. */}
          {insight.tipo === "resumo_diario" && (
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  Faturamento hoje
                </p>
                <p className="num text-sm font-semibold">
                  {formatBRL(d.faturamento as number)}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  Margem
                </p>
                <p className={cn("num text-sm font-semibold", sem.texto)}>
                  {formatPercentual(d.margem as number)}
                </p>
              </div>
              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  Pedidos
                </p>
                <p className="num text-sm font-semibold">{formatNumero(d.pedidos as number)}</p>
              </div>
            </div>
          )}

          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => aoDispensar(insight)}>
              <Check className="size-3.5" />
              Marcar como visto
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const ESTILO_SEMAFORO: Record<SemaforoDecisao, { ponto: string; texto: string; rotulo: string }> =
  {
    verde: {
      ponto: "bg-profit",
      texto: "text-profit",
      rotulo: "Dentro da sua margem mínima",
    },
    amarelo: {
      ponto: "bg-warning",
      texto: "text-warning",
      rotulo: "Abaixo da margem mínima",
    },
    vermelho: { ponto: "bg-loss", texto: "text-loss", rotulo: "Venda com prejuízo" },
  };

function CardDecisao({
  evento,
  aoDecidir,
}: {
  evento: EventoAgente;
  aoDecidir: (e: EventoAgente, status: StatusSugestao) => void;
}) {
  const conta = contasService.buscar(evento.contaId);
  const sem = ESTILO_SEMAFORO[evento.semaforo];
  const queda = evento.precoAtual - evento.precoSugerido;
  const pendente = evento.status === "pendente";

  return (
    <div className={cn("px-4 py-4", !pendente && "opacity-70")}>
      <div className="flex gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Bot className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          {/* Assinatura */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold">{NOME_AGENTE}</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <Clock className="size-3" />
              {new Date(evento.data).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            {evento.status === "aprovada" && (
              <span className="rounded bg-profit-soft px-2 py-0.5 text-[10px] font-semibold text-profit">
                aprovada
              </span>
            )}
            {evento.status === "recusada" && (
              <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                recusada
              </span>
            )}
          </div>

          {/* Produto */}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <SeloMarketplace id={evento.marketplaceId} />
            <span className="truncate text-xs font-medium">{evento.produto}</span>
            <span className="num text-[10px] text-muted-foreground">
              {evento.sku} · {conta?.nome ?? "—"}
            </span>
          </div>

          {/* Motivo */}
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {evento.motivo}
          </p>

          {/* Antes → depois */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg bg-muted/50 px-3 py-2.5">
            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Preço hoje
              </p>
              <p className="num text-sm font-semibold">{formatBRL(evento.precoAtual)}</p>
              <p className="num text-[10px] text-muted-foreground">
                margem {formatPercentual(evento.margemAtual)}
              </p>
            </div>

            <TrendingDown className="size-4 shrink-0 text-muted-foreground" />

            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Sugerido
              </p>
              <p className={cn("num text-sm font-bold", sem.texto)}>
                {formatBRL(evento.precoSugerido)}
              </p>
              <p className="num text-[10px] text-muted-foreground">
                margem {formatPercentual(evento.margemSugerida)}
              </p>
            </div>

            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Queda
              </p>
              <p className="num text-sm font-semibold">−{formatBRL(queda)}</p>
            </div>

            <div>
              <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                Piso deste canal
              </p>
              <p className="num text-sm font-semibold">{formatBRL(evento.precoMinimo)}</p>
            </div>

            <span
              className={cn(
                "ml-auto inline-flex items-center gap-1.5 text-[10px] font-semibold",
                sem.texto,
              )}
            >
              <span className={cn("size-1.5 rounded-full", sem.ponto)} />
              {sem.rotulo}
            </span>
          </div>

          {evento.travadoNoPiso && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              Travado no piso: o corte cheio passaria da sua margem mínima.
            </p>
          )}

          {/* Ações */}
          {pendente && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => aoDecidir(evento, "aprovada")}>
                <Check className="size-3.5" />
                Aprovar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => aoDecidir(evento, "recusada")}
              >
                <X className="size-3.5" />
                Recusar
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
