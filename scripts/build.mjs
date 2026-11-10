// Builds the add-on into dist/. The popup and the background script are ES modules and share
// chunks (vite.config.ts). Content scripts can't load modules, so each one is built on its own
// as a single self-contained file.
import { build } from "vite";

const CONTENT_SCRIPTS = ["content", "page"];

await build();

function buildContentScript(name) {
  return build({
    configFile: false,
    publicDir: false,
    logLevel: "warn",
    build: {
      outDir: "dist",
      emptyOutDir: false,
      minify: false,
      lib: {
        entry: `src/${name}/main.ts`,
        formats: ["iife"],
        name: `ytStreamSync_${name}`,
        fileName: () => `${name}.js`,
      },
    },
  });
}

await Promise.all(CONTENT_SCRIPTS.map((name) => buildContentScript(name)));
