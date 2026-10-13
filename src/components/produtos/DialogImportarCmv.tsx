import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatBRL, formatNumero } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Anuncio, Produto } from "@/types";

/**
 * Importar CMV por planilha.
 *
 * 1. "Baixar modelo": um Excel com a coluna A = SKU (já preenchida com os SKUs
 *    dos anúncios) e a coluna B = CMV (vazia, ou com o CMV atual quando o
 *    produto já existe). A coluna C traz o nome do anúncio só para o seller
 *    se achar — ela é ignorada na importação.
 * 2. O seller preenche o CMV e sobe o arquivo (.xlsx, .xls ou .csv).
 * 3. Mostra o resumo (novos, atualizados, linhas com problema) e só grava
 *    depois do "Importar". SKU que já tem produto só muda o CMV; SKU novo
 *    vira produto com o nome do anúncio.
 */

type Linha = { linha: number; sku: string; cmv: number | null; problema: string | null };

function lerCmv(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? Math.round(valor * 100) / 100 : null;
  let t = String(valor).replace(/R\$|\s/gi, "");
  if (!t) return null;
  // "1.234,56" -> 1234.56 ; "12,5" -> 12.5 ; "12.50" -> 12.5
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

export function DialogImportarCmv({
  anuncios,
  produtos,
  aoFechar,
  aoConcluir,
}: {
  anuncios: Anuncio[];
  produtos: Produto[];
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);

  // SKU -> nome do anúncio (o mais vendido daquele SKU)
  const nomePorSku = useMemo(() => {
    const m = new Map<string, { nome: string; vendidas: number }>();
    for (const a of anuncios) {
      if (!a.sku) continue;
      const atual = m.get(a.sku);
      if (!atual || a.unidadesVendidas > atual.vendidas) m.set(a.sku, { nome: a.produto, vendidas: a.unidadesVendidas });
    }
    return m;
  }, [anuncios]);
  const cmvPorSku = useMemo(() => new Map(produtos.map((p) => [p.sku, p.cmv])), [produtos]);

  const baixarModelo = async () => {
    try {
      const XLSX = await import("xlsx");
      const skus = [...new Set([...nomePorSku.keys(), ...produtos.map((p) => p.sku)])].sort();
      const dados: (string | number)[][] = [["SKU", "CMV", "Nome do anúncio (só referência)"]];
      for (const sku of skus) {
        const cmv = cmvPorSku.get(sku);
        dados.push([sku, cmv ? cmv : "", nomePorSku.get(sku)?.nome ?? produtos.find((p) => p.sku === sku)?.nome ?? ""]);
      }
      const aba = XLSX.utils.aoa_to_sheet(dados);
      aba["!cols"] = [{ wch: 22 }, { wch: 12 }, { wch: 60 }];
      const livro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(livro, aba, "CMV");
      XLSX.writeFile(livro, "modelo-cmv.xlsx");
      toast.success(`Modelo baixado com ${formatNumero(skus.length)} SKUs.`);
    } catch (e) {
      console.error(e);
      toast.error("Não consegui gerar o modelo. Tente de novo.");
    }
  };

  const lerArquivo = async (arquivo: File) => {
    setLendo(true);
    setNomeArquivo(arquivo.name);
    try {
      const XLSX = await import("xlsx");
      const livro = XLSX.read(await arquivo.arrayBuffer(), { type: "array" });
      const aba = livro.Sheets[livro.SheetNames[0]];
      const tabela = XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, blankrows: false, raw: true });
      // Acha as colunas pelo cabeçalho; sem cabeçalho, usa A = SKU e B = CMV.
      let iSku = 0;
      let iCmv = 1;
      let inicio = 0;
      const cab = (tabela[0] ?? []).map((c) => normalizar(String(c ?? "")));
      if (cab.some((c) => c === "SKU" || c === "CMV" || c.startsWith("CUSTO"))) {
        const s = cab.findIndex((c) => c === "SKU");
        const c = cab.findIndex((x) => x === "CMV" || x.startsWith("CUSTO"));
        if (s >= 0) iSku = s;
        if (c >= 0) iCmv = c;
        inicio = 1;
      }
      const vistas = new Map<string, number>();
      const saida: Linha[] = [];
      for (let i = inicio; i < tabela.length; i++) {
        const r = tabela[i] ?? [];
        const sku = String(r[iSku] ?? "").trim();
        const bruto = r[iCmv];
        if (!sku && (bruto === undefined || bruto === "")) continue;
        const cmv = lerCmv(bruto);
        let problema: string | null = null;
        if (!sku) problema = "SKU vazio";
        else if (bruto === undefined || bruto === "") problema = "CMV vazio";
        else if (cmv === null) problema = "CMV não é número";
        else if (cmv < 0) problema = "CMV negativo";
        else if (vistas.has(sku)) problema = `SKU repetido (linha ${vistas.get(sku)})`;
        if (sku && !vistas.has(sku)) vistas.set(sku, i + 1);
        saida.push({ linha: i + 1, sku, cmv, problema });
      }
      setLinhas(saida);
    } catch (e) {
      console.error(e);
      toast.error("Não consegui ler o arquivo. Use o modelo em Excel (.xlsx) ou um .csv.");
      setLinhas(null);
    } finally {
      setLendo(false);
    }
  };

  const validas = (linhas ?? []).filter((l) => !l.problema);
  const comProblema = (linhas ?? []).filter((l) => l.problema);
  const novos = validas.filter((l) => !cmvPorSku.has(l.sku));
  const atualizados = validas.filter((l) => cmvPorSku.has(l.sku));
  const semAnuncio = novos.filter((l) => !nomePorSku.has(l.sku));

  const importar = async () => {
    if (!validas.length) return;
    setGravando(true);
    const itens = validas.map((l) => ({ sku: l.sku, cmv: l.cmv, nome: nomePorSku.get(l.sku)?.nome ?? null }));
    const { data, error } = await supabase.rpc("importar_cmv" as never, { itens } as never);
    setGravando(false);
    if (error) {
      console.error("importar_cmv:", error);
      toast.error("Não consegui importar. Nada foi alterado. Tente de novo.");
      return;
    }
    const r = (data ?? {}) as { atualizados?: number; criados?: number };
    toast.success(
      `CMV importado: ${formatNumero(r.criados ?? 0)} produto(s) novo(s) e ${formatNumero(r.atualizados ?? 0)} atualizado(s).`,
    );
    aoConcluir();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar CMV por planilha</DialogTitle>
          <DialogDescription>
            Coluna A = SKU, coluna B = CMV (custo do produto, em R$). O CMV vale para todos os anúncios com o mesmo SKU,
            em qualquer marketplace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">1</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Baixe o modelo</p>
              <p className="text-xs text-muted-foreground">
                Já vem com os SKUs dos seus anúncios na coluna A. Preencha só a coluna B. A coluna C (nome) é só para você
                se achar e é ignorada.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={baixarModelo}>
              <Download className="size-3.5" />
              Baixar modelo
            </Button>
          </div>

          <div className="flex items-start gap-3 rounded-lg border p-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">2</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Envie a planilha preenchida</p>
              <p className="text-xs text-muted-foreground">Excel (.xlsx, .xls) ou .csv. Valores como 12,50 ou R$ 12,50 funcionam.</p>
              {nomeArquivo && (
                <p className="mt-1 flex items-center gap-1.5 truncate text-xs">
                  <FileSpreadsheet className="size-3.5 shrink-0" />
                  {nomeArquivo}
                </p>
              )}
            </div>
            <Button size="sm" variant="outline" asChild disabled={lendo}>
              <label className="cursor-pointer">
                {lendo ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                Escolher arquivo
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) lerArquivo(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </Button>
          </div>

          {linhas && (
            <div className="space-y-2 rounded-lg border p-3">
              <p className="font-medium">Resumo antes de importar</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-muted/40 p-2">
                  <p className="text-lg font-semibold tabular-nums">{formatNumero(novos.length)}</p>
                  <p className="text-[11px] text-muted-foreground">produtos novos</p>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <p className="text-lg font-semibold tabular-nums">{formatNumero(atualizados.length)}</p>
                  <p className="text-[11px] text-muted-foreground">CMV atualizado</p>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <p className={`text-lg font-semibold tabular-nums ${comProblema.length ? "text-loss" : ""}`}>
                    {formatNumero(comProblema.length)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">linhas com problema</p>
                </div>
              </div>
              {semAnuncio.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatNumero(semAnuncio.length)} SKU(s) não estão em nenhum anúncio ainda. Eles viram produto mesmo assim e
                  se ligam sozinhos quando o anúncio chegar.
                </p>
              )}
              {comProblema.length > 0 && (
                <div className="max-h-32 overflow-y-auto rounded-md border text-xs">
                  {comProblema.slice(0, 50).map((l) => (
                    <div key={l.linha} className="flex justify-between gap-3 border-b px-2 py-1 last:border-0">
                      <span className="truncate">
                        Linha {l.linha}
                        {l.sku ? ` · ${l.sku}` : ""}
                      </span>
                      <span className="shrink-0 text-loss">{l.problema}</span>
                    </div>
                  ))}
                </div>
              )}
              {atualizados.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Exemplo: {atualizados[0].sku} passa de {formatBRL(cmvPorSku.get(atualizados[0].sku) ?? 0)} para{" "}
                  {formatBRL(atualizados[0].cmv ?? 0)}.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={!validas.length || gravando}>
            {gravando && <Loader2 className="size-3.5 animate-spin" />}
            Importar {validas.length ? formatNumero(validas.length) : ""} CMV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
