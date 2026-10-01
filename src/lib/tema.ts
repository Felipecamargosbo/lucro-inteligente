// Tema do Planeta97: escuro (padrão) ou claro. A escolha fica salva no
// navegador do seller e é aplicada colocando a classe "claro" no <html> —
// o arquivo de estilos troca as cores quando essa classe está lá. O menu
// da esquerda continua escuro nos dois temas (identidade do Planeta97).

export type Tema = "escuro" | "claro";

export const CHAVE_TEMA = "planeta97-tema";

export function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE_TEMA) === "claro" ? "claro" : "escuro";
  } catch {
    return "escuro";
  }
}

export function aplicarTema(tema: Tema) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("claro", tema === "claro");
}

export function salvarTema(tema: Tema) {
  try {
    localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // Sem acesso ao armazenamento do navegador: o tema vale só até recarregar.
  }
  aplicarTema(tema);
}

/** Roda antes da página aparecer, pra não piscar escuro antes de ficar claro. */
export const SCRIPT_TEMA_INICIAL = `try{if(localStorage.getItem("${CHAVE_TEMA}")==="claro"){document.documentElement.classList.add("claro")}}catch(e){}`;
