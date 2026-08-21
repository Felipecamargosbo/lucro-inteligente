import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Interface de exportação. No protótipo o CSV é gerado no navegador
 * e o Excel fica preparado para o backend futuro.
 */
export function ExportarDados({
  nomeArquivo,
  linhas,
}: {
  nomeArquivo: string;
  linhas: Record<string, string | number>[];
}) {
  const exportarCSV = () => {
    if (!linhas.length) {
      toast.info("Não há dados para exportar neste período.");
      return;
    }
    const colunas = Object.keys(linhas[0]);
    const csv = [
      colunas.join(";"),
      ...linhas.map((l) => colunas.map((c) => `"${String(l[c] ?? "")}"`).join(";")),
    ].join("\n");

    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${nomeArquivo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Arquivo CSV gerado com sucesso.");
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
        <DropdownMenuItem
          onClick={() => toast.info("Exportação em Excel será liberada com o backend.")}
          className="gap-2"
        >
          <FileSpreadsheet className="size-4" /> Baixar Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
