import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { EMPRESA } from "@/config/empresa";

/**
 * Molde das páginas públicas de Termos de Uso e Política de Privacidade.
 * Abrem sem login (o __root.tsx libera esses endereços), num layout simples:
 * logo no topo, texto no meio e links entre as duas páginas no rodapé.
 */
export function PaginaLegal({
  titulo,
  resumo,
  children,
}: {
  titulo: string;
  resumo: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="flex items-center gap-2.5">
            <img
              src="/planeta.png"
              alt="Planeta97"
              className="size-8 shrink-0 rounded-full object-cover"
            />
            <span className="text-base font-bold tracking-tight">
              PLANETA
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "linear-gradient(135deg, #00F57A, #1B5CFF)" }}
              >
                97
              </span>
            </span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            Voltar ao NEXO
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{titulo}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Última atualização: {EMPRESA.atualizadoEm}
        </p>
        <p className="mt-6 rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">{resumo}</p>

        <div className="mt-8 space-y-8">{children}</div>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground">
          <p>
            {EMPRESA.razaoSocial} · CNPJ {EMPRESA.cnpj} · {EMPRESA.email}
          </p>
          <div className="flex gap-4">
            <Link to="/termos" className="hover:text-foreground">
              Termos de Uso
            </Link>
            <Link to="/privacidade" className="hover:text-foreground">
              Política de Privacidade
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Uma seção numerada do texto (ex.: "3. Planos e pagamento"). */
export function Secao({ numero, titulo, children }: { numero: number; titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {numero}. {titulo}
      </h2>
      <div className="space-y-3 text-sm leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}

/** Lista com marcadores dentro de uma seção. */
export function Lista({ itens }: { itens: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {itens.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
