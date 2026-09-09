import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useConfiguracoes } from "@/context/configuracoes";
import { vendasService } from "@/services";
import {
  chaveCompetencia,
  deslocarCompetencia,
  montarDre,
  rotuloCompetencia,
} from "@/lib/finance";
import { DRE } from "@/components/financeiro/DRE";
import { Painel } from "@/components/comum/Indicadores";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { Lancamento } from "@/types";

export const Route = createFileRoute("/financeiro")({
  head: () => ({
    meta: [
      { title: "Financeiro — DRE | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "DRE por empresa e por mês: do faturamento até o lucro líquido, com cada taxa do marketplace discriminada, conta por conta.",
      },
      { property: "og:title", content: "Financeiro — DRE | NEXO Rentabilidade" },
      {
        property: "og:description",
        content:
          "Veja para onde foi cada real: taxas dos canais, CMV, impostos, ADS e despesas fixas até o lucro do mês.",
      },
    ],
  }),
  component: Financeiro,
});

type AbaFinanceiro = "dre" | "lancamentos" | "recebiveis";

const ABAS: { id: AbaFinanceiro; titulo: string }[] = [
  { id: "dre", titulo: "DRE" },
  { id: "lancamentos", titulo: "Lançamentos" },
  { id: "recebiveis", titulo: "Recebíveis" },
];

/** Os últimos 12 meses, do mais recente para o mais antigo. */
function ultimosMeses(quantidade = 12): string[] {
  const hoje = chaveCompetencia(new Date());
  return Array.from({ length: quantidade }, (_, i) => deslocarCompetencia(hoje, -i));
}

function EmConstrucao({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <Painel titulo={titulo} descricao="Em construção">
      <div className="px-5 py-14 text-center text-sm text-muted-foreground">{texto}</div>
    </Painel>
  );
}

function Financeiro() {
  const { empresas, contas } = useConfiguracoes();

  const [aba, setAba] = useState<AbaFinanceiro>("dre");
  const [empresaId, setEmpresaId] = useState(empresas[0]?.id ?? "");
  const [competencia, setCompetencia] = useState(() => chaveCompetencia(new Date()));

  // Os lançamentos entram na próxima etapa (aba Lançamentos). Até lá o DRE
  // fecha só com o que vem das vendas, e avisa na tela que as despesas
  // fixas ainda não estão descontadas.
  const [lancamentos] = useState<Lancamento[]>([]);

  const meses = useMemo(() => ultimosMeses(), []);
  const empresa = empresas.find((e) => e.id === empresaId) ?? empresas[0];

  const pedidos = vendasService.listar();

  const dre = useMemo(
    () =>
      montarDre({
        pedidos,
        contas,
        lancamentos,
        empresaId: empresa?.id ?? "",
        competencia,
      }),
    [pedidos, contas, lancamentos, empresa?.id, competencia],
  );

  const dreAnterior = useMemo(
    () =>
      montarDre({
        pedidos,
        contas,
        lancamentos,
        empresaId: empresa?.id ?? "",
        competencia: deslocarCompetencia(competencia, -1),
      }),
    [pedidos, contas, lancamentos, empresa?.id, competencia],
  );

  if (!empresa) {
    return (
      <Painel titulo="Financeiro" descricao="Nenhuma empresa cadastrada">
        <div className="px-5 py-14 text-center text-sm text-muted-foreground">
          Cadastre uma empresa em Configurações para montar o DRE.
        </div>
      </Painel>
    );
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      {/* Empresa e mês valem para as três abas */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select value={empresa.id} onValueChange={setEmpresaId}>
            <SelectTrigger className="h-9 w-64 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id} className="text-xs">
                  {e.nomeFantasia} · {e.cnpj}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={competencia} onValueChange={setCompetencia}>
            <SelectTrigger className="h-9 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {meses.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {rotuloCompetencia(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <p className="text-[11px] text-muted-foreground">
          O DRE fecha uma empresa por vez — CNPJs diferentes nunca são somados.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b">
        {ABAS.map((a) => (
          <button
            key={a.id}
            onClick={() => setAba(a.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors",
              aba === a.id
                ? "border-brand text-brand"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {a.titulo}
          </button>
        ))}
      </div>

      {aba === "dre" ? (
        <DRE
          dre={dre}
          dreAnterior={dreAnterior}
          empresa={empresa}
          aoGerenciarDespesas={() => setAba("lancamentos")}
        />
      ) : aba === "lancamentos" ? (
        <EmConstrucao
          titulo="Lançamentos"
          texto="É aqui que você vai cadastrar aluguel, contador, energia e folha — com a opção de repetir todo mês. Esta é a próxima etapa."
        />
      ) : (
        <EmConstrucao
          titulo="Recebíveis"
          texto="Aqui vai mostrar quanto do faturamento já caiu na conta, quanto ainda vem e em que dia cada repasse entra. Vem depois dos Lançamentos."
        />
      )}
    </div>
  );
}
