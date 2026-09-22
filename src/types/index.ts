// Tipos centrais do domínio. Preparados para receber dados reais das APIs
// dos marketplaces no futuro (mesmo formato, origem diferente).

export type MarketplaceId =
  | "mercado-livre"
  | "shopee"
  | "amazon"
  | "magalu"
  | "tiktok-shop"
  | "shein";

export type StatusConexaoMarketplace =
  | "conectado"
  | "token-expirando"
  | "desconectado";

/** Nível/medalha da conta no canal, quando o marketplace expõe esse conceito. */
export type NivelReputacao =
  | "excelente"
  | "bom"
  | "regular"
  | "em-risco"
  | "sem-dados";

/**
 * Saúde operacional da conta no canal. Não fala de lucro: fala de a conta
 * continuar existindo (perder medalha derruba exposição e frete grátis).
 */
export interface ReputacaoConta {
  nivel: NivelReputacao;
  /** Rótulo que o próprio canal usa (ex.: "MercadoLíder Platinum") */
  rotuloCanal: string | null;
  taxaAtraso: number; // 0-1
  taxaCancelamento: number; // 0-1
  taxaReclamacao: number; // 0-1
  /** Limite do canal acima do qual a medalha é perdida (0-1) */
  limiteAtraso: number;
  limiteCancelamento: number;
  /** Preenchido quando algum indicador está perto ou acima do limite */
  alerta: string | null;
}

/**
 * Metas de margem do seller. As faixas verde/amarelo/vermelho são relativas
 * a estes números, não a percentuais fixos: 8% pode ser ótimo num canal e
 * péssimo em outro.
 */
export interface MetasMargem {
  /** Abaixo disso o anúncio está fora do aceitável (0-1) */
  margemMinima: number;
  /** Alvo desejado (0-1) */
  margemIdeal: number;
}

/**
 * O canal de venda em si (Mercado Livre, Shopee...). Guarda só a identidade:
 * tudo que varia — credencial, taxas, reputação, resultado — pertence à conta.
 */
export interface Marketplace {
  id: MarketplaceId;
  nome: string;
}

/**
 * Uma conta de vendedor dentro de um canal. Um mesmo seller pode ter várias
 * contas no mesmo marketplace (loja oficial, outlet, outro CNPJ), cada uma
 * com credencial, taxas negociadas e reputação próprias — por isso é aqui,
 * e não no Marketplace, que essas informações vivem.
 */
export interface ContaMarketplace {
  id: string;
  marketplaceId: MarketplaceId;
  /** Nome dado pelo seller: "Loja Oficial", "Outlet" */
  nome: string;
  cnpj: string;
  /** Empresa (CNPJ) dona desta conta — é por ela que o DRE é fechado */
  empresaId: string;
  conectada: boolean;
  statusConexao: StatusConexaoMarketplace;
  ultimaSincronizacao: string | null; // ISO
  skusAtivos: number;
  vendasHoje: number;
  /** Regras usadas nos cálculos enquanto não há API real */
  comissaoPercentual: number;
  taxaFixa: number;
  freteMedio: number;
  /** null enquanto o seller não definiu metas para a conta */
  metas: MetasMargem | null;
  reputacao: ReputacaoConta | null;
}

export type StatusPedido =
  | "entregue"
  | "em-transito"
  | "aguardando-envio"
  | "cancelado";

/** Uma fatia do valor de um pedido caindo na conta do seller — a maioria
 * dos pedidos tem só uma; vendas parceladas no modo Magalu Parcelado têm
 * uma por mês. */
export interface RepasseParcela {
  /** Quando esta fatia cai na conta do seller */
  data: string; // ISO
  valor: number;
}

