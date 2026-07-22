import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: resolve(import.meta.dirname, "index.html"),
        manifesto: resolve(import.meta.dirname, "manifesto.html"),
        notFound: resolve(import.meta.dirname, "404.html")
      }
    }
  }
});
