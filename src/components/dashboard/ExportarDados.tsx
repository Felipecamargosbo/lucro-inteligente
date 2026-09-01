import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface SecaoExport {
  titulo: string;
  linhas: Record<string, string | number>[];
}

/**
 * Botão de exportação reutilizável em qualquer aba do dashboard. Recebe as
 * linhas já formatadas (o mesmo que aparece nas tabelas da tela) e gera o
 * arquivo inteiramente no navegador, sem precisar de backend — CSV e Excel
 * saem prontos pra abrir no Sheets/Excel, e o PDF sai pronto pra imprimir ou
 * enviar por e-mail.
 *
 * Aceita dois formatos de entrada:
 * - `linhas`: uma tabela só (usado pela maioria das abas) — vira uma tabela
 *   única no CSV/Excel/PDF, sem título de seção (comportamento original).
 * - `secoes`: várias tabelas nomeadas (usado quando a aba tem indicadores de
 *   naturezas diferentes, ex.: um resumo geral + uma tabela por canal) — cada
 *   seção vira uma aba própria no Excel, um bloco com título no CSV, e uma
 *   tabela com título no PDF.
 *
 * Excel e PDF usam bibliotecas carregadas sob demanda (só quando o seller
 * clica em exportar), pra não pesar o carregamento inicial da página.
 */
export function ExportarDados({
  nomeArquivo,
  linhas,
  secoes,
}: {
  nomeArquivo: string;
  linhas?: Record<string, string | number>[];
  secoes?: SecaoExport[];
}) {
  const todasAsSecoes: SecaoExport[] = secoes ?? [{ titulo: "", linhas: linhas ?? [] }];
  const secoesComDados = todasAsSecoes.filter((s) => s.linhas.length > 0);

  const avisarSemDados = () => {
    toast.info("Não há dados para exportar neste período.");
  };

  const exportarCSV = () => {
    if (!secoesComDados.length) return avisarSemDados();
    const blocos = secoesComDados.map((secao) => {
      const colunas = Object.keys(secao.linhas[0]!);
      const linhasCsv = [
        colunas.join(";"),
        ...secao.linhas.map((l) => colunas.map((c) => `"${String(l[c] ?? "")}"`).join(";")),
      ].join("\n");
      return secao.titulo ? `${secao.titulo}\n${linhasCsv}` : linhasCsv;
    });
    const csv = blocos.join("\n\n");

    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${nomeArquivo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Arquivo CSV gerado com sucesso.");
  };

  const exportarExcel = async () => {
    if (!secoesComDados.length) return avisarSemDados();
    try {
      const XLSX = await import("xlsx");
      const livro = XLSX.utils.book_new();
      const nomesUsados = new Set<string>();
      secoesComDados.forEach((secao, indice) => {
        const planilha = XLSX.utils.json_to_sheet(secao.linhas);
        // Nome da aba no Excel: no máximo 31 caracteres e sem os símbolos que
        // o formato não aceita (\ / ? * [ ] :).
        let nomeBase = (
          secao.titulo || (secoesComDados.length === 1 ? "Dados" : `Dados ${indice + 1}`)
        )
          .replace(/[\\/?*[\]:]/g, "")
          .slice(0, 31);
        if (!nomeBase) nomeBase = `Dados ${indice + 1}`;
        let nomeFinal = nomeBase;
        let sufixo = 2;
        while (nomesUsados.has(nomeFinal)) {
          nomeFinal = `${nomeBase.slice(0, 28)} ${sufixo}`;
          sufixo += 1;
        }
        nomesUsados.add(nomeFinal);
        XLSX.utils.book_append_sheet(livro, planilha, nomeFinal);
      });
      XLSX.writeFile(livro, `${nomeArquivo}.xlsx`);
      toast.success("Arquivo Excel gerado com sucesso.");
    } catch (erro) {
      console.error("Falha ao exportar Excel:", erro);
      toast.error("Não foi possível gerar o Excel agora. Tente novamente.");
    }
  };

  const exportarPDF = async () => {
    if (!secoesComDados.length) return avisarSemDados();
    try {
      const [{ jsPDF }, autoTableModulo] = await Promise.all([
        import("jspdf"),
        import("jspdf-autotable"),
      ]);
      // Dependendo de como o Vercel empacota essa biblioteca (CommonJS
      // interoperando com ESM), a função pode vir direto em "default" ou
      // embrulhada mais uma vez em "default.default" — cobrimos os dois casos.
      const autoTablePossivelmenteEmbrulhado = autoTableModulo.default as unknown;
      const autoTable = (
        typeof autoTablePossivelmenteEmbrulhado === "function"
          ? autoTablePossivelmenteEmbrulhado
          : (autoTablePossivelmenteEmbrulhado as { default: unknown }).default
      ) as typeof import("jspdf-autotable").default;

      const maiorNumeroDeColunas = Math.max(
        ...secoesComDados.map((s) => Object.keys(s.linhas[0]!).length),
      );
      const doc = new jsPDF({ orientation: maiorNumeroDeColunas > 6 ? "landscape" : "portrait" });
      const alturaPagina = doc.internal.pageSize.getHeight();
      doc.setFontSize(12);
      doc.text(nomeArquivo.replace(/-/g, " "), 14, 14);

      let cursorY = 20;
      secoesComDados.forEach((secao) => {
        const colunas = Object.keys(secao.linhas[0]!);
        if (cursorY > alturaPagina - 30) {
          doc.addPage();
          cursorY = 20;
        }
        if (secao.titulo) {
          doc.setFontSize(10);
          doc.text(secao.titulo, 14, cursorY);
          cursorY += 5;
        }
        autoTable(doc, {
          head: [colunas],
          body: secao.linhas.map((l) => colunas.map((c) => String(l[c] ?? ""))),
          startY: cursorY,
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235] },
        });
        const finalY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
          ?.finalY;
        cursorY = (finalY ?? cursorY + 40) + 10;
      });

      doc.save(`${nomeArquivo}.pdf`);
      toast.success("Arquivo PDF gerado com sucesso.");
    } catch (erro) {
      console.error("Falha ao exportar PDF:", erro);
      toast.error("Não foi possível gerar o PDF agora. Tente novamente.");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Download className="size-4" />
          Exportar
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={exportarCSV} className="gap-2">
          <FileText className="size-4" /> Baixar CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportarExcel} className="gap-2">
          <FileSpreadsheet className="size-4" /> Baixar Excel
        </DropdownMenuItem>
        <DropdownMenuItem onClick={exportarPDF} className="gap-2">
          <Printer className="size-4" /> Baixar PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
