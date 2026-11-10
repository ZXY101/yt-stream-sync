import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.ts";

export default mergeConfig(
  viteConfig,
  defineConfig({
    root: ".",
    test: {
      include: ["src/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      globals: true,
      setupFiles: ["src/test/setup.ts"],
      coverage: {
        provider: "v8",
        include: ["src/**/*.{ts,tsx}"],
        exclude: [
          "src/test/**",
          "src/components/ui/**",
          // Web Audio wiring only, which jsdom can't run; its logic is in audio/ring.ts.
          "src/page/audio-tap.ts",
          "src/**/main.{ts,tsx}",
          "**/*.test.{ts,tsx}",
          "**/types.ts",
        ],
        reporter: ["text-summary", "text"],
        thresholds: { lines: 80, branches: 80, functions: 80, statements: 80 },
      },
    },
  }),
);
