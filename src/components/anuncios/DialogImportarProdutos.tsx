import { useState } from "react";
import { toast } from "sonner";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { produtosService } from "@/services";
import { formatNumero } from "@/lib/format";
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
 * Importar o catálogo (todos os SKUs) por planilha.
 *
 * Colunas: SKU, Nome, CMV e EAN. Só o SKU é obrigatório. Aceita também a
 * exportação de produtos do Bling/Tiny ("Código", "Descrição", "Preço de
 * custo", "GTIN/EAN"). SKU que já existe: muda só o que veio preenchido.
 */

type Linha = { linha: number; sku: string; nome: string | null; cmv: number | null; ean: string | null; problema: string | null };

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toUpperCase();

function lerNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? Math.round(valor * 100) / 100 : null;
  let t = String(valor).replace(/R\$|\s/gi, "");
  if (!t) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const COLUNAS = {
  sku: ["SKU", "CODIGO", "COD", "CODIGO SKU", "SKU DO VENDEDOR"],
  nome: ["NOME", "DESCRICAO", "PRODUTO", "NOME DO PRODUTO", "TITULO"],
  cmv: ["CMV", "CUSTO", "PRECO DE CUSTO", "PRECO CUSTO", "CUSTO UNITARIO"],
  ean: ["EAN", "GTIN", "GTIN/EAN", "CODIGO DE BARRAS"],
};

export function DialogImportarProdutos({
  produtos,
  semProduto,
  aoFechar,
  aoConcluir,
}: {
  produtos: Produto[];
  /** Anúncios cujo SKU não está no catálogo: vão para o modelo. */
  semProduto: Anuncio[];
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [lendo, setLendo] = useState(false);
  const [gravando, setGravando] = useState(false);

  const skusExistentes = new Set(produtos.map((p) => p.sku.trim().toUpperCase()));

  const baixarModelo = async () => {
    try {
      const XLSX = await import("xlsx");
      const dados: (string | number)[][] = [["SKU", "Nome", "CMV", "EAN"]];
      for (const p of produtos) dados.push([p.sku, p.nome, p.cmv > 0 ? p.cmv : "", p.ean ?? ""]);
      // SKUs que já estão em anúncios mas ainda não no catálogo.
      const vistos = new Set<string>();
      for (const a of semProduto) {
        const k = a.sku.trim().toUpperCase();
        if (!a.sku.trim() || skusExistentes.has(k) || vistos.has(k)) continue;
        vistos.add(k);
        dados.push([a.sku.trim(), a.produto, "", a.ean ?? ""]);
      }
      const aba = XLSX.utils.aoa_to_sheet(dados);
      aba["!cols"] = [{ wch: 22 }, { wch: 60 }, { wch: 12 }, { wch: 16 }];
      const livro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(livro, aba, "Produtos");
      XLSX.writeFile(livro, "modelo-produtos.xlsx");
      toast.success(`Modelo baixado com ${formatNumero(dados.length - 1)} produtos.`);
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
      const cab = (tabela[0] ?? []).map((c) => normalizar(String(c ?? "")));
      const acha = (nomes: string[]) => cab.findIndex((c) => nomes.includes(c));
      let iSku = acha(COLUNAS.sku);
      let iNome = acha(COLUNAS.nome);
      let iCmv = acha(COLUNAS.cmv);
      let iEan = acha(COLUNAS.ean);
      let inicio = 1;
      if (iSku < 0) {
        // Sem cabeçalho conhecido: A = SKU, B = Nome, C = CMV, D = EAN.
        iSku = 0;
        iNome = 1;
        iCmv = 2;
        iEan = 3;
        inicio = 0;
      }
      const vistas = new Map<string, number>();
      const saida: Linha[] = [];
      for (let i = inicio; i < tabela.length; i++) {
        const r = tabela[i] ?? [];
        const sku = String(r[iSku] ?? "").trim();
        const nome = iNome >= 0 ? String(r[iNome] ?? "").trim() || null : null;
        const brutoCmv = iCmv >= 0 ? r[iCmv] : undefined;
        const cmv = lerNumero(brutoCmv);
        const ean = iEan >= 0 ? String(r[iEan] ?? "").trim() || null : null;
        if (!sku && !nome) continue;
        let problema: string | null = null;
        if (!sku) problema = "SKU vazio";
        else if (brutoCmv !== undefined && brutoCmv !== "" && cmv === null) problema = "CMV não é número";
        else if (cmv !== null && cmv < 0) problema = "CMV negativo";
        else if (vistas.has(sku.toUpperCase())) problema = `SKU repetido (linha ${vistas.get(sku.toUpperCase())})`;
        if (sku && !vistas.has(sku.toUpperCase())) vistas.set(sku.toUpperCase(), i + 1);
        saida.push({ linha: i + 1, sku, nome, cmv, ean, problema });
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
  const novos = validas.filter((l) => !skusExistentes.has(l.sku.toUpperCase()));
  const atualizados = validas.length - novos.length;

  const importar = async () => {
    if (!validas.length) return;
    setGravando(true);
    const r = await produtosService.importar(validas.map((l) => ({ sku: l.sku, nome: l.nome, cmv: l.cmv, ean: l.ean })));
    setGravando(false);
    if (r.erro) {
      toast.error(`Não consegui importar. Nada foi alterado. (${r.erro})`);
      return;
    }
    toast.success(`Catálogo importado: ${formatNumero(r.criados)} produto(s) novo(s) e ${formatNumero(r.atualizados)} atualizado(s).`);
    aoConcluir();
  };

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Importar produtos por planilha</DialogTitle>
          <DialogDescription>
            Suba todos os seus SKUs com o nome (e o CMV, se tiver). Cada anúncio com o mesmo SKU se liga sozinho ao produto, em
            qualquer canal. Também aceita a planilha de produtos exportada do Bling ou do Tiny.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="flex items-start gap-3 rounded-lg border p-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">1</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium">Baixe o modelo</p>
              <p className="text-xs text-muted-foreground">
                Colunas SKU, Nome, CMV e EAN. Já vem com o seu catálogo e com os SKUs dos anúncios que ainda não têm produto.
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
              <p className="font-medium">Envie a planilha</p>
              <p className="text-xs text-muted-foreground">Excel (.xlsx, .xls) ou .csv. Só o SKU é obrigatório.</p>
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
                  <p className="text-lg font-semibold tabular-nums">{formatNumero(atualizados)}</p>
                  <p className="text-[11px] text-muted-foreground">já existentes (atualizados)</p>
                </div>
                <div className="rounded-md bg-muted/40 p-2">
                  <p className={`text-lg font-semibold tabular-nums ${comProblema.length ? "text-loss" : ""}`}>
                    {formatNumero(comProblema.length)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">linhas com problema</p>
                </div>
              </div>
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
              <p className="text-xs text-muted-foreground">
                Em produto que já existe, só muda o que veio preenchido. Célula vazia não apaga nada.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={!validas.length || gravando}>
            {gravando && <Loader2 className="size-3.5 animate-spin" />}
            Importar {validas.length ? formatNumero(validas.length) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
