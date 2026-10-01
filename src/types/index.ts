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
  /** O extrato do canal para este pedido: tudo o que foi cobrado, linha
   * por linha, mais o contexto que decide o que ERA pra ser cobrado
   * (quem paga o frete, se veio de afiliado, de quem era o cupom...).
   * É o formato que as APIs dos canais devolvem. Fictício por enquanto;
   * opcional porque pedidos antigos podem não ter. */
  extrato?: ExtratoCobrancaPedido;
}

/** De quem é o frete deste pedido. */
export type ResponsavelFrete =
  /** saiu pelo Full: o frete do pedido é por conta do canal */
  | "canal-full"
  /** o comprador pagou o frete (ou o canal não cobra frete do vendedor) */
  | "comprador"
  /** frete grátis pago pelo vendedor */
  | "seller";

/** Tamanho do produto cadastrado no Full/FBA — decide a tarifa por unidade. */
export type TamanhoFulfillment = "pequeno" | "medio" | "grande";

/** Tudo o que o Auditor sabe conferir, em pedidos e na fatura do Full. */
export type ItemCobrancaAuditor =
  | "comissao"
  | "taxaFixa"
  | "frete"
  | "parcelamento"
  | "taxaTransacao"
  | "taxaServico"
  | "afiliado"
  | "cupom"
  | "freteDevolucao"
  | "tarifaFulfillment"
  | "garantia"
  | "armazenagem"
  | "armazenagemProlongada"
  | "retirada"
  | "multaFull";

/** O extrato de UM pedido: o que foi cobrado e o contexto da venda. */
export interface ExtratoCobrancaPedido {
  responsavelFrete: ResponsavelFrete;
  /** A venda veio de um link de afiliado/criador de conteúdo */
  veioDeAfiliado: boolean;
  /** Cupom usado na compra; null quando não teve cupom */
  cupom: { origem: "seller" | "canal"; valor: number } | null;
  /** Só pedidos do Full/FBA; null nos outros */
  tamanhoFulfillment: TamanhoFulfillment | null;
  /** Frete de volta da devolução, pela tabela do canal; null sem devolução */
  freteDevolucaoTabela: number | null;
  /** O que o canal cobrou, item por item. Item ausente = não cobrou. */
  cobrado: Partial<Record<ItemCobrancaAuditor, number>>;
}

/** A fatura mensal do Full de um SKU: o que o canal cobrou no mês. */
export interface CobrancaFullMes {
  marketplaceId: MarketplaceId;
  sku: string;
  produto: string;
  /** Mês da fatura, "AAAA-MM" */
  mes: string;
  /** Quando a fatura fechou (ISO) */
  data: string;
  /** Retiradas de estoque que o seller pediu no mês */
  retiradasSolicitadas: number;
  /** Não conformidades registradas pelo canal no mês */
  naoConformidades: number;
  cobrado: Partial<Record<ItemCobrancaAuditor, number>>;
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
  /** Categoria escolhida pelo seller ("Relógios", "Áudio"...) pra separar e
   * filtrar a tela Precificação. null/ausente = sem categoria. */
  categoria?: string | null;
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
  /** Precificação: "baixar" (produto parado) ou "subir" (vende rápido e o
   * estoque vai acabar). Sugestões antigas não têm — contam como "baixar". */
  direcao?: DirecaoPreco;
  /** Tamanho do ajuste sugerido, de 0 a 1 (0,08 = 8%) */
  degrau?: number;
}

export type DirecaoPreco = "baixar" | "subir";

/** Uma mudança de preço já feita — base do "acompanhar o resultado".
 * Vem das sugestões aprovadas (e, enquanto não há histórico real, de
 * exemplos fictícios). */