export interface Pedido {
  id: string;
  data: string; // ISO
  marketplaceId: MarketplaceId;
  /** Conta que realizou a venda */
  contaId: string;
  sku: string;
  produto: string;
  quantidade: number;
  precoUnitario: number;
  faturamento: number;
  cmv: number;
  comissao: number;
  taxaFixa: number;
  impostos: number;
  descontos: number;
  outrosCustos: number;
  /** ADS/mídia paga atribuída a este pedido — não confundir com outrosCustos */
  custoMidia: number;
  lucroLiquido: number;
  margem: number; // 0-1
  status: StatusPedido;
  cliente: string;
  telefone: string;
  /** Full = estoque enviado ao centro de distribuição do marketplace; Flex =
   * o próprio seller entrega, geralmente no mesmo dia; Padrão = o seller
   * despacha via Correios/transportadora comum. */
  tipoLogistica: TipoLogistica;
  /** UF de entrega do pedido (endereço do cliente) */
  estado: string;
  /** Em quantas vezes o CLIENTE parcelou a compra no cartão — 1 é à vista.
   * Só muda alguma coisa pro seller quando o canal é o Magalu no modo
   * "Repasse Parcelado": lá o repasse segue esse mesmo parcelamento. Nos
   * outros canais é só informação — o marketplace paga o seller à parte
   * disso, então não afeta `repasses`. */
  parcelas: number;
  /**
   * Quando e quanto desta venda cai na conta do seller. Cada canal tem sua
   * própria regra (pesquisada, não é um número fixo igual pra todos):
   * Mercado Livre varia com reputação da conta e tipo de entrega; Amazon é
   * um ciclo fechado de 14 em 14 dias, não por pedido; Shopee é de 5 a 15
   * dias corridos por pedido; Magalu, no modo parcelado, divide o valor em
   * várias fatias mensais quando a venda foi parcelada — por isso isto é
   * uma lista, não uma data só. A maioria dos pedidos tem 1 item aqui.
   */
  repasses: RepasseParcela[];
  /**
   * Valor devolvido pelo cliente após a entrega (0 quando não houve
   * devolução). Diferente de "cancelado": a devolução acontece depois da
   * venda já ter sido contabilizada como concluída.
   */
  valorDevolvido: number;
  /** Data em que a devolução foi registrada; null quando não houve devolução */
  dataDevolucao: string | null;
  /** Motivo informado pelo cliente/canal; null quando não houve devolução */
  motivoDevolucao: string | null;
  /**
   * Campanha de promoção em que esta venda saiu; null quando foi venda a
   * preço cheio. Guardamos só o id — nome, tipo e período vivem na Campanha,
   * pra não duplicar informação que pode divergir depois.
   */
  campanhaId: string | null;
  /** Frete que deveria ter sido cobrado neste pedido, pela política do
   * canal e o tipo de logística usado. Base de comparação do Auditor. */
  freteEsperado: number;
  /** Frete que o marketplace realmente cobrou neste pedido. Na maioria
   * dos pedidos é igual a `freteEsperado`; quando diverge, é isso que o
   * Agente Auditor aponta como cobrança divergente. */
  freteCobrado: number;
}

/** Full = estoque no CD do marketplace; Flex = o seller entrega no mesmo dia;
 * Coleta = o marketplace busca com o seller (cross-docking). O valor interno
 * segue "padrao" por compatibilidade — o rótulo exibido vive em lib/logistica. */
export type TipoLogistica = "full" | "flex" | "padrao";

export type StatusCampanha = "ativa" | "encerrada";

export type TipoCampanha =
  | "oferta"
  | "oferta-inteligente"
  | "cupom"
  | "equiparacao-preco";

/**
 * Como o seller entrou na campanha. "nexo" = entrou por aqui, passando pela
 * análise de margem. "externa" = entrou direto no painel do marketplace, sem
 * análise prévia — nesses casos o canal quase nunca devolve o nome da
 * campanha, e é por isso que `nome` pode vir null.
 */
export type OrigemCampanha = "nexo" | "externa";

export interface Campanha {
  id: string;
  /** null quando o canal não expôs o nome (típico de entrada externa) */
  nome: string | null;
  marketplaceId: MarketplaceId;
  tipo: TipoCampanha;
  status: StatusCampanha;
  /** Início da vigência (ISO) */
  inicio: string;
  /** Fim da vigência (ISO). Campanha ativa tem fim no futuro. */
  fim: string;
  origem: OrigemCampanha;
  /** SKUs inscritos na campanha */
  skus: string[];
  /** Desconto ofertado sobre o preço cheio, de 0 a 1 */
  descontoPercentual: number;
}

