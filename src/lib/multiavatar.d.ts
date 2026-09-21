// O multiavatar.js é JavaScript puro (não TypeScript) — esse arquivo só
// diz pro TypeScript qual é o formato dele, sem precisar mudar nenhuma
// configuração geral do projeto.
declare module "@/lib/multiavatar" {
  /**
   * Gera um avatar em SVG (como texto) a partir de qualquer string —
   * o mesmo texto sempre gera o mesmo avatar. `sansEnv` (opcional, true)
   * remove o círculo de fundo colorido, deixando só o personagem.
   */
  export default function multiavatar(
    texto: string,
    sansEnv?: boolean,
    versao?: unknown,
  ): string;
}
