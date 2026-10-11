/**
 * Modo demonstração.
 *
 * Só as contas marcadas como "Demonstração" no ADMIN (coluna
 * `perfis.modo_demonstracao`) enxergam os dados fictícios de exemplo
 * (src/data/mock.ts). Todas as outras — inclusive qualquer seller novo — veem
 * só os dados reais delas: onde ainda não houver dado, a tela fica vazia.
 *
 * A chave mora fora do React porque a camada de serviços (src/services) e os
 * loaders das rotas também precisam dela. Quem liga/desliga é o AuthProvider,
 * assim que lê o perfil; e a área logada é remontada quando ela muda, para
 * nenhuma tela ficar com o dado do modo anterior na memória.
 */
let demonstracao = false;

export const emDemonstracao = () => demonstracao;

export function definirDemonstracao(valor: boolean) {
  demonstracao = valor;
}

/** Devolve o dado de exemplo só no modo demonstração; fora dele, o vazio. */
export function soNaDemo<T>(exemplo: T, vazio: T): T {
  return demonstracao ? exemplo : vazio;
}