export type StatusAnuncio = "ativo" | "pausado" | "sem-estoque";

/**
 * De onde veio o número da taxa. Um valor "estimado" é uma projeção sobre o
 * preço de hoje; "liquidado" é o que o marketplace efetivamente cobrou.
 * Misturar os dois sem avisar é a forma mais fácil de mentir sobre margem.
 */
export type OrigemValor = "estimado" | "liquidado";

/**
 * Faixa de saúde da margem, sempre relativa às MetasMargem do canal.
 * "sem-custo" e "sem-meta" não são níveis piores: são a ausência do dado
 * necessário para classificar, e precisam aparecer como tal.
 */
export type FaixaSaudeMargem =
  | "prejuizo"
  | "abaixo-da-minima"
  | "entre-minima-e-ideal"
  | "saudavel"
  | "sem-meta"
  | "sem-custo";

/**
 * Item do catálogo do seller — onde o CMV mora, uma vez só. Um Produto pode
 * estar vinculado a vários Anúncios (o mesmo item publicado em vários
 * marketplaces e contas); o custo nunca é digitado marketplace por
 * marketplace, só aqui. Mudar o CMV aqui reflete em todo anúncio vinculado.
 */
export interface Produto {
  id: string;
  /** Código interno do seller — o identificador principal do catálogo */
  sku: string;
  /** Código de barras — opcional, usado para tentar auto-vincular um
   * anúncio recém-puxado do marketplace sem intervenção manual */
  ean: string | null;
  nome: string;
  cmv: number;
}

/** Números brutos de Ads de um anúncio — o resto (ROAS, ACOS, CTR, CPC) é
 * sempre calculado na hora a partir destes quatro, nunca guardado pronto,
 * pra nunca ficar um número velho junto de um investimento novo. */
export interface DadosAds {
  investimento: number;
  impressoes: number;
  cliques: number;
  /** Vendas que o próprio marketplace atribui a este investimento em Ads */
  vendasAtribuidas: number;
}

export interface Anuncio {
  id: string;
  marketplaceId: MarketplaceId;
  /** Conta em que o anúncio está publicado */
  contaId: string;
  sku: string;
  /** Código de barras do anúncio no canal, quando o marketplace informa —
   * segundo critério de busca em "Receber anúncios" além do SKU. */
  ean: string | null;
  produto: string;
  precoAtual: number;
  /** Preço cheio quando o anúncio está em promoção; null se não está */
  precoCheio: number | null;
  emPromocao: boolean;
  /**
   * Custo da mercadoria. null = não cadastrado — nesse caso NÃO existe margem
   * calculável, e a interface precisa dizer isso em vez de exibir R$ 0,00.
   */
  cmv: number | null;
  impostoPercentual: number;
  comissaoPercentual: number;
  taxaFixa: number;
  /** Frete/subsídio de frete grátis absorvido pelo seller, por unidade */
  freteUnitario: number;
  /** ADS / anúncios patrocinados atribuídos a este anúncio, por unidade */
  custoMidiaUnitario: number;
  /**
   * Dados brutos de Ads deste anúncio — null quando o seller não ativou
   * Ads nele. Quando existe, `custoMidiaUnitario` acima já reflete
   * `investimento / vendasAtribuidas`, então a conta de margem normal já
   * desconta o Ads sozinha, sem precisar de fórmula separada.
   */
  ads: DadosAds | null;
  /** Comissão de afiliado/criador (TAP, lives), por unidade */
  custoAfiliadoUnitario: number;
  /** Se as taxas acima são projeção ou já foram liquidadas pelo canal */
  origemTaxas: OrigemValor;
  /**
   * Vínculo anúncio ↔ produto do catálogo (Produto.id). null = sem vínculo,
   * e sem ele não há CMV — o anúncio cai na fila de Pendências até o seller
   * vincular a um produto existente ou criar um novo a partir dele.
   */
  produtoId: string | null;
  status: StatusAnuncio;
  elegivelPromocao: boolean;
  /** Unidades vendidas no período — usado na curva ABC e no realizado */
  unidadesVendidas: number;
  /**
   * Data da última venda (ISO). null = nunca vendeu desde que entrou no
   * sistema. É o que permite dizer "parado há 32 dias" — sem este campo o
   * agente de giro não tem gatilho nenhum para disparar.
   */
  dataUltimaVenda: string | null;
  /**
   * ROAS que o seller configurou como meta no Ads Manager do marketplace
   * (quanto a plataforma tenta manter de retorno por real investido).
   * null quando o anúncio não tem Ads ativo (`ads` também é null nesse
   * caso) ou quando o seller ainda não configurou nenhum objetivo. Não
   * confundir com o ROAS mínimo — este último nunca é guardado, é sempre
   * calculado na hora a partir da margem de contribuição (Agente de Ads).
   */
  roasObjetivo: number | null;
}

