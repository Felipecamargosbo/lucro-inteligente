import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Building2,
  History,
  Percent,
  Plug,
  Plus,
  Receipt,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useConfiguracoes } from "@/context/configuracoes";
import { marketplacesService, logsService } from "@/services";
import { formatBRL, formatData, formatDataHora, formatPercentual } from "@/lib/format";
import { Painel } from "@/components/comum/Indicadores";
import { LogoMarketplace } from "@/components/comum/LogoMarketplace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { CustoOperacional, DadosEmpresa, RegimeTributario } from "@/types";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações | NEXO Rentabilidade" },
      {
        name: "description",
        content:
          "Defina os dados da empresa, o regime tributário, as metas de margem e os custos operacionais que entram no cálculo do lucro real.",
      },
      { property: "og:title", content: "Configurações | NEXO Rentabilidade" },
      {
        property: "og:description",
        content: "Empresa, regime tributário, metas de margem e custos operacionais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Configuracoes,
});

const ABAS = [
  { id: "empresa", titulo: "Empresa", Icone: Building2 },
  { id: "fiscal", titulo: "Fiscal", Icone: Receipt },
  { id: "margens", titulo: "Margens e custos", Icone: Percent },
  { id: "integracoes", titulo: "Integrações", Icone: Plug },
  { id: "historico", titulo: "Histórico", Icone: History },
] as const;

type AbaId = (typeof ABAS)[number]["id"];

const REGIMES: { id: RegimeTributario; rotulo: string; nota: string }[] = [
  {
    id: "simples-nacional",
    rotulo: "Simples Nacional",
    nota: "Alíquota única sobre o faturamento, conforme a faixa do seu anexo.",
  },
  {
    id: "lucro-presumido",
    rotulo: "Lucro Presumido",
    nota: "PIS, COFINS, IRPJ e CSLL calculados sobre presunção de lucro.",
  },
  {
    id: "lucro-real",
    rotulo: "Lucro Real",
    nota: "Tributos sobre o lucro efetivo apurado.",
  },
];

/* ------------------------------------------------------------------ */
/* Campo reutilizável                                                 */
/* ------------------------------------------------------------------ */

