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
        privacidade: resolve(import.meta.dirname, "privacidade.html"),
        seats: resolve(import.meta.dirname, "seats.html"),
        fundador: resolve(import.meta.dirname, "fundador.html"),
        juridico: resolve(import.meta.dirname, "juridico/index.html"),
        voice: resolve(import.meta.dirname, "voice.html"),
        planos: resolve(import.meta.dirname, "planos.html"),
        planosTeste: resolve(import.meta.dirname, "planos-teste.html"),
        obrigado: resolve(import.meta.dirname, "obrigado.html"),
        espera: resolve(import.meta.dirname, "espera.html"),
        console: resolve(import.meta.dirname, "console/index.html"),
        cadastro: resolve(import.meta.dirname, "cadastro.html"),
        entrar: resolve(import.meta.dirname, "entrar.html"),
        app: resolve(import.meta.dirname, "app/index.html"),
        crm: resolve(import.meta.dirname, "crm/index.html"),
        admin: resolve(import.meta.dirname, "admin/index.html"),
        notFound: resolve(import.meta.dirname, "404.html"),
        enHome: resolve(import.meta.dirname, "en/index.html"),
        enModelos: resolve(import.meta.dirname, "en/modelos.html"),
        enManifesto: resolve(import.meta.dirname, "en/manifesto.html"),
        enPrivacidade: resolve(import.meta.dirname, "en/privacidade.html"),
        enSeats: resolve(import.meta.dirname, "en/seats.html"),
        enFundador: resolve(import.meta.dirname, "en/fundador.html"),
        enJuridico: resolve(import.meta.dirname, "en/juridico/index.html"),
        enVoice: resolve(import.meta.dirname, "en/voice.html"),
        enPlanos: resolve(import.meta.dirname, "en/planos.html"),
        enObrigado: resolve(import.meta.dirname, "en/obrigado.html"),
        enEspera: resolve(import.meta.dirname, "en/espera.html"),
        enConsole: resolve(import.meta.dirname, "en/console/index.html"),
        enCadastro: resolve(import.meta.dirname, "en/cadastro.html"),
        enEntrar: resolve(import.meta.dirname, "en/entrar.html"),
        enApp: resolve(import.meta.dirname, "en/app/index.html"),
        enNotFound: resolve(import.meta.dirname, "en/404.html")
      }
    }
  }
});