/**
 * Um ponto do histórico diário de Ads de um anúncio — a fonte do gráfico
 * de trajetória do ROAS (Agente de Ads). Cada linha é o dado bruto de UM
 * dia; ROAS, ACOS, CTR e CPC continuam sendo sempre calculados na hora a
 * partir destes números, nunca guardados prontos — mesma regra do
 * `DadosAds` do próprio anúncio.
 */
export interface HistoricoAdsDia {
  data: string; // ISO (yyyy-mm-dd)
  anuncioId: string;
  investimento: number;
  impressoes: number;
  cliques: number;
  vendasAtribuidas: number;
  faturamentoAtribuido: number;
}

/**
 * Um "antes/depois" de uma taxa do anúncio (comissão ou taxa fixa),
 * detectado pelo Agente Auditor comparando o valor salvo aqui com o valor
 * atual do anúncio. Cada linha vira o motivo de uma `OcorrenciaAuditor`
 * do tipo "mudanca-taxa".
 */
export interface HistoricoTaxaAnuncio {
  id: string;
  anuncioId: string;
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  campo: "comissaoPercentual" | "taxaFixa";
  valorAnterior: number;
  valorNovo: number;
  detectadoEm: string; // ISO
}

export interface AlteracaoPreco {
  id: string;
  data: string; // ISO
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  precoAnterior: number;
  precoNovo: number;
  usuario: string;
}

export interface Promocao {
  id: string;
  marketplaceId: MarketplaceId;
  sku: string;
  produto: string;
  precoAtual: number;
  tipo: string;
  rebate: number;
  precoFinal: number;
  cmv: number;
  impostoPercentual: number;
  comissaoPercentual: number;
  taxaFixa: number;
}

export interface ItemEstoque {
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  estoqueAtual: number;
  estoqueFulfillment: number;
}

export type TipoNotificacao =
  | "sincronizacao"
  | "erro"
  | "desconexao"
  | "configuracao"
  | "promocao";

export interface Notificacao {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  descricao: string;
  data: string; // ISO
  lida: boolean;
}

export type PapelUsuario = "administrador" | "analista" | "operacional";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: PapelUsuario;
  ativo: boolean;
  ultimoAcesso: string;
  avatarUrl?: string;
}

export interface LogAlteracao {
  id: string;
  data: string; // ISO
  usuario: string;
  acao: string;
  valorAnterior: string;
  valorNovo: string;
}


/* ------------------------------------------------------------------ */
/* Custos operacionais do seller                                      */
/* ------------------------------------------------------------------ */

/**
 * Custo que o seller tem por venda e que o marketplace não cobra dele:
 * embalagem, fita, etiqueta, plástico bolha. Sem isso o "lucro real" é
 * lucro antes de embalar.
 */
export interface CustoOperacional {
  id: string;
  /** Nome dado pelo próprio seller — aparece no Raio-X como ele escreveu */
  nome: string;
  /** "fixo" = R$ por unidade vendida; "percentual" = % sobre o preço */
  tipo: "fixo" | "percentual";
  /** Reais quando fixo; fração 0-1 quando percentual */
  valor: number;
  ativo: boolean;
}

export type RegimeTributario =
  | "simples-nacional"
  | "lucro-presumido"
  | "lucro-real";