export interface MudancaPreco {
  id: string;
  anuncioId: string;
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  contaId: string;
  precoAntes: number;
  precoDepois: number;
  /** Quando o preço mudou (ISO) */
  data: string;
  /** true = exemplo fictício, não uma aprovação do seller */
  exemplo: boolean;
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
  /** Pedido a que a mensagem se refere (pós-venda/reclamação); null em
   * pergunta de pré-venda, feita antes de comprar */
  pedidoId?: string | null;
  /** Nome do cliente, pra personalizar a mensagem pronta */
  cliente?: string | null;
}

/** O tipo de mensagem, decidido por palavras-chave (sem IA, sem token):
 * - pré-venda: dúvida antes de comprar;
 * - pós-venda: "cadê meu pedido";
 * - reclamação: onde a reputação corre risco — o seller responde. */
export type CategoriaSac = "pre-venda" | "pos-venda" | "reclamacao";

/** Tom de voz das respostas do SAC. */
export type TomSac = "formal" | "neutro" | "descontraido";

/** A personalização do SAC que o seller define em Configurações. */
export interface ConfiguracaoSac {
  tom: TomSac;
  /** Como assinar as mensagens ("Equipe Planeta97") */
  assinatura: string;
  politicaTroca: string;
  garantia: string;
  prazoEnvio: string;
  /** Uma frase ou palavra por linha */
  frasesProibidas: string;
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
  /* Campos do Bloco 4 — opcionais porque alertas gravados antes não têm */
  /** "ruptura" = vai faltar; "parado" = sobrando no Full (só Fulfillment) */
  tipoAlerta?: TipoAlertaEstoque;
  /** Dias que o fornecedor leva pra entregar */
  prazoFornecedorDias?: number;
  /** Até quando dá pra fazer o pedido sem faltar: dias a partir de hoje.
   * Zero ou negativo = já passou do ponto, vai faltar mesmo pedindo hoje. */
  diasParaPedir?: number;
  /** Pedindo hoje, quantos dias o produto fica sem estoque até chegar */
  diasSemEstoque?: number;
  custoUnitario?: number;
  /** Quanto custa a reposição sugerida (quantidade × custo) */
  custoReposicao?: number;
  veredito?: VereditoReposicao;
  /** Por que vale (ou não) repor, em português */
  motivoVeredito?: string;
  classeAbc?: "A" | "B" | "C" | null;
  /** Margem líquida do SKU nos últimos 30 dias */
  margem30d?: number | null;
  /* Só Fulfillment */
  /** Dias pra preparar, agendar, transportar e o Full conferir */
  prazoEnvioFullDias?: number;
  /** Estoque próprio disponível pra mandar pro Full */
  estoqueProprio?: number;
  /** Quanto mandar do estoque próprio pro Full agora */
  quantidadeEnviar?: number;
  /** Quanto falta comprar do fornecedor (quando o estoque próprio não dá) */
  quantidadeComprar?: number;
  /** Armazenagem que este SKU custa hoje por mês no Full */
  custoArmazenagemMensal?: number;
  /** Parado: quantas unidades vale retirar do Full */
  quantidadeRetirar?: number;
  /** Parado: quanto custa retirar essas unidades */
  custoRetirada?: number;
  /** Parado: quanto deixa de pagar de armazenagem por mês retirando */
  economiaMensal?: number;
}

/** O que o agente acha de repor: vale, vale com cuidado (repor menos) ou
 * não vale (resolver o preço antes). */
export type VereditoReposicao = "repor" | "repor-com-cuidado" | "nao-repor";

export type TipoAlertaEstoque = "ruptura" | "parado";

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


/** As três ações que o Agente de Ads sugere em cima do ROAS mínimo. */
export type TipoAcaoAds = "ajuste_roas" | "realocacao" | "anuncio_cansado";

/** Um dos lados de uma realocação de verba (de onde sai / pra onde vai). */
export interface LadoRealocacaoAds {
  anuncioId: string;
  sku: string;
  produto: string;
  classe: "A" | "B" | "C" | null;
  roasAtual: number;
  roasMinimo: number;
  investimento: number;
  diasSeguidosAbaixo: number;
  coberturaEstoqueDias: number | null;
}

