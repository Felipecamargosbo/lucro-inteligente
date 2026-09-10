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

export interface Anuncio {
  id: string;
  marketplaceId: MarketplaceId;
  /** Conta em que o anúncio está publicado */
  contaId: string;
  sku: string;
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
}