/**
 * Perfil do seller autenticado — 1 linha por login, guardada na tabela
 * `perfis` do Supabase (id = mesmo id do usuário em auth.users). É o que
 * alimenta a lateral do app (logo, nome, plano).
 *
 * Sobre os nomes: `nomeExibicao` guarda o NOME FANTASIA da loja — é o nome
 * que o seller digita na aba Empresa e o que aparece em primeiro lugar na
 * lateral. A coluna no banco continua se chamando `nome_exibicao` por
 * compatibilidade com o que já está gravado lá. `razaoSocial` é o nome
 * jurídico, que aparece abaixo dele.
 */
export interface Perfil {
  id: string;
  nomeExibicao: string;
  razaoSocial: string | null;
  email: string;
  logoUrl: string | null;
  plano: string;
  /** Aponta pra `planos.id` ('essencial' | 'agentes') — é o que decide o
   * que o app libera, diferente de `plano`, que é só o texto exibido. */
  planoId: string;
}

/** O que o plano do seller libera — vem de `planos.recursos` no banco. */
export interface RecursosPlano {
  dashboard: boolean;
  agentes: boolean;
  agentesEscrita: boolean;
}

export interface DadosEmpresa {
  nome: string;
  cnpj: string;
  nomeFantasia: string;
  email: string;
  telefone: string;
  /** Endereço separado — CEP, rua, número, complemento, bairro, cidade, UF */
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  /** Para onde saem as cotações de reposição */
  emailFornecedor: string;
}

export interface ConfiguracaoFiscal {
  regime: RegimeTributario;
  /** Fração 0-1 aplicada sobre o faturamento */
  aliquota: number;
}

/**
 * Uma empresa do seller. Cada CNPJ é uma empresa separada aos olhos da lei:
 * tem o próprio regime tributário, as próprias despesas e o próprio
 * fechamento. O DRE nunca soma empresas diferentes — só mostra uma por vez.
 */
export interface Empresa {
  id: string;
  /** Razão social, como sai na nota */
  nome: string;
  nomeFantasia: string;
  cnpj: string;
  regime: RegimeTributario;
  /** Fração 0-1 aplicada sobre o faturamento desta empresa */
  aliquota: number;
}

export type TipoLancamento = "despesa" | "receita";

/**
 * Um gasto ou uma entrada que NÃO vem de venda: aluguel, contador, energia,
 * folha, ou uma receita avulsa. Pertence sempre a uma empresa.
 *
 * Recorrência: o lançamento é guardado uma vez só, com o mês em que começa.
 * Se `recorrente` for true, ele repete todo mês PRA SEMPRE — não tem um
 * número de repetições. Os meses seguintes são calculados na hora de ler.
 *
 * Duas formas de parar, e elas não se confundem:
 * - `competenciaFim`: "parar de repetir daqui pra frente". Guarda o último
 *   mês em que o lançamento ainda vale; a partir do mês seguinte ele some
 *   sozinho. Os meses já lançados antes disso continuam intocados.
 * - `mesesExcluidos`: exceção pontual — remove só UM mês específico (passado
 *   ou futuro) sem mexer na recorrência nem nos outros meses. É o que o
 *   seller usa quando quer apagar, por exemplo, só o de julho.
 */
export interface Lancamento {
  id: string;
  empresaId: string;
  tipo: TipoLancamento;
  /** "Aluguel", "Contador", "Energia" — vem de uma lista fixa de categorias */
  categoria: string;
  descricao: string;
  /** Mês em que começa, no formato "2026-09" */
  competencia: string;
  valor: number;
  /** Quando true, repete todo mês a partir da competência, sem fim definido */
  recorrente: boolean;
  /** Último mês em que a recorrência ainda vale; null = sem fim (continua) */
  competenciaFim: string | null;
  /** Competências específicas em que este lançamento foi removido à parte */
  mesesExcluidos: string[];
  criadoEm: string; // ISO
}

/** Categorias fixas de despesa/receita, na ordem em que aparecem no formulário. */
export const CATEGORIAS_LANCAMENTO = [
  "Aluguel",
  "Contador",
  "Energia",
  "Folha",
  "Marketing",
  "Software/assinaturas",
  "Outros",
] as const;

