// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Loader2,
  MessageCircle,
  Save,
  Sparkles,
  Target,
  Wand2,
  X,
} from "lucide-react";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getMarketplace } from "@/data/mock";
import {
  corDaNota,
  LIMITES_TITULO_PADRAO,
  limiteTitulo,
  notaDoAnuncio,
  PALAVRAS_PROIBIDAS_CANAL,
  palavrasProibidasNoTexto,
} from "@/lib/criativo";
import { cn } from "@/lib/utils";
import type { RascunhoCriativo } from "@/services";
import type {
  Anuncio,
  ConfiguracaoCriativo,
  MarketplaceId,
  StatusSugestao,
  SugestaoCriativo,
} from "@/types";
import type { AlvoFicha } from "./ModalFicha";

type AbaCriativo = "operacao" | "fichas" | "regras" | "historico";

const COR_NOTA = {
  profit: "bg-profit-soft text-profit",
  warning: "bg-warning-soft text-warning",
  loss: "bg-loss-soft text-loss",
} as const;

/**
 * O painel Criativo. Quatro abas:
 * - Operação: anúncios esperando conteúdo novo, com a nota do anúncio
 *   atual, o motivo (quando veio do SAC ou do Ads) e 3 opções de título;
 * - Fichas: a descrição completa de cada produto (a mesma que o SAC usa);
 * - Regras: limite de título por canal e palavras proibidas;
 * - Histórico: o que já foi aprovado ou descartado.
 * A IA só roda quando o seller clica em "Gerar conteúdo" — nunca sozinha.
 */
export function PainelCriativo({
  sugestoes,
  carregando,
  gerandoId,
  rascunhos,
  aoMudarRascunho,
  aoGerar,
  aoDecidir,
  fichas,
  produtos,
  aoAbrirFicha,
  config,
  aoSalvarConfig,
  buscarAnuncio,
  repetidasPorSku,
}: {
  sugestoes: SugestaoCriativo[];
  carregando: boolean;
  gerandoId: string | null;
  rascunhos: Record<string, RascunhoCriativo>;
  aoMudarRascunho: (id: string, campo: keyof RascunhoCriativo, texto: string) => void;
  aoGerar: (s: SugestaoCriativo) => void;
  aoDecidir: (s: SugestaoCriativo, status: Extract<StatusSugestao, "aprovada" | "recusada">) => void;
  /** SKU → ficha do produto */
  fichas: Map<string, string>;
  /** Produtos do catálogo (um por SKU), pra aba Fichas */
  produtos: AlvoFicha[];
  aoAbrirFicha: (alvo: AlvoFicha) => void;
  config: ConfiguracaoCriativo;
  aoSalvarConfig: (c: ConfiguracaoCriativo) => Promise<boolean>;
  buscarAnuncio: (id: string | null) => Anuncio | null;
  /** SKU → quantos assuntos os clientes perguntam repetido no SAC */
  repetidasPorSku: Map<string, number>;
}) {
  const [aba, setAba] = useState<AbaCriativo>("operacao");
  const pendentes = sugestoes.filter((s) => s.status === "pendente");
  const decididos = sugestoes.filter((s) => s.status !== "pendente");
  const comFicha = produtos.filter((p) => fichas.has(p.sku)).length;

  const abas: [AbaCriativo, string][] = [
    ["operacao", `Operação (${pendentes.length})`],
    ["fichas", `Fichas (${comFicha} de ${produtos.length})`],
    ["regras", "Regras"],
    ["historico", `Histórico (${decididos.length})`],
  ];

  return (
    <Painel
      titulo="Criativo"
      descricao="Título, descrição, palavras-chave e bullet points — gerados quando você pedir"
    >
      <div className="flex flex-wrap items-center gap-3 border-b bg-muted/30 px-4 py-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Wand2 className="size-4" />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-semibold">Agente Criativo</p>
          <p className="text-[10px] text-muted-foreground">
            Escreve o conteúdo do anúncio; publicar ainda é manual até a API conectar
          </p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-profit-soft px-2.5 py-1 text-[10px] font-semibold text-profit">
          <span className="size-1.5 rounded-full bg-profit" />
          Ativo
        </span>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b px-4 pt-3">
        {abas.map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              "shrink-0 rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
              aba === id
                ? "border-b-2 border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {(aba === "operacao" || aba === "historico") && (
        <div className="divide-y">
          {carregando && (
            <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Carregando sugestões...
            </div>
          )}

          {!carregando &&
            (aba === "operacao" ? pendentes : decididos).map((s) => (
              <CardSugestaoCriativo
                key={s.id}
                sugestao={s}
                gerando={gerandoId === s.id}
                rascunho={
                  rascunhos[s.id] ?? {
                    titulo: s.tituloSugerido ?? "",
                    descricao: s.descricaoSugerida ?? "",
                    palavrasChave: s.palavrasChave ?? "",
                    bulletPoints: s.bulletPoints ?? "",
                  }
                }
                aoMudarRascunho={(campo, texto) => aoMudarRascunho(s.id, campo, texto)}
                aoGerar={() => aoGerar(s)}
                aoDecidir={(status) => aoDecidir(s, status)}
                ficha={fichas.get(s.sku) ?? null}
                aoAbrirFicha={() => aoAbrirFicha({ sku: s.sku, produto: s.produto })}
                config={config}
                anuncio={buscarAnuncio(s.anuncioId)}
                perguntasRepetidas={repetidasPorSku.get(s.sku) ?? 0}
              />
            ))}

          {!carregando && (aba === "operacao" ? pendentes : decididos).length === 0 && (
            <div className="px-4 py-10 text-center">
              <p className="text-xs text-muted-foreground">
                {aba === "operacao"
                  ? "Nenhum anúncio esperando conteúdo agora. Quando o SAC ou o Ads mandarem algum, ele aparece aqui."
                  : "Nenhuma decisão registrada ainda."}
              </p>
            </div>
          )}
        </div>
      )}

      {aba === "fichas" && (
        <AbaFichas produtos={produtos} fichas={fichas} aoAbrirFicha={aoAbrirFicha} />
      )}

      {aba === "regras" && <AbaRegras config={config} aoSalvar={aoSalvarConfig} />}

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        Publicar direto no marketplace ainda depende da API de escrita — por enquanto,
        aprovar só marca como pronto pra você copiar e colar.
      </div>
    </Painel>
  );
}

