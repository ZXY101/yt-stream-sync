import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Pages are built from src/, and static/ (manifest, icons) is copied into dist/ as it is.
// The output isn't minified so the published add-on stays readable for store reviewers.
export default defineConfig({
  root: "src",
  publicDir: "../static",
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    minify: false,
    // React alone is ~550 kB unminified; it loads from disk, so size matters little.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      input: { popup: "src/popup/index.html" },
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