export interface Periodo {
  inicio: Date;
  fim: Date;
  rotulo: string;
}

export type TipoOportunidadeRecuperacao =
  | "boleto-pendente"
  | "pix-nao-pago"
  | "cancelamento-solicitado";

export type StatusOportunidadeRecuperacao = "aguardando-acao" | "mensagem-enviada";

export interface OportunidadeRecuperacao {
  id: string;
  cliente: string;
  telefone: string;
  pedidoId: string;
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  contaId: string;
  valor: number;
  tipo: TipoOportunidadeRecuperacao;
  tempoRestante: string;
  status: StatusOportunidadeRecuperacao;
  dataCriacao: string; // ISO
  dataUltimoContato: string | null; // ISO
}


export interface ItemEstoqueDetalhado {
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  quantidade: number;
  vendasDia: number;
  coberturaDias: number;
  custoUnitario: number;
  valorEstoque: number;
  /** Quantos dias o fornecedor leva pra entregar uma reposição — o alerta
   * de ruptura precisa vir com essa folga de antecedência, e não só
   * quando o estoque já está baixo. */
  prazoFornecedorDias: number;
  /** Quanto o marketplace cobra por mês de armazenagem deste item no
   * centro de distribuição dele. Sempre 0 no estoque próprio do seller —
   * só existe cobrança de armazenagem quando o item está no Full. */
  custoArmazenagemMensal: number;
}

/* ------------------------------------------------------------------ */
/* Agentes                                                            */
/* ------------------------------------------------------------------ */

export type AgenteId =
  | "precificacao"
  | "analista"
  | "sac"
  | "estoque"
  | "ads"
  | "criativo"
  | "fulfillment"
  | "auditor";

/**
 * Situação de uma sugestão. Enquanto não há API com permissão de escrita,
 * "aprovada" significa que o seller aceitou e vai aplicar no marketplace na
 * mão. Quando a API conectar, é aqui que entra "aplicada".
 */
export type StatusSugestao = "pendente" | "aprovada" | "recusada";

/**
 * Semáforo da decisão — a mesma linguagem do resto do sistema:
 * verde   = continua acima da margem mínima, o agente poderia agir sozinho
 * amarelo = cai abaixo da margem mínima, precisa do seller
 * vermelho= abaixo do empate, é prejuízo; só o seller decide queimar
 */
export type SemaforoDecisao = "verde" | "amarelo" | "vermelho";

/**
 * Um evento é TUDO que um agente fez ou propôs. É a peça central: o feed, o
 * histórico, a fila de aprovação e (mais para a frente) a sala com os
 * avatares leem todos desta mesma lista. Um dado, várias telas.
 */
export interface EventoAgente {
  id: string;
  agenteId: AgenteId;
  /** Quando o agente decidiu (ISO) */
  data: string;
  anuncioId: string;
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  contaId: string;
  /** Por que agiu, em português, para aparecer no feed */
  motivo: string;
  diasParado: number;
  precoAtual: number;
  precoSugerido: number;
  margemAtual: number;
  margemSugerida: number;
  /** Piso calculado para este anúncio neste canal */
  precoMinimo: number;
  semaforo: SemaforoDecisao;
  /** true quando o degrau de 5% bateria no piso e foi travado nele */
  travadoNoPiso: boolean;
  status: StatusSugestao;
  /** Quando o seller decidiu (ISO); null enquanto pendente */
  decididoEm: string | null;
}

/* ------------------------------------------------------------------ */
/* Agente Analista                                                     */
/* ------------------------------------------------------------------ */

/** As cinco frentes do Analista — cada uma vira um tipo de aviso no feed. */
export type TipoInsightAnalista =
  | "queda_margem"
  | "curva_abc"
  | "dado_faltando"
  | "saude_conta"
  | "resumo_diario";

/**
 * Um aviso do Analista. Mais simples que `EventoAgente`: não é uma
 * decisão de preço, é uma observação — por isso não tem "preço antes/
 * depois", só o motivo e os números que sustentam ele em `dados`.
 */
