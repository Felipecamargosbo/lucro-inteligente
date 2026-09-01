import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Botão de exportação reutilizável em qualquer aba do dashboard. Recebe as
 * linhas já formatadas (o mesmo que aparece nas tabelas da tela) e gera o
 * arquivo inteiramente no navegador, sem precisar de backend — CSV e Excel
 * saem prontos pra abrir no Sheets/Excel, e o PDF sai pronto pra imprimir ou
 * enviar por e-mail.
 *
 * Excel e PDF usam bibliotecas carregadas sob demanda (só quando o seller
 * clica em exportar), pra não pesar o carregamento inicial da página.
 */
export function ExportarDados({
  nomeArquivo,
  linhas,
}: {
  nomeArquivo: string;
  linhas: Record<string, string | number>[];
}) {
  const avisarSemDados = () => {
    toast.info("Não há dados para exportar neste período.");
  };

  const exportarCSV = () => {
    if (!linhas.length) return avisarSemDados();
    const colunas = Object.keys(linhas[0]!);
    const csv = [
      colunas.join(";"),
      ...linhas.map((l) => colunas.map((c) => `"${String(l[c] ?? "")}"`).join(";")),
    ].join("\n");

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
    if (!linhas.length) return avisarSemDados();
    try {
      const XLSX = await import("xlsx");
      const planilha = XLSX.utils.json_to_sheet(linhas);
      const livro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(livro, planilha, "Dados");
      XLSX.writeFile(livro, `${nomeArquivo}.xlsx`);
      toast.success("Arquivo Excel gerado com sucesso.");
    } catch (erro) {
      console.error("Falha ao exportar Excel:", erro);
      toast.error("Não foi possível gerar o Excel agora. Tente novamente.");
    }
  };

  const exportarPDF = async () => {
    if (!linhas.length) return avisarSemDados();
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
      const colunas = Object.keys(linhas[0]!);
      const doc = new jsPDF({ orientation: colunas.length > 6 ? "landscape" : "portrait" });
      doc.setFontSize(12);
      doc.text(nomeArquivo.replace(/-/g, " "), 14, 14);
      autoTable(doc, {
        head: [colunas],
        body: linhas.map((l) => colunas.map((c) => String(l[c] ?? ""))),
        startY: 20,
        styles: { fontSize: 8 },
        headStyles: { fillColor: [37, 99, 235] },
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
