// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Hospedagem na Cloudflare Workers.
  // nodeCompat: liga a compatibilidade com Node (o Supabase e outras bibliotecas precisam).
  // deployConfig: no build, gera sozinho a configuração que o "wrangler deploy" usa
  // (aponta para o servidor em .output/server e para os arquivos do site em .output/public).
  // Na Vercel essas opções são ignoradas, então o site continua funcionando lá durante o teste.
  nitro: {
    cloudflare: {
      nodeCompat: true,
      deployConfig: true,
    },
  },
});