export interface InsightAnalista {
  id: string;
  tipo: TipoInsightAnalista;
  data: string;
  /** null quando o aviso é do negócio como um todo, não de uma conta específica */
  contaId: string | null;
  motivo: string;
  semaforo: SemaforoDecisao;
  /** "aprovada" aqui significa "visto/reconhecido", não "aplicado" */
  status: StatusSugestao;
  decididoEm: string | null;
  dados: Record<string, unknown>;
}

/* ------------------------------------------------------------------ */
/* Agente SAC                                                          */
/* ------------------------------------------------------------------ */

/**
 * Uma pergunta de cliente (fictícia, até a API de mensagens conectar) e,
 * quando o seller pedir, a resposta gerada por IA — nunca gerada
 * sozinha: só quando alguém clica em "Gerar resposta", porque é o único
 * passo desse agente que custa token de verdade.
 */
export interface TicketSac {
  id: string;
  data: string;
  contaId: string | null;
  anuncioId: string | null;
  produto: string;
  sku: string;
  marketplaceId: MarketplaceId;
  pergunta: string;
  /** null até o seller pedir a IA gerar */
  resposta: string | null;
  status: StatusSugestao;
  decididoEm: string | null;
}

/* ------------------------------------------------------------------ */
/* Agente de Estoque                                                   */
/* ------------------------------------------------------------------ */

/**
 * Um alerta de ruptura projetada — não é "já esgotou", é "no ritmo atual,
 * vai esgotar em breve". Vem sempre com a conta: quanto vendeu, a que
 * ritmo, e quanto repor pra não correr risco.
 */
export interface AlertaEstoque {
  id: string;
  data: string;
  contaId: string | null;
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  estoqueAtual: number;
  vendidoUltimos7Dias: number;
  mediaDiaria: number;
  diasRestantes: number;
  quantidadeSugerida: number;
  diasAlvoCobertura: number;
  status: StatusSugestao;
  decididoEm: string | null;
}

/* ------------------------------------------------------------------ */
/* Agente de Ads                                                       */
/* ------------------------------------------------------------------ */

/** As duas janelas do agente: achar quem devia entrar em Ads, e avaliar
 * quem já está. */
export type TipoEventoAds = "sugestao" | "analise";

/**
 * Um produto, numa das duas janelas. `investimento`, `lucroLiquido` e
 * `valeAPena` só existem de verdade na "análise" — na "sugestão" eles
 * ficam zerados/null, porque o produto ainda não está em Ads.
 *
 * De propósito, só o essencial: quanto vende por dia, quanto investiu,
 * e o que sobrou de lucro líquido no final — nada de ROAS/ACOS/CTR
 * poluindo a tela, isso fica só no Dashboard.
 */
export interface EventoAds {
  id: string;
  tipo: TipoEventoAds;
  data: string;
  contaId: string | null;
  sku: string;
  produto: string;
  quantidade: number;
  unidadesPorDia: number;
  faturamento: number;
  investimento: number;
  /** Lucro já com o Ads descontado — o número que fecha a pergunta
   * "sobrou dinheiro ou não". Na sugestão, é o lucro sem Ads mesmo
   * (ainda não investe nele). */
  lucroLiquido: number;
  /** Margem se não tivesse Ads nenhum */
  margemSemAds: number;
  /** Margem de verdade, com o Ads descontado — igual à margemSemAds na
   * sugestão, já que ainda não tem Ads pra descontar */
  margemComAds: number;
  /** null na sugestão (não se aplica ainda); true/false na análise */
  valeAPena: boolean | null;
  status: StatusSugestao;
  decididoEm: string | null;
}


/* ------------------------------------------------------------------ */
/* Agente Criativo                                                     */
/* ------------------------------------------------------------------ */

/**
 * Título, descrição, palavras-chave e bullet points de um anúncio —
 * os quatro nascem juntos, na mesma chamada à IA, porque custa
 * praticamente o mesmo gerar um ou os quatro. Todos ficam null até o
 * seller pedir: é o único passo desse agente que gasta token de verdade.
 */
export interface SugestaoCriativo {
  id: string;
  data: string;
  contaId: string | null;
  anuncioId: string | null;
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  tituloSugerido: string | null;
  descricaoSugerida: string | null;
  palavrasChave: string | null;
  bulletPoints: string | null;
  status: StatusSugestao;
  decididoEm: string | null;
}


