import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CANAIS } from "@/config/navegacao";
import { useConfiguracoes } from "@/context/configuracoes";
import type { MarketplaceId } from "@/types";

export type EstadoCanal = "todas" | "parcial" | "nenhuma";

interface SelecaoContasContexto {
  /** IDs das contas atualmente selecionadas no filtro global */
  selecionadas: Set<string>;
  todasSelecionadas: boolean;
  /** Texto curto pra mostrar no botão fechado do filtro */
  rotuloResumo: string;

  estaSelecionada: (contaId: string) => boolean;
  alternarConta: (contaId: string) => void;

  /** "todas" = todas as contas do canal marcadas, "parcial" = algumas, "nenhuma" = zero */
  estadoCanal: (marketplaceId: MarketplaceId) => EstadoCanal;
  /** Marca ou desmarca de uma vez todas as contas do canal */
  alternarCanal: (marketplaceId: MarketplaceId) => void;

  selecionarTodas: () => void;

  /** Filtra qualquer lista que tenha contaId (Pedido[], Anuncio[]...) pela seleção atual */
  filtrarPorSelecao: <T extends { contaId: string }>(itens: T[]) => T[];
}

const Ctx = createContext<SelecaoContasContexto | null>(null);

export function SelecaoContasProvider({ children }: { children: ReactNode }) {
  const { contas } = useConfiguracoes();
  const [selecionadas, setSelecionadas] = useState<Set<string>>(
    () => new Set(contas.map((c) => c.id)),
  );

  // Contas criadas depois entram selecionadas por padrão; contas excluídas
  // saem da seleção sozinhas. A referência guarda quais IDs já "passaram por
  // aqui" — sem ela, uma conta que o usuário desmarcou de propósito seria
  // remarcada sozinha a cada re-render, achando que é "nova".
  const conhecidasRef = useRef<Set<string>>(new Set(contas.map((c) => c.id)));

  useEffect(() => {
    const idsAtuais = new Set(contas.map((c) => c.id));
    const conhecidas = conhecidasRef.current;

    setSelecionadas((atual) => {
      let mudou = false;
      const novo = new Set(atual);

      for (const id of atual) {
        if (!idsAtuais.has(id)) {
          novo.delete(id); // conta excluída
          mudou = true;
        }
      }
      for (const c of contas) {
        if (!conhecidas.has(c.id)) {
          novo.add(c.id); // conta nova nesta sessão: entra marcada
          mudou = true;
        }
      }

      return mudou ? novo : atual;
    });

    conhecidasRef.current = idsAtuais;
  }, [contas]);

  const valor = useMemo<SelecaoContasContexto>(() => {
    const todasSelecionadas = contas.length > 0 && selecionadas.size === contas.length;

    const contasDoCanal = (marketplaceId: MarketplaceId) =>
      contas.filter((c) => c.marketplaceId === marketplaceId);

    const estadoCanal = (marketplaceId: MarketplaceId): EstadoCanal => {
      const doCanal = contasDoCanal(marketplaceId);
      if (doCanal.length === 0) return "nenhuma";
      const marcadas = doCanal.filter((c) => selecionadas.has(c.id)).length;
      if (marcadas === 0) return "nenhuma";
      if (marcadas === doCanal.length) return "todas";
      return "parcial";
    };

    const rotuloResumo = (() => {
      if (todasSelecionadas) return "Todas as contas";
      if (selecionadas.size === 0) return "Nenhuma conta";
      for (const canal of CANAIS) {
        const doCanal = contasDoCanal(canal.id);
        if (
          doCanal.length > 0 &&
          doCanal.length === selecionadas.size &&
          doCanal.every((c) => selecionadas.has(c.id))
        ) {
          return canal.titulo;
        }
      }
      return `${selecionadas.size} conta${selecionadas.size > 1 ? "s" : ""}`;
    })();

    return {
      selecionadas,
      todasSelecionadas,
      rotuloResumo,

      estaSelecionada: (contaId) => selecionadas.has(contaId),
      alternarConta: (contaId) =>
        setSelecionadas((atual) => {
          const novo = new Set(atual);
          if (novo.has(contaId)) novo.delete(contaId);
          else novo.add(contaId);
          return novo;
        }),

      estadoCanal,
      alternarCanal: (marketplaceId) =>
        setSelecionadas((atual) => {
          const doCanal = contasDoCanal(marketplaceId);
          const marcarTudo = estadoCanal(marketplaceId) !== "todas";
          const novo = new Set(atual);
          for (const c of doCanal) {
            if (marcarTudo) novo.add(c.id);
            else novo.delete(c.id);
          }
          return novo;
        }),

      selecionarTodas: () => setSelecionadas(new Set(contas.map((c) => c.id))),

      filtrarPorSelecao: (itens) => itens.filter((i) => selecionadas.has(i.contaId)),
    };
  }, [contas, selecionadas]);

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useSelecaoContas() {
  const ctx = useContext(Ctx);
  if (!ctx)
    throw new Error("useSelecaoContas precisa estar dentro de SelecaoContasProvider");
  return ctx;
}
