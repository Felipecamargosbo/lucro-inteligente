// Parte da tela de Agentes (src/routes/agentes.tsx). Cada agente tem o seu
// próprio arquivo aqui, pra poder mexer em um sem tocar nos outros.

import { useState } from "react";
import {
  Check,
  Loader2,
  Sparkles,
  Wand2,
  X,
} from "lucide-react";
import { Painel, SeloMarketplace } from "@/components/comum/Indicadores";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { StatusSugestao, SugestaoCriativo } from "@/types";
import type { Aba } from "./comum";

/**
 * O painel Criativo: título, descrição, palavras-chave e bullet points
 * — os quatro nascem juntos, na mesma chamada. Igual o SAC, tem um
 * passo intermediário ("Gerar conteúdo") porque é aqui que sai custo de
 * token de verdade — nunca automático.
 */
export function PainelCriativo({
  sugestoes,
  carregando,
  gerandoId,
  rascunhos,
  aoMudarRascunho,
  aoGerar,
  aoDecidir,
}: {
  sugestoes: SugestaoCriativo[];
  carregando: boolean;
  gerandoId: string | null;
  rascunhos: Record<
    string,
    { titulo: string; descricao: string; palavrasChave: string; bulletPoints: string }
  >;
  aoMudarRascunho: (
    id: string,
    campo: "titulo" | "descricao" | "palavrasChave" | "bulletPoints",
    texto: string,
  ) => void;
  aoGerar: (s: SugestaoCriativo) => void;
  aoDecidir: (s: SugestaoCriativo, status: Extract<StatusSugestao, "aprovada" | "recusada">) => void;
}) {
  const [aba, setAba] = useState<Aba>("operacao");
  const pendentes = sugestoes.filter((s) => s.status === "pendente");
  const decididos = sugestoes.filter((s) => s.status !== "pendente");
  const lista = aba === "operacao" ? pendentes : decididos;

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

      <div className="flex gap-1 border-b px-4 pt-3">
        {(
          [
            ["operacao", `Operação (${pendentes.length})`],
            ["historico", `Histórico (${decididos.length})`],
          ] as const
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={cn(
              "rounded-t-md px-3 py-2 text-xs font-semibold transition-colors",
              aba === id
                ? "border-b-2 border-brand text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="divide-y">
        {carregando && (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Carregando sugestões...
          </div>
        )}

        {!carregando &&
          lista.map((s) => (
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
            />
          ))}

        {!carregando && lista.length === 0 && (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-muted-foreground">
              {aba === "operacao"
                ? "Nenhuma sugestão pendente agora."
                : "Nenhuma decisão registrada ainda."}
            </p>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-3 text-[10px] leading-relaxed text-muted-foreground">
        Publicar direto no marketplace ainda depende da API de escrita — por enquanto,
        aprovar só marca como pronto pra você copiar e colar.
      </div>
    </Painel>
  );
}

function CardSugestaoCriativo({
  sugestao,
  gerando,
  rascunho,
  aoMudarRascunho,
  aoGerar,
  aoDecidir,
}: {
  sugestao: SugestaoCriativo;
  gerando: boolean;
  rascunho: { titulo: string; descricao: string; palavrasChave: string; bulletPoints: string };
  aoMudarRascunho: (
    campo: "titulo" | "descricao" | "palavrasChave" | "bulletPoints",
    texto: string,
  ) => void;
  aoGerar: () => void;
  aoDecidir: (status: Extract<StatusSugestao, "aprovada" | "recusada">) => void;
}) {
  const temConteudo = sugestao.tituloSugerido !== null;
  const decidido = sugestao.status !== "pendente";

  return (
    <div className="px-4 py-4">
      <div className="flex gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-brand">
          <Wand2 className="size-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeloMarketplace id={sugestao.marketplaceId} />
            <span className="truncate text-xs font-medium">{sugestao.produto}</span>
            <span className="num text-[10px] text-muted-foreground">{sugestao.sku}</span>
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

          {!temConteudo ? (
            <div className="mt-3">
              <Button size="sm" variant="outline" onClick={aoGerar} disabled={gerando}>
                {gerando ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                {gerando ? "Gerando..." : "Gerar conteúdo com IA"}
              </Button>
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div>
                <p className="text-[9px] uppercase tracking-wide text-muted-foreground">
                  Título sugerido
                </p>
                {decidido ? (
                  <p className="mt-0.5 text-xs">{rascunho.titulo}</p>
                ) : (
                  <input
                    value={rascunho.titulo}
                    onChange={(e) => aoMudarRascunho("titulo", e.target.value)}
                    className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-xs"
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

              {!decidido && (
                <div className="flex gap-2 pt-1">
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
