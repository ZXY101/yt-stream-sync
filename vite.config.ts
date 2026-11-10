import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The popup and background script are built from src/, and static/ (manifest, icons) is copied into dist/ as it is.
// The output isn't minified so the published add-on stays readable for store reviewers.
export default defineConfig({
  root: "src",
  publicDir: "../static",
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    minify: false,
    // React alone is ~550 kB unminified; it loads from disk, so size matters little.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: { popup: "src/popup/index.html", background: "src/background/main.ts" },
      // Stable file names: an add-on has no cache to bust, and diffs between builds stay small.
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name].js",
        assetFileNames: "assets/[name][extname]",
        // Third-party code in its own file, so the store linter's allowlist can name it.
        manualChunks(id: string) {
          return id.includes("/node_modules/") ? "vendor" : undefined;
        },
      },
    },
  },
});