/* ------------------------------------------------------------------ */
/* Ficha do anúncio — usada pelo Criativo e pelo SAC                   */
/* ------------------------------------------------------------------ */

/**
 * Informação técnica completa de um anúncio, digitada pelo próprio
 * seller. Sem API ainda, a IA não enxerga o anúncio publicado — esta
 * ficha é como o Criativo (pra reescrever título/descrição) e o SAC
 * (pra responder pergunta técnica sem inventar) "enxergam" o produto.
 * Uma por SKU; o seller pode editar a qualquer momento.
 */
export interface FichaAnuncio {
  id: string;
  sku: string;
  descricaoCompleta: string;
  atualizadoEm: string; // ISO
}

/* ------------------------------------------------------------------ */
/* Agente SAC — modelos de mensagem e regras aprendidas                */
/* ------------------------------------------------------------------ */

/** As situações de pedido que já têm uma mensagem pronta pro seller usar
 * como ponto de partida. Pergunta de pré-venda e reclamação continuam
 * geradas do zero pela IA — variam demais pra caber num modelo fixo. */
export type SituacaoSac = "pedido-despachado" | "pedido-nao-despachado";

/**
 * O texto pronto que o SAC sugere pra cada situação de pedido. Começa
 * com um texto padrão; se o seller editar antes de aprovar e confirmar
 * que quer guardar a edição, o texto editado vira o novo padrão daqui
 * pra frente (o padrão anterior não é perdido, só sobrescrito).
 */
export interface ModeloMensagemSac {
  id: string;
  situacao: SituacaoSac;
  texto: string;
  atualizadoEm: string; // ISO
}

/**
 * Uma regra curta que molda como o SAC responde — nascida de uma edição
 * do seller numa resposta (o Gestor identifica o padrão e propõe a
 * regra) ou escrita direto pelo seller nas Configurações. Fica sempre
 * visível e editável; desativar não apaga o histórico de onde veio.
 */
export interface RegraSac {
  id: string;
  regra: string;
  origem: "aprendida" | "manual";
  ativa: boolean;
  criadaEm: string; // ISO
}

/* ------------------------------------------------------------------ */
/* Agente Auditor                                                      */
/* ------------------------------------------------------------------ */

/** As duas frentes do Auditor: a regra do anúncio mudou (comissão ou
 * taxa fixa), ou um pedido específico foi cobrado diferente do esperado. */
export type TipoOcorrenciaAuditor = "mudanca-taxa" | "cobranca-divergente";

/** Acompanha um processo, não só uma decisão — por isso tem mais estados
 * que `StatusSugestao`: o seller reclama com o marketplace e o resultado
 * demora a vir, então o Auditor precisa lembrar em que pé isso ficou. */
export type StatusOcorrenciaAuditor =
  | "aberto"
  | "reclamacao-aberta"
  | "reembolsado"
  | "ignorado";

/**
 * Um item de conferência do Auditor. `campo`/`valorAnterior`/`valorNovo`
 * só existem no tipo "mudanca-taxa"; `itemDivergente`/`valorEsperado`/
 * `valorCobrado`/`diferenca` só existem no tipo "cobranca-divergente" —
 * cada ocorrência preenche só o par que faz sentido pro seu tipo.
 */
export interface OcorrenciaAuditor {
  id: string;
  tipo: TipoOcorrenciaAuditor;
  data: string; // ISO
  anuncioId: string | null;
  pedidoId: string | null;
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  contaId: string;
  /** Por que o Auditor agiu, em português, pra aparecer na lista */
  motivo: string;
  campo: "comissaoPercentual" | "taxaFixa" | null;
  valorAnterior: number | null;
  valorNovo: number | null;
  itemDivergente: "frete" | "comissao" | "taxaFixa" | null;
  valorEsperado: number | null;
  valorCobrado: number | null;
  diferenca: number | null;
  status: StatusOcorrenciaAuditor;
  /** Quando o seller mudou o status pela última vez; null enquanto "aberto" */
  atualizadoEm: string | null;
}
