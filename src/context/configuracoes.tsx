import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { CONTAS, EMPRESA, REGRAS_FINANCEIRAS } from "@/data/mock";
import type {
  ConfiguracaoFiscal,
  ContaMarketplace,
  CustoOperacional,
  DadosEmpresa,
  MetasMargem,
} from "@/types";

/**
 * Estado das configurações do seller. Enquanto não há banco de dados, isto
 * vive na memória da sessão: recarregar a página volta aos valores iniciais.
 * A leitura é feita por todo o sistema, então mudar aqui muda o cálculo lá.
 *
 * As CONTAS (nome, taxas, status de conexão) também vivem aqui, e não como
 * estado local de cada tela: o nome que o seller dá a uma conta em
 * Configurações → Integrações precisa aparecer igual no menu, no Hub e no
 * cabeçalho da conta — um estado só, lido de vários lugares.
 */
interface ConfiguracoesContexto {
  empresa: DadosEmpresa;
  salvarEmpresa: (dados: DadosEmpresa) => void;

  fiscal: ConfiguracaoFiscal;
  salvarFiscal: (dados: ConfiguracaoFiscal) => void;

  contas: ContaMarketplace[];
  atualizarConta: (id: string, dados: Partial<ContaMarketplace>) => void;

  /** Metas de margem por CONTA — dão as cores do Raio-X daquela conta específica */
  metasPorConta: Record<string, MetasMargem | null>;
  salvarMetas: (contaId: string, metas: MetasMargem | null) => void;

  custos: CustoOperacional[];
  adicionarCusto: (custo: Omit<CustoOperacional, "id">) => void;
  atualizarCusto: (id: string, dados: Partial<CustoOperacional>) => void;
  removerCusto: (id: string) => void;

  /** Soma dos custos operacionais ativos para um dado preço de venda */
  custoOperacionalTotal: (precoVenda: number) => number;
  /** Detalhamento nome a nome, para exibir sob a coluna do Raio-X */
  custoOperacionalDetalhado: (
    precoVenda: number,
  ) => { nome: string; valor: number }[];
}

const Ctx = createContext<ConfiguracoesContexto | null>(null);

const CUSTOS_INICIAIS: CustoOperacional[] = [
  { id: "c1", nome: "Embalagem", tipo: "fixo", valor: 1.8, ativo: true },
  { id: "c2", nome: "Fita e etiqueta", tipo: "fixo", valor: 0.45, ativo: true },
];

export function ConfiguracoesProvider({ children }: { children: ReactNode }) {
  const [empresa, setEmpresa] = useState<DadosEmpresa>({
    nome: EMPRESA.nome,
    cnpj: EMPRESA.cnpj,
    nomeFantasia: "NEXO",
    email: EMPRESA.email,
    telefone: EMPRESA.telefone,
    cep: "01310-200",
    rua: "Av. Paulista",
    numero: "1578",
    complemento: "Conj. 142",
    bairro: "Bela Vista",
    cidade: "São Paulo",
    estado: "SP",
    emailFornecedor: "compras@fornecedor.com.br",
  });

  const [fiscal, setFiscal] = useState<ConfiguracaoFiscal>({
    regime: "simples-nacional",
    aliquota: REGRAS_FINANCEIRAS.impostoPercentual,
  });

  const [contas, setContas] = useState<ContaMarketplace[]>(CONTAS);

  const [metasPorConta, setMetasPorConta] = useState<
    Record<string, MetasMargem | null>
  >(() => {
    const inicial: Record<string, MetasMargem | null> = {};
    for (const c of CONTAS) inicial[c.id] = c.metas;
    return inicial;
  });

  const [custos, setCustos] = useState<CustoOperacional[]>(CUSTOS_INICIAIS);

  const valor = useMemo<ConfiguracoesContexto>(() => {
    const ativos = custos.filter((c) => c.ativo);

    const detalhar = (precoVenda: number) =>
      ativos.map((c) => ({
        nome: c.nome,
        valor: c.tipo === "fixo" ? c.valor : precoVenda * c.valor,
      }));

    return {
      empresa,
      salvarEmpresa: setEmpresa,

      fiscal,
      salvarFiscal: setFiscal,

      contas,
      atualizarConta: (id, dados) =>
        setContas((atual) =>
          atual.map((c) => (c.id === id ? { ...c, ...dados } : c)),
        ),

      metasPorConta,
      salvarMetas: (contaId, metas) =>
        setMetasPorConta((atual) => ({ ...atual, [contaId]: metas })),

      custos,
      adicionarCusto: (custo) =>
        setCustos((atual) => [
          ...atual,
          { ...custo, id: `c${Date.now()}` },
        ]),
      atualizarCusto: (id, dados) =>
        setCustos((atual) =>
          atual.map((c) => (c.id === id ? { ...c, ...dados } : c)),
        ),
      removerCusto: (id) => setCustos((atual) => atual.filter((c) => c.id !== id)),

      custoOperacionalTotal: (precoVenda) =>
        detalhar(precoVenda).reduce((s, i) => s + i.valor, 0),
      custoOperacionalDetalhado: detalhar,
    };
  }, [empresa, fiscal, contas, metasPorConta, custos]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useConfiguracoes() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useConfiguracoes precisa estar dentro de ConfiguracoesProvider");
  return ctx;
}
