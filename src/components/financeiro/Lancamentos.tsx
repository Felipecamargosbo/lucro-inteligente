import { useState } from "react";
import { toast } from "sonner";
import { Plus, Repeat, Trash2 } from "lucide-react";
import { Painel } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatBRL } from "@/lib/format";
import { lancamentosDoMes, rotuloCompetencia } from "@/lib/finance";
import { cn } from "@/lib/utils";
import { CATEGORIAS_LANCAMENTO, type Lancamento, type TipoLancamento } from "@/types";
import type { DadosNovoLancamento } from "@/lib/lancamentos-storage";

function LinhaVazia({ texto }: { texto: string }) {
  return <p className="px-5 py-10 text-center text-xs text-muted-foreground">{texto}</p>;
}

interface LancamentosProps {
  lancamentos: Lancamento[];
  empresaId: string;
  competencia: string;
  meses: string[];
  onCriar: (dados: DadosNovoLancamento) => void;
  onExcluirNoMes: (id: string, competencia: string) => void;
  onPararRecorrencia: (id: string, competencia: string) => void;
}

export function Lancamentos({
  lancamentos,
  empresaId,
  competencia,
  meses,
  onCriar,
  onExcluirNoMes,
  onPararRecorrencia,
}: LancamentosProps) {
  const [tipo, setTipo] = useState<TipoLancamento>("despesa");
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_LANCAMENTO[0]);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [competenciaForm, setCompetenciaForm] = useState(competencia);
  const [recorrente, setRecorrente] = useState(false);

  const doMes = lancamentosDoMes(lancamentos, empresaId, competencia).sort(
    (a, b) => b.valor - a.valor,
  );
  const despesas = doMes.filter((l) => l.tipo === "despesa");
  const receitas = doMes.filter((l) => l.tipo === "receita");
  const totalDespesas = despesas.reduce((s, l) => s + l.valor, 0);
  const totalReceitas = receitas.reduce((s, l) => s + l.valor, 0);

  const limpar = () => {
    setDescricao("");
    setValor("");
    setRecorrente(false);
    setCompetenciaForm(competencia);
    setCategoria(CATEGORIAS_LANCAMENTO[0]);
    setTipo("despesa");
  };

  const salvar = () => {
    const valorNumerico = Number(valor.replace(",", "."));
    if (!descricao.trim()) {
      toast.error("Descreva o lançamento antes de salvar");
      return;
    }
    if (!valorNumerico || valorNumerico <= 0) {
      toast.error("O valor precisa ser maior que zero");
      return;
    }
    onCriar({
      empresaId,
      tipo,
      categoria,
      descricao: descricao.trim(),
      competencia: competenciaForm,
      valor: valorNumerico,
      recorrente,
    });
    toast.success(`Lançamento salvo — ${rotuloCompetencia(competenciaForm)} atualizado`, {
      description: recorrente
        ? "Recorrente: vai continuar aparecendo todo mês até você parar a repetição."
        : undefined,
    });
    limpar();
  };

  return (
    <div className="space-y-5">
      <Painel
        titulo="Novo lançamento"
        descricao="Despesas fixas (aluguel, contador, energia, folha) ou receitas avulsas que não vêm de venda"
      >
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="space-y-1">
            <Label className="text-[10px]">Tipo</Label>
            <div className="flex overflow-hidden rounded-lg border">
              <button
                type="button"
                onClick={() => setTipo("despesa")}
                className={cn(
                  "px-3 py-2 text-xs font-medium transition-colors",
                  tipo === "despesa"
                    ? "bg-loss-soft text-loss"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Despesa
              </button>
              <button
                type="button"
                onClick={() => setTipo("receita")}
                className={cn(
                  "border-l px-3 py-2 text-xs font-medium transition-colors",
                  tipo === "receita"
                    ? "bg-profit-soft text-profit"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Receita
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">Categoria</Label>
            <Select value={categoria} onValueChange={setCategoria}>
              <SelectTrigger className="h-9 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS_LANCAMENTO.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="min-w-40 flex-1 space-y-1">
            <Label className="text-[10px]">Descrição</Label>
            <Input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Aluguel do galpão"
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[10px]">Mês de competência</Label>
            <Select value={competenciaForm} onValueChange={setCompetenciaForm}>
              <SelectTrigger className="h-9 w-40 text-xs">
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

          <div className="space-y-1">
            <Label className="text-[10px]">Valor</Label>
            <Input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              className="num h-9 w-28 text-xs"
            />
          </div>

          <label className="mb-2 flex cursor-pointer items-center gap-2 pb-1.5 text-xs">
            <Checkbox checked={recorrente} onCheckedChange={(v) => setRecorrente(v === true)} />
            Recorrente (repete todo mês)
          </label>

          <Button
            className="h-9 gap-1.5 bg-brand text-xs text-brand-foreground hover:bg-brand/90"
            onClick={salvar}
          >
            <Plus className="size-3.5" />
            Salvar lançamento
          </Button>
        </div>
        {recorrente && (
          <p className="border-t bg-muted/30 px-5 py-2 text-[11px] text-muted-foreground">
            Marcado como recorrente: vai aparecer em {rotuloCompetencia(competenciaForm)} e em
            todos os meses seguintes, sem fim definido — até alguém clicar em "Parar de repetir".
          </p>
        )}
      </Painel>

      <Painel
        titulo={`Lançamentos de ${rotuloCompetencia(competencia)}`}
        descricao={
          doMes.length > 0
            ? `${formatBRL(totalReceitas)} em receitas · ${formatBRL(totalDespesas)} em despesas`
            : undefined
        }
      >
        {doMes.length === 0 ? (
          <LinhaVazia texto="Nenhum lançamento neste mês ainda. Cadastre acima." />
        ) : (
          <div className="divide-y">
            {doMes.map((l) => (
              <LinhaLancamento
                key={l.id}
                lancamento={l}
                competencia={competencia}
                onExcluirNoMes={onExcluirNoMes}
                onPararRecorrencia={onPararRecorrencia}
              />
            ))}
          </div>
        )}
      </Painel>
    </div>
  );
}

function LinhaLancamento({
  lancamento,
  competencia,
  onExcluirNoMes,
  onPararRecorrencia,
}: {
  lancamento: Lancamento;
  competencia: string;
  onExcluirNoMes: (id: string, competencia: string) => void;
  onPararRecorrencia: (id: string, competencia: string) => void;
}) {
  const l = lancamento;
  const negativo = l.tipo === "despesa";

  const excluir = () => {
    onExcluirNoMes(l.id, competencia);
    toast.success("Lançamento removido deste mês", {
      description: l.recorrente
        ? "Os outros meses em que ele aparece continuam do jeito que estavam."
        : undefined,
    });
  };

  const pararRecorrencia = () => {
    onPararRecorrencia(l.id, competencia);
    toast.success(`Recorrência parada a partir de ${rotuloCompetencia(competencia)}`, {
      description: "Os meses anteriores a este continuam com o lançamento normalmente.",
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold">{l.categoria}</span>
          {l.recorrente && (
            <span className="inline-flex items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-[10px] font-medium text-info">
              <Repeat className="size-2.5" />
              Recorrente
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-muted-foreground">{l.descricao}</p>
      </div>

      <span className={cn("num text-sm font-semibold", negativo ? "text-loss" : "text-profit")}>
        {negativo ? "− " : "+ "}
        {formatBRL(l.valor)}
      </span>

      <div className="flex items-center gap-1">
        {l.recorrente && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 px-2 text-[11px]"
            onClick={pararRecorrencia}
            title="Para a repetição a partir deste mês — os meses anteriores não mudam"
          >
            Parar de repetir
          </Button>
        )}
        <button
          onClick={excluir}
          className="text-muted-foreground transition-colors hover:text-loss"
          aria-label={`Excluir lançamento ${l.descricao} deste mês`}
          title="Excluir só este mês"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