/* ------------------------------------------------------------------ */
/* Card de uma sugestão                                                */
/* ------------------------------------------------------------------ */

function CardSugestaoCriativo({
  sugestao,
  gerando,
  rascunho,
  aoMudarRascunho,
  aoGerar,
  aoDecidir,
  ficha,
  aoAbrirFicha,
  config,
  anuncio,
  perguntasRepetidas,
}: {
  sugestao: SugestaoCriativo;
  gerando: boolean;
  rascunho: RascunhoCriativo;
  aoMudarRascunho: (campo: keyof RascunhoCriativo, texto: string) => void;
  aoGerar: () => void;
  aoDecidir: (status: Extract<StatusSugestao, "aprovada" | "recusada">) => void;
  ficha: string | null;
  aoAbrirFicha: () => void;
  config: ConfiguracaoCriativo;
  anuncio: Anuncio | null;
  perguntasRepetidas: number;
}) {
  const [verNota, setVerNota] = useState(false);
  const temConteudo = sugestao.tituloSugerido !== null;
  const decidido = sugestao.status !== "pendente";
  const limite = limiteTitulo(config, sugestao.marketplaceId);

  // Sem API, o "título atual" que o NEXO conhece é o nome do anúncio.
  const tituloAtual = anuncio?.produto ?? sugestao.produto;
  const nota = useMemo(
    () =>
      notaDoAnuncio({
        titulo: tituloAtual,
        marketplaceId: sugestao.marketplaceId,
        config,
        temFicha: ficha !== null,
        anuncio,
        perguntasRepetidas,
      }),
    [tituloAtual, sugestao.marketplaceId, config, ficha, anuncio, perguntasRepetidas],
  );

  // Palavras proibidas no conteúdo novo: as do canal valem pro título; as
  // do seller valem pra tudo.
  const proibidasTitulo = palavrasProibidasNoTexto(rascunho.titulo, config);
  const proibidasResto = palavrasProibidasNoTexto(
    [rascunho.descricao, rascunho.palavrasChave, rascunho.bulletPoints].join("\n"),
    config,
    false,
  );
  const proibidas = [...new Set([...proibidasTitulo, ...proibidasResto])];
  const tituloPassou = rascunho.titulo.trim().length > limite;

  return (
    <div className="px-4 py-4">
      <div className="flex gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Wand2 className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SeloMarketplace id={sugestao.marketplaceId} />
            <span className="truncate text-xs font-medium">{sugestao.produto}</span>
            <span className="num text-[10px] text-muted-foreground">{sugestao.sku}</span>
            {sugestao.origem === "sac" && (
              <span className="inline-flex items-center gap-1 rounded bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                <MessageCircle className="size-3" />
                Veio do SAC
              </span>
            )}
            {sugestao.origem === "ads" && (
              <span className="inline-flex items-center gap-1 rounded bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">
                <Target className="size-3" />
                Veio do Ads
              </span>
            )}
            {decidido && (
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-semibold",
                  sugestao.status === "aprovada"
                    ? "bg-profit-soft text-profit"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {sugestao.status === "aprovada" ? "aprovado" : "descartado"}
              </span>
            )}
          </div>

          {sugestao.origem !== "exemplo" && sugestao.motivo && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
              <strong className="text-foreground">Por que chegou aqui: </strong>
              {sugestao.motivo}
            </p>
          )}

          {/* Nota do anúncio como está hoje */}
          {!decidido && (
            <div className="rounded-md border">
              <button
                onClick={() => setVerNota((v) => !v)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left"
              >
                <span
                  className={cn(
                    "num rounded-md px-2 py-1 text-sm font-bold",
                    COR_NOTA[corDaNota(nota.nota)],
                  )}
                >
                  {nota.nota.toFixed(1).replace(".", ",")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold">Nota do anúncio atual</span>
                  <span className="block truncate text-[10px] text-muted-foreground">
                    Título de hoje: "{tituloAtual}"
                  </span>
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {verNota ? "esconder" : "ver o porquê"}
                </span>
                {verNota ? (
                  <ChevronUp className="size-3.5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                )}
              </button>
              {verNota && (
                <ul className="space-y-1.5 border-t px-3 py-2">
                  {nota.itens.map((item) => (
                    <li key={item.texto} className="flex items-start gap-2 text-[11px]">
                      {item.ok === true && <Check className="mt-0.5 size-3 shrink-0 text-profit" />}
                      {item.ok === false && <X className="mt-0.5 size-3 shrink-0 text-loss" />}
                      {item.ok === null && (
                        <span className="mt-0.5 size-3 shrink-0 text-center text-muted-foreground">
                          –
                        </span>
                      )}
                      <span className={item.ok === null ? "text-muted-foreground" : ""}>
                        {item.texto}
                      </span>
                    </li>
                  ))}
                  <li className="pt-1 text-[10px] text-muted-foreground">
                    Sem a API, o NEXO ainda não lê a descrição publicada — a nota olha o título, a
                    ficha, a conversão do Ads e as perguntas do SAC.
                  </li>
                </ul>
              )}
            </div>
          )}

          {/* Ficha do produto */}
          {!decidido && (
            <div
              className={cn(
                "flex flex-wrap items-center gap-2 rounded-md px-3 py-2 text-xs",
                ficha ? "bg-muted/40" : "bg-warning-soft",
              )}
            >
              <FileText className={cn("size-3.5", ficha ? "text-muted-foreground" : "text-warning")} />
              <span className="min-w-0 flex-1">
                {ficha
                  ? "A IA vai escrever com base na ficha do produto."
                  : "Sem ficha do produto: a IA não sabe as características e o texto sai genérico."}
              </span>
              <Button size="sm" variant="outline" onClick={aoAbrirFicha} className="h-7 text-[11px]">
                {ficha ? "Ver ficha" : "Adicionar ficha"}
              </Button>
            </div>
          )}

          {!temConteudo ? (
            !decidido && (
              <Button size="sm" variant="outline" onClick={aoGerar} disabled={gerando}>
                {gerando ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {gerando ? "Gerando..." : "Gerar conteúdo com IA"}
              </Button>
            )
          ) : (
            <div className="space-y-3">
              {/* As 3 opções de título */}
              {!decidido && sugestao.titulosAlternativos && sugestao.titulosAlternativos.length > 1 && (
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                    Opções de título — clique pra usar
                  </p>
                  <div className="mt-1 space-y-1">
                    {sugestao.titulosAlternativos.map((t, i) => {
                      const escolhido = rascunho.titulo === t;
                      const passou = t.length > limite;
                      return (
                        <button
                          key={`${i}-${t}`}
                          onClick={() => aoMudarRascunho("titulo", t)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                            escolhido ? "border-brand bg-brand/5" : "hover:bg-muted/50",
                          )}
                        >
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded-full border text-[9px] font-bold",
                              escolhido && "border-brand bg-brand text-white",
                            )}
                          >
                            {i + 1}
                          </span>
                          <span className="min-w-0 flex-1">{t}</span>
                          {i === 0 && (
                            <span className="shrink-0 text-[10px] text-muted-foreground">
                              recomendado
                            </span>
                          )}
                          <span
                            className={cn(
                              "num shrink-0 text-[10px]",
                              passou ? "font-semibold text-loss" : "text-muted-foreground",
                            )}
                          >
                            {t.length}/{limite}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                    Título sugerido
                  </p>
                  {!decidido && (
                    <p
                      className={cn(
                        "num text-[10px]",
                        tituloPassou ? "font-semibold text-loss" : "text-muted-foreground",
                      )}
                    >
                      {rascunho.titulo.trim().length} de {limite} caracteres (
                      {getMarketplace(sugestao.marketplaceId).nome})
                    </p>
                  )}
                </div>
                {decidido ? (
                  <p className="mt-0.5 text-xs">{rascunho.titulo}</p>
                ) : (
                  <input
                    value={rascunho.titulo}
                    onChange={(e) => aoMudarRascunho("titulo", e.target.value)}
                    className={cn(
                      "mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs",
                      tituloPassou && "border-loss",
                    )}
                  />
                )}
              </div>

              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  Descrição
                </p>
                {decidido ? (
                  <p className="mt-0.5 whitespace-pre-line text-xs">{rascunho.descricao}</p>
                ) : (
                  <Textarea
                    value={rascunho.descricao}
                    onChange={(e) => aoMudarRascunho("descricao", e.target.value)}
                    className="mt-1 min-h-36 text-xs"
                  />
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                    Palavras-chave
                  </p>
                  {decidido ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {rascunho.palavrasChave}
                    </p>
                  ) : (
                    <Textarea
                      value={rascunho.palavrasChave}
                      onChange={(e) => aoMudarRascunho("palavrasChave", e.target.value)}
                      className="mt-1 min-h-28 text-xs"
                    />
                  )}
                </div>
                <div>
                  <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                    Bullet points
                  </p>
                  {decidido ? (
                    <p className="mt-0.5 whitespace-pre-line text-xs">{rascunho.bulletPoints}</p>
                  ) : (
                    <Textarea
                      value={rascunho.bulletPoints}
                      onChange={(e) => aoMudarRascunho("bulletPoints", e.target.value)}
                      className="mt-1 min-h-28 text-xs"
                    />
                  )}
                </div>
              </div>

              {!decidido && (tituloPassou || proibidas.length > 0) && (
                <div className="flex items-start gap-2 rounded-md bg-loss-soft px-3 py-2 text-[11px] text-loss">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <div className="space-y-0.5">
                    {tituloPassou && (
                      <p>
                        O título passa do limite de {limite} caracteres do{" "}
                        {getMarketplace(sugestao.marketplaceId).nome} — o canal corta ou recusa.
                      </p>
                    )}
                    {proibidas.length > 0 && (
                      <p>
                        Palavra proibida no texto: {proibidas.map((p) => `"${p}"`).join(", ")}.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {!decidido && (
                <div className="flex flex-wrap gap-2 pt-1">
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
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aba Fichas                                                          */
/* ------------------------------------------------------------------ */

function AbaFichas({
  produtos,
  fichas,
  aoAbrirFicha,
}: {
  produtos: AlvoFicha[];
  fichas: Map<string, string>;
  aoAbrirFicha: (alvo: AlvoFicha) => void;
}) {
  // Quem ainda não tem ficha aparece primeiro — é o que falta fazer.
  const ordenados = [...produtos].sort(
    (a, b) => Number(fichas.has(a.sku)) - Number(fichas.has(b.sku)),
  );

  return (
    <div>
      <p className="border-b px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        A ficha é a descrição completa do produto, uma por SKU. O SAC usa pra responder cliente sem
        inventar, e o Criativo pra escrever o anúncio. Quando a API conectar, o NEXO passa a ler a
        descrição direto do anúncio publicado.
      </p>
      <div className="divide-y">
        {ordenados.map((p) => {
          const ficha = fichas.get(p.sku);
          return (
            <div key={p.sku} className="flex items-center gap-3 px-4 py-3">
              <FileText
                className={cn("size-4 shrink-0", ficha ? "text-profit" : "text-muted-foreground")}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs font-medium">
                  {p.produto}
                  <span className="num text-[10px] font-normal text-muted-foreground">{p.sku}</span>
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {ficha ? ficha : "Sem ficha ainda"}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold",
                  ficha ? "bg-profit-soft text-profit" : "bg-warning-soft text-warning",
                )}
              >
                {ficha ? "Com ficha" : "Sem ficha"}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 text-[11px]"
                onClick={() => aoAbrirFicha(p)}
              >
                {ficha ? "Editar" : "Adicionar"}
              </Button>
            </div>
          );
        })}
        {produtos.length === 0 && (
          <p className="px-4 py-10 text-center text-xs text-muted-foreground">
            Nenhum produto com anúncio ainda.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Aba Regras                                                          */
/* ------------------------------------------------------------------ */

function AbaRegras({
  config,
  aoSalvar,
}: {
  config: ConfiguracaoCriativo;
  aoSalvar: (c: ConfiguracaoCriativo) => Promise<boolean>;
}) {
  const [rascunho, setRascunho] = useState<ConfiguracaoCriativo>(config);
  const [salvando, setSalvando] = useState(false);

  // Se a config chegar do banco depois de a aba abrir, mostra a salva.
  useEffect(() => setRascunho(config), [config]);

  const canais = Object.keys(LIMITES_TITULO_PADRAO) as MarketplaceId[];

  const salvar = async () => {
    setSalvando(true);
    await aoSalvar(rascunho);
    setSalvando(false);
  };

  return (
    <div className="space-y-5 px-4 py-4">
      <div>
        <p className="text-xs font-semibold">Limite de caracteres do título</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          A IA escreve dentro desse limite e a tela avisa se um título passar. Os canais mudam essa
          regra de vez em quando — se o seu painel mostrar outro número, corrija aqui.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {canais.map((id) => (
            <label key={id} className="flex items-center gap-2 rounded-md border px-3 py-2">
              <SeloMarketplace id={id} />
              <Input
                type="number"
                min={20}
                max={300}
                value={rascunho.limitesTitulo[id]}
                onChange={(e) =>
                  setRascunho((atual) => ({
                    ...atual,
                    limitesTitulo: { ...atual.limitesTitulo, [id]: Number(e.target.value) || 0 },
                  }))
                }
                className="num ml-auto h-8 w-20 text-right text-xs"
              />
              <span className="text-[10px] text-muted-foreground">caract.</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold">Palavras que você não quer nos anúncios</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          Uma por linha. Quem avisa é você: marca de outra empresa, termo que o canal já recusou, algo
          que não combina com a loja. A IA não usa e a tela avisa se aparecer.
        </p>
        <Textarea
          value={rascunho.palavrasProibidas}
          onChange={(e) => setRascunho((atual) => ({ ...atual, palavrasProibidas: e.target.value }))}
          placeholder={"Ex.:\noriginal\nréplica\nmelhor do Brasil"}
          className="mt-2 min-h-28 text-xs"
        />
        <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          Já bloqueadas sempre no título, por regra dos canais:{" "}
          {PALAVRAS_PROIBIDAS_CANAL.join(", ")}.
        </p>
      </div>

      <Button size="sm" onClick={salvar} disabled={salvando} className="text-xs">
        {salvando ? (
          <Loader2 className="mr-1.5 size-3.5 animate-spin" />
        ) : (
          <Save className="mr-1.5 size-3.5" />
        )}
        Salvar regras
      </Button>
    </div>
  );
}