function Campo({
  id,
  rotulo,
  valor,
  onChange,
  tipo = "text",
  dica,
}: {
  id: string;
  rotulo: string;
  valor: string;
  onChange: (v: string) => void;
  tipo?: string;
  dica?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {rotulo}
      </Label>
      <Input
        id={id}
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className={cn("h-9 text-xs", tipo === "number" && "num")}
      />
      {dica && <p className="text-[10px] text-muted-foreground">{dica}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aba: Empresa                                                       */
/* ------------------------------------------------------------------ */

function AbaEmpresa() {
  const { empresa, salvarEmpresa } = useConfiguracoes();
  const [form, setForm] = useState<DadosEmpresa>(empresa);

  const campo = (chave: keyof DadosEmpresa) => (v: string) =>
    setForm((f) => ({ ...f, [chave]: v }));

  return (
    <div className="space-y-5">
      <Painel titulo="Dados da empresa" descricao="Usados nos documentos e relatórios">
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <Campo id="nome" rotulo="Razão social" valor={form.nome} onChange={campo("nome")} />
          <Campo
            id="fantasia"
            rotulo="Nome fantasia"
            valor={form.nomeFantasia}
            onChange={campo("nomeFantasia")}
          />
          <Campo id="cnpj" rotulo="CNPJ" valor={form.cnpj} onChange={campo("cnpj")} />
          <Campo
            id="email"
            rotulo="E-mail principal"
            tipo="email"
            valor={form.email}
            onChange={campo("email")}
          />
          <Campo
            id="telefone"
            rotulo="Telefone"
            valor={form.telefone}
            onChange={campo("telefone")}
          />
        </div>
      </Painel>

      <Painel titulo="Endereço" descricao="Usado em documentos fiscais e etiquetas de envio">
        <div className="grid gap-4 p-5 sm:grid-cols-6">
          <div className="sm:col-span-2">
            <Campo id="cep" rotulo="CEP" valor={form.cep} onChange={campo("cep")} />
          </div>
          <div className="sm:col-span-3">
            <Campo id="rua" rotulo="Rua / Avenida" valor={form.rua} onChange={campo("rua")} />
          </div>
          <div className="sm:col-span-1">
            <Campo id="numero" rotulo="Número" valor={form.numero} onChange={campo("numero")} />
          </div>
          <div className="sm:col-span-3">
            <Campo
              id="complemento"
              rotulo="Complemento"
              valor={form.complemento}
              onChange={campo("complemento")}
            />
          </div>
          <div className="sm:col-span-3">
            <Campo id="bairro" rotulo="Bairro" valor={form.bairro} onChange={campo("bairro")} />
          </div>
          <div className="sm:col-span-4">
            <Campo id="cidade" rotulo="Cidade" valor={form.cidade} onChange={campo("cidade")} />
          </div>
          <div className="sm:col-span-2">
            <Campo
              id="estado"
              rotulo="Estado (UF)"
              valor={form.estado}
              onChange={(v) => campo("estado")(v.toUpperCase().slice(0, 2))}
            />
          </div>
        </div>
      </Painel>

      <Painel
        titulo="Fornecedor padrão"
        descricao="Para onde saem as cotações de reposição de estoque"
      >
        <div className="p-5 sm:max-w-md">
          <Campo
            id="email-fornecedor"
            rotulo="E-mail do fornecedor"
            tipo="email"
            valor={form.emailFornecedor}
            onChange={campo("emailFornecedor")}
            dica="Preenchido automaticamente no modal de reposição em Estoque e Fulfillment."
          />
        </div>
      </Painel>

      <div className="flex justify-end">
        <Button
          className="bg-brand text-brand-foreground hover:bg-brand/90"
          onClick={() => {
            salvarEmpresa(form);
            toast.success("Dados da empresa atualizados");
          }}
        >
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aba: Fiscal                                                        */
/* ------------------------------------------------------------------ */

function AbaFiscal() {
  const { fiscal, salvarFiscal } = useConfiguracoes();
  const [regime, setRegime] = useState(fiscal.regime);
  const [aliquota, setAliquota] = useState(String(fiscal.aliquota * 100));

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-xl bg-brand-soft px-4 py-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-brand" />
        <p className="text-[11px] leading-relaxed">
          Esta alíquota entra no cálculo de <strong>todo</strong> o sistema — Raio-X, dashboards e
          calculadora. Se estiver errada, todo lucro exibido está errado junto. Confirme com seu
          contador.
        </p>
      </div>

      <Painel titulo="Regime tributário" descricao="Define como o imposto incide sobre a venda">
        <div className="space-y-2 p-5">
          {REGIMES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRegime(r.id)}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors",
                regime === r.id ? "border-brand bg-brand-soft" : "hover:bg-muted/50",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 size-3.5 shrink-0 rounded-full border-2",
                  regime === r.id ? "border-brand bg-brand" : "border-muted-foreground/40",
                )}
              />
              <span className="min-w-0">
                <span className="block text-xs font-semibold">{r.rotulo}</span>
                <span className="block text-[11px] text-muted-foreground">{r.nota}</span>
              </span>
            </button>
          ))}
        </div>
      </Painel>

      <Painel titulo="Alíquota" descricao="Percentual aplicado sobre o faturamento bruto">
        <div className="p-5 sm:max-w-xs">
          <Campo
            id="aliquota"
            rotulo="Alíquota geral (%)"
            tipo="number"
            valor={aliquota}
            onChange={setAliquota}
            dica="Ex.: 10 para 10% sobre o valor da venda."
          />
        </div>
      </Painel>

      <div className="flex justify-end">
        <Button
          className="bg-brand text-brand-foreground hover:bg-brand/90"
          onClick={() => {
            salvarFiscal({ regime, aliquota: (Number(aliquota) || 0) / 100 });
            toast.success("Configuração fiscal atualizada", {
              description: "O cálculo de lucro de todo o sistema já reflete esta alíquota.",
            });
          }}
        >
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aba: Margens e custos                                              */
/* ------------------------------------------------------------------ */

function AbaMargens() {
  const {
    contas,
    metasPorConta,
    salvarMetas,
    custos,
    adicionarCusto,
    atualizarCusto,
    removerCusto,
  } = useConfiguracoes();

  const canais = marketplacesService.listar();
  const [novoNome, setNovoNome] = useState("");
  const [novoTipo, setNovoTipo] = useState<CustoOperacional["tipo"]>("fixo");
  const [novoValor, setNovoValor] = useState("");

  const criar = () => {
    const nome = novoNome.trim();
    if (!nome) {
      toast.error("Dê um nome ao custo", {
        description: "É esse nome que vai aparecer no Raio-X.",
      });
      return;
    }
    const bruto = Number(novoValor) || 0;
    adicionarCusto({
      nome,
      tipo: novoTipo,
      valor: novoTipo === "fixo" ? bruto : bruto / 100,
      ativo: true,
    });
    setNovoNome("");
    setNovoValor("");
    toast.success(`"${nome}" entrou no cálculo`, {
      description: "Já aparece na coluna de custos operacionais do Raio-X.",
    });
  };

  return (
    <div className="space-y-5">
      <Painel
        titulo="Metas de margem por conta"
        descricao="É o que define as cores do Raio-X: abaixo da mínima, entre mínima e ideal, ou saudável"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Conta</th>
                <th className="px-3 py-2 font-medium">Margem mínima (%)</th>
                <th className="px-3 py-2 font-medium">Margem ideal (%)</th>
              </tr>
            </thead>
            <tbody>
              {canais.map((canal) => {
                const contasDoCanal = contas.filter((c) => c.marketplaceId === canal.id);
                if (contasDoCanal.length === 0) return null;
                return (
                  <Fragment key={canal.id}>
                    <tr className="bg-muted/20">
                      <td colSpan={3} className="px-4 py-1.5">
                        <div className="flex items-center gap-2">
                          <LogoMarketplace id={canal.id} tamanho="xs" />
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                            {canal.nome}
                          </span>
                        </div>
                      </td>
                    </tr>
                    {contasDoCanal.map((c) => {
                      const metas = metasPorConta[c.id];
                      return (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5 pl-9">
                            <p className="text-xs font-medium">{c.nome}</p>
                            {!metas && (
                              <p className="text-[10px] text-muted-foreground">
                                Sem meta — só o prejuízo é sinalizado
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <Input
                              type="number"
                              step="0.5"
                              placeholder="—"
                              value={metas ? String(metas.margemMinima * 100) : ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "") return salvarMetas(c.id, null);
                                salvarMetas(c.id, {
                                  margemMinima: Number(v) / 100,
                                  margemIdeal: metas?.margemIdeal ?? Number(v) / 100,
                                });
                              }}
                              className="num h-8 w-24 text-xs"
                            />
                          </td>
                          <td className="px-3 py-2.5">
                            <Input
                              type="number"
                              step="0.5"
                              placeholder="—"
                              value={metas ? String(metas.margemIdeal * 100) : ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (v === "") return;
                                salvarMetas(c.id, {
                                  margemMinima: metas?.margemMinima ?? 0,
                                  margemIdeal: Number(v) / 100,
                                });
                              }}
                              className="num h-8 w-24 text-xs"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Painel>

      <Painel
        titulo="Custos operacionais"
        descricao="O que você gasta por venda e o marketplace não cobra — embalagem, fita, etiqueta"
      >
        <div className="space-y-3 p-5">
          {custos.length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              Nenhum custo cadastrado. Sem eles, o lucro exibido é lucro antes de embalar.
            </p>
          )}

          {custos.map((c) => (
            <div
              key={c.id}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-xl border p-3",
                !c.ativo && "opacity-50",
              )}
            >
              <Input
                value={c.nome}
                onChange={(e) => atualizarCusto(c.id, { nome: e.target.value })}
                className="h-8 w-44 text-xs"
                aria-label="Nome do custo"
              />

              <div className="flex overflow-hidden rounded-lg border">
                {(["fixo", "percentual"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => atualizarCusto(c.id, { tipo: t })}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-medium transition-colors",
                      c.tipo === t
                        ? "bg-brand text-brand-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {t === "fixo" ? "R$" : "%"}
                  </button>
                ))}
              </div>

              <Input
                type="number"
                step="0.01"
                value={c.tipo === "fixo" ? c.valor : c.valor * 100}
                onChange={(e) => {
                  const v = Number(e.target.value) || 0;
                  atualizarCusto(c.id, { valor: c.tipo === "fixo" ? v : v / 100 });
                }}
                className="num h-8 w-24 text-xs"
                aria-label="Valor do custo"
              />

              <span className="text-[11px] text-muted-foreground">
                {c.tipo === "fixo"
                  ? `${formatBRL(c.valor)} por unidade`
                  : `${formatPercentual(c.valor)} do preço`}
              </span>

              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => atualizarCusto(c.id, { ativo: !c.ativo })}
                  className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                >
                  {c.ativo ? "Desativar" : "Ativar"}
                </button>
                <button
                  onClick={() => {
                    removerCusto(c.id);
                    toast.success(`"${c.nome}" removido do cálculo`);
                  }}
                  className="text-muted-foreground transition-colors hover:text-loss"
                  aria-label={`Remover ${c.nome}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Novo custo */}
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-dashed p-3">
            <div className="space-y-1.5">
              <Label htmlFor="novo-custo" className="text-[10px]">
                Nome do custo
              </Label>
              <Input
                id="novo-custo"
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                placeholder="Ex.: Plástico bolha"
                className="h-8 w-44 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="block text-[10px]">Tipo</Label>
              <div className="flex overflow-hidden rounded-lg border">
                {(["fixo", "percentual"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setNovoTipo(t)}
                    className={cn(
                      "px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                      novoTipo === t
                        ? "bg-brand text-brand-foreground"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {t === "fixo" ? "R$" : "%"}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="novo-valor" className="text-[10px]">
                Valor
              </Label>
              <Input
                id="novo-valor"
                type="number"
                step="0.01"
                value={novoValor}
                onChange={(e) => setNovoValor(e.target.value)}
                className="num h-8 w-24 text-xs"
              />
            </div>

            <Button
              size="sm"
              onClick={criar}
              className="h-8 gap-1.5 bg-brand text-xs text-brand-foreground hover:bg-brand/90"
            >
              <Plus className="size-3.5" />
              Adicionar
            </Button>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Cada custo ativo entra na coluna <strong>Custos operacionais</strong> do Raio-X, com o
            nome que você deu, e é descontado do lucro real.
          </p>
        </div>
      </Painel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aba: Integrações                                                   */
/* ------------------------------------------------------------------ */

function AbaIntegracoes() {
  const canais = marketplacesService.listar();
  const { contas, atualizarConta } = useConfiguracoes();
  const [editando, setEditando] = useState<Record<string, string>>({});

  const salvarNome = (id: string, nomeAtual: string) => {
    const novoNome = (editando[id] ?? nomeAtual).trim();
    if (!novoNome || novoNome === nomeAtual) return;
    atualizarConta(id, { nome: novoNome });
    toast.success("Nome da conta atualizado");
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <p className="text-[11px] leading-relaxed">
          As chaves de API ainda <strong>não são armazenadas</strong>. Guardar credencial exige
          banco de dados e criptografia, que este sistema ainda não tem — e uma chave vazada dá
          acesso à sua conta de vendas. Até lá, esta tela mostra o estado das conexões e deixa
          você nomear cada conta.
        </p>
      </div>

      <Painel
        titulo="Contas conectadas"
        descricao="Um canal pode ter mais de uma conta — dê um nome a cada uma para identificá-las"
      >
        <div className="divide-y">
          {canais.map((canal) => {
            const contasDoCanal = contas.filter((c) => c.marketplaceId === canal.id);
            if (contasDoCanal.length === 0) return null;
            return (
              <div key={canal.id} className="px-5 py-4">
                <div className="mb-3 flex items-center gap-2.5">
                  <LogoMarketplace id={canal.id} tamanho="sm" />
                  <p className="text-xs font-semibold">{canal.nome}</p>
                  <span className="text-[10px] text-muted-foreground">
                    {contasDoCanal.length} conta{contasDoCanal.length > 1 ? "s" : ""}
                  </span>
                </div>

                <div className="space-y-2">
                  {contasDoCanal.map((c) => {
                    const cor =
                      c.statusConexao === "conectado"
                        ? "bg-profit-soft text-profit"
                        : c.statusConexao === "token-expirando"
                          ? "bg-warning-soft text-foreground"
                          : "bg-loss-soft text-loss";
                    const texto =
                      c.statusConexao === "conectado"
                        ? "Conectado"
                        : c.statusConexao === "token-expirando"
                          ? "Token expirando"
                          : "Desconectado";
                    return (
                      <div key={c.id} className="flex flex-wrap items-center gap-2 pl-1">
                        <Input
                          value={editando[c.id] ?? c.nome}
                          onChange={(e) =>
                            setEditando((atual) => ({ ...atual, [c.id]: e.target.value }))
                          }
                          onBlur={() => salvarNome(c.id, c.nome)}
                          className="h-8 w-52 text-xs"
                          aria-label={`Nome da conta ${c.nome}`}
                        />
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-[10px] font-semibold",
                            cor,
                          )}
                        >
                          {texto}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{c.cnpj}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Painel>

      <Painel titulo="ERP" descricao="Sincronização de produtos, custos e estoque">
        <div className="px-5 py-8 text-center">
          <p className="text-xs text-muted-foreground">
            Integração com ERPs (Bling, Tiny) ainda não disponível.
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            É por aqui que o custo dos produtos entrará automaticamente, resolvendo boa parte das
            pendências de &quot;sem custo cadastrado&quot;.
          </p>
        </div>
      </Painel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aba: Histórico                                                     */
/* ------------------------------------------------------------------ */

function AbaHistorico() {
  const logs = logsService.listar();
  const [dataFiltro, setDataFiltro] = useState("");

  // Datas que realmente têm alteração, para o seller saber onde procurar.
  const diasComAlteracao = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const l of logs) {
      const dia = l.data.slice(0, 10); // YYYY-MM-DD
      mapa.set(dia, (mapa.get(dia) ?? 0) + 1);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [logs]);

  const filtrados = dataFiltro
    ? logs.filter((l) => l.data.slice(0, 10) === dataFiltro)
    : logs;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <div className="space-y-1.5">
          <Label htmlFor="filtro-data" className="text-xs">
            Ver alterações de um dia
          </Label>
          <Input
            id="filtro-data"
            type="date"
            value={dataFiltro}
            onChange={(e) => setDataFiltro(e.target.value)}
            className="h-9 w-44 text-xs"
          />
        </div>

        {dataFiltro && (
          <Button
            variant="outline"
            size="sm"
            className="h-9 text-xs"
            onClick={() => setDataFiltro("")}
          >
            Limpar filtro
          </Button>
        )}

        <div className="min-w-0 flex-1">
          <p className="mb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Dias com alteração
          </p>
          <div className="flex flex-wrap gap-1.5">
            {diasComAlteracao.map(([dia, qtd]) => (
              <button
                key={dia}
                onClick={() => setDataFiltro(dia === dataFiltro ? "" : dia)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  dataFiltro === dia
                    ? "border-brand bg-brand-soft text-brand"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {formatData(dia)} ({qtd})
              </button>
            ))}
          </div>
        </div>
      </div>

      <Painel
        titulo="Histórico de alterações"
        descricao="Quando a margem cair, a primeira pergunta é o que mudou e quando"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left">
            <thead className="border-b bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Quando</th>
                <th className="px-3 py-2 font-medium">Alteração</th>
                <th className="px-3 py-2 text-right font-medium">De</th>
                <th className="px-3 py-2 text-right font-medium">Para</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((l) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-[11px] text-muted-foreground">
                    {formatDataHora(l.data)}
                  </td>
                  <td className="px-3 py-3 text-xs">{l.acao}</td>
                  <td className="num whitespace-nowrap px-3 py-3 text-right text-[11px] text-muted-foreground line-through">
                    {l.valorAnterior}
                  </td>
                  <td className="num whitespace-nowrap px-3 py-3 text-right text-[11px] font-semibold">
                    {l.valorNovo}
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-xs text-muted-foreground">
                    {dataFiltro
                      ? "Nenhuma alteração nesta data."
                      : "Nenhuma alteração registrada."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Painel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Página                                                             */
/* ------------------------------------------------------------------ */

function Configuracoes() {
  const [aba, setAba] = useState<AbaId>("empresa");

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Abas laterais */}
        <nav className="flex gap-1 overflow-x-auto lg:w-52 lg:shrink-0 lg:flex-col lg:overflow-visible">
          {ABAS.map((a) => {
            const Icone = a.Icone;
            return (
              <button
                key={a.id}
                onClick={() => setAba(a.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors",
                  aba === a.id
                    ? "bg-brand-soft text-brand"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icone className="size-4 shrink-0" />
                {a.titulo}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {aba === "empresa" && <AbaEmpresa />}
          {aba === "fiscal" && <AbaFiscal />}
          {aba === "margens" && <AbaMargens />}
          {aba === "integracoes" && <AbaIntegracoes />}
          {aba === "historico" && <AbaHistorico />}
        </div>
      </div>
    </div>
  );
}