/** O "miolo" de cada ação — cada tipo guarda só o que ele precisa. */
export type DetalheAcaoAds =
  | {
      tipo: "ajuste_roas";
      direcao: "subir" | "baixar";
      roasAtual: number;
      roasMinimo: number;
      roasObjetivoAtual: number;
      roasObjetivoSugerido: number;
    }
  | {
      tipo: "realocacao";
      fonte: LadoRealocacaoAds;
      destino: LadoRealocacaoAds;
      /** Cada ação fala de UM anúncio só: "reduzir" = o anúncio no prejuízo
       * (fonte), "aumentar" = o saudável (destino). Ausente = formato antigo,
       * com os dois juntos no mesmo aviso. */
      lado?: "reduzir" | "aumentar";
    }
  | {
      tipo: "anuncio_cansado";
      cliques: number;
      vendas: number;
      conversao: number;
      investimento: number;
    };

/**
 * Uma sugestão de ação do Agente de Ads. Igual às outras sugestões:
 * o seller aprova ou recusa, e o NEXO não mexe em nada no marketplace
 * sozinho (sem API de escrita ainda — "aprovada" = "vou aplicar").
 */
export interface AcaoAds {
  id: string;
  data: string;
  contaId: string | null;
  anuncioId: string;
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  motivo: string;
  semaforo: SemaforoDecisao;
  status: StatusSugestao;
  decididoEm: string | null;
  detalhe: DetalheAcaoAds;
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
/** De onde veio o pedido de conteúdo novo: dos exemplos iniciais, do SAC
 * (clientes perguntando a mesma coisa) ou do Ads (muito clique, pouca
 * compra). */
export type OrigemCriativo = "exemplo" | "sac" | "ads";

export interface SugestaoCriativo {
  id: string;
  data: string;
  contaId: string | null;
  anuncioId: string | null;
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  /** Por que esse anúncio veio pro Criativo — escrito pelo agente que mandou */
  motivo: string;
  origem: OrigemCriativo;
  tituloSugerido: string | null;
  /** As 3 opções de título que a IA escreveu (a 1ª é o tituloSugerido).
   * null em sugestões geradas antes do Bloco 7, que só tinham um título. */
  titulosAlternativos: string[] | null;
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
 * "Informações extras" do produto, escritas pelo seller — OPCIONAL. O
 * principal vem do próprio anúncio (ConteudoPublicado); aqui entra só o
 * que o anúncio não diz ou diz errado ("serve também no modelo X", "a
 * cor real é mais escura"). Quando as duas coisas se contradizem, a
 * informação extra vale mais. Uma por SKU (tabela fichas_anuncio).
 */
export interface FichaAnuncio {
  id: string;
  sku: string;
  descricaoCompleta: string;
  atualizadoEm: string; // ISO
}

/**
 * O anúncio como está publicado no marketplace: título, descrição e ficha
 * técnica (atributos). Com a API, o NEXO puxa isso sozinho do anúncio;
 * até lá, vem de dados fictícios (origem "exemplo"). É a base de tudo que
 * o SAC responde e que o Criativo reescreve — o seller não precisa colar.
 */
export interface ConteudoPublicado {
  sku: string;
  titulo: string;
  descricao: string;
  atributos: { nome: string; valor: string }[];
  origem: "exemplo" | "api";
}

/**
 * O que o seller configurou pro Agente Criativo: palavras que ele não quer
 * ver nos anúncios ("quem avisa é você") e o limite de caracteres do
 * título em cada canal — os marketplaces mudam essa regra de tempos em
 * tempos, então o seller pode corrigir o número sem esperar o NEXO.
 */
export interface ConfiguracaoCriativo {
  /** Uma palavra ou frase por linha */
  palavrasProibidas: string;
  limitesTitulo: Record<MarketplaceId, number>;
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

/** As frentes do Auditor: a regra do anúncio mudou (comissão ou taxa
 * fixa); um pedido específico foi cobrado diferente do esperado; ou a
 * fatura mensal do Full de um SKU veio diferente do esperado. */
export type TipoOcorrenciaAuditor = "mudanca-taxa" | "cobranca-divergente" | "cobranca-full";

/** Acompanha um processo, não só uma decisão — por isso tem mais estados
 * que `StatusSugestao`: o seller reclama com o marketplace e o resultado
 * demora a vir, então o Auditor precisa lembrar em que pé isso ficou. */
export type StatusOcorrenciaAuditor =
  | "aberto"
  | "reclamacao-aberta"
  | "reembolsado"
  | "ignorado";

/** Um item conferido pelo Auditor: o que era pra ser cobrado, o que foi
 * cobrado e a conta que explica o esperado. */
export interface ItemDivergenteAuditor {
  item: ItemCobrancaAuditor;
  esperado: number;
  cobrado: number;
  /** Como o esperado foi calculado, em português ("16% sobre R$ 84,90") */
  regra?: string;
  /** O que chama atenção no cobrado ("equivale a 17,5% da venda") —
   * só existe quando o item veio diferente */
  observacao?: string;
  /** Nada era pra ser cobrado (esperado 0) e veio cobrança */
  indevido?: boolean;
}

/** Um pedido que já saiu com a taxa nova, depois de uma mudança de regra. */
export interface PedidoAfetadoAuditor {
  pedidoId: string;
  data: string; // ISO
  faturamento: number;
  /** Quanto este pedido pagou a mais por causa da taxa nova */
  custoExtra: number;
}

/**
 * Um item de conferência do Auditor.
 * - "mudanca-taxa": a REGRA do anúncio mudou. Usa `campo`,
 *   `valorAnterior`, `valorNovo` e `pedidosAfetados` (os pedidos que já
 *   saíram com a taxa nova). Esses pedidos não estão errados — só ficaram
 *   mais caros —, por isso ficam agrupados aqui em vez de virar um alerta
 *   de cobrança cada um.
 * - "cobranca-divergente": UM pedido foi cobrado diferente da regra que
 *   vale. Usa `pedidoId` e `itensDivergentes` — um pedido com frete E
 *   comissão errados vira uma ocorrência só, com os dois lado a lado.
 */
export interface OcorrenciaAuditor {
  /** id da linha em `eventos_agente`; vazio enquanto só existe no cálculo */
  id: string;
  /** Identidade estável da ocorrência — é o que impede o Auditor de
   * registrar a mesma coisa duas vezes a cada varredura */
  chave: string;
  tipo: TipoOcorrenciaAuditor;
  data: string; // ISO
  anuncioId: string | null;
  pedidoId: string | null;
  sku: string;
  produto: string;
  marketplaceId: MarketplaceId;
  contaId: string;
  /** Nome da conta, pra escrever a reclamação sem precisar buscar de novo */
  contaNome: string;
  /** Por que o Auditor agiu, em português, pra aparecer na lista */
  motivo: string;
  /** Explicação da causa provável, em português */
  causaProvavel: string;
  campo: "comissaoPercentual" | "taxaFixa" | null;
  valorAnterior: number | null;
  valorNovo: number | null;
  pedidosAfetados: PedidoAfetadoAuditor[];
  itensDivergentes: ItemDivergenteAuditor[];
  /** TODOS os itens conferidos, inclusive os que vieram certos — pra
   * tela mostrar a conta inteira com ✓ nos que batem. Ausente em
   * ocorrências gravadas antes desta versão. */
  itensConferidos?: ItemDivergenteAuditor[];
  /** Fatura do Full: mês de referência "AAAA-MM"; null nas outras */
  mesReferencia?: string | null;
  /** Cobrança divergente: soma de (cobrado − esperado) dos itens.
   * Mudança de taxa: quanto os pedidos afetados já custaram a mais. */
  diferenca: number;
  status: StatusOcorrenciaAuditor;
  /** Quando o seller mudou o status pela última vez; null enquanto "aberto" */
  atualizadoEm: string | null;
}
