import { resolve } from "node:path";
import { defineConfig } from "vite";

// O deploy oficial é estático a partir da raiz (GitHub Pages), sem etapa de build.
// Esta configuração existe apenas para `npm run build:static`, usada em validações locais.
// publicDir: false — todos os arquivos públicos já vivem na raiz do repositório.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, "index.html"),
        modelos: resolve(import.meta.dirname, "modelos.html"),
        manifesto: resolve(import.meta.dirname, "manifesto.html"),
        fundador: resolve(import.meta.dirname, "fundador.html"),
        juridico: resolve(import.meta.dirname, "juridico/index.html"),
        voice: resolve(import.meta.dirname, "voice.html"),
        planos: resolve(import.meta.dirname, "planos.html"),
        planosTeste: resolve(import.meta.dirname, "planos-teste.html"),
        obrigado: resolve(import.meta.dirname, "obrigado.html"),
        espera: resolve(import.meta.dirname, "espera.html"),
        console: resolve(import.meta.dirname, "console/index.html"),
        notFound: resolve(import.meta.dirname, "404.html")
      }
    }
  }
});
