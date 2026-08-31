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
  lucroLiquido: number;
  margem: number; // 0-1
  status: StatusPedido;
  cliente: string;
  telefone: string;
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
  /** Vínculo anúncio ↔ produto do catálogo. Sem ele não há CMV. */
  produtoVinculado: boolean;
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

export interface Periodo {
  inicio: Date;
  fim: Date;
  rotulo: string;
}

export type TipoOportunidadeRecuperacao =
  | "boleto-pendente"
  | "pix-nao-pago"
  | "cancelamento-solicitado";

export type StatusOportunidadeRecuperacao =
  | "aguardando-acao"
  | "mensagem-enviada"
  | "recuperado";

export type CanalRecuperacao = "whatsapp" | "email" | "sms";

export interface OportunidadeRecuperacao {
  id: string;
  cliente: string;
  pedidoId: string;
  marketplaceId: MarketplaceId;
  valor: number;
  tipo: TipoOportunidadeRecuperacao;
  tempoRestante: string;
  status: StatusOportunidadeRecuperacao;
  canal: CanalRecuperacao;
  dataCriacao: string; // ISO
  dataUltimoContato: string | null; // ISO
}

export interface CanalNotificacao {
  id: CanalRecuperacao;
  nome: string;
  icone: string; // lucide icon name
  conectado: boolean;
  disparosAutomaticos: boolean;
  ultimoDisparo: string | null; // ISO
  taxaAbertura: number; // 0-1
  custoEstimado: number; // R$ por disparo
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
