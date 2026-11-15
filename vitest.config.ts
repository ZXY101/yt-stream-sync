import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config.ts";

const DOM_TESTS = ["src/**/*.test.tsx", "src/page/**/*.test.ts"];

export default mergeConfig(
  viteConfig,
  defineConfig({
    root: ".",
    test: {
      globals: true,
      // Half the cores: the dev box also runs the home server, which a full-width run starved
      // (audio tests timed out in the pre-push hook at load 12 on 8 cores).
      maxWorkers: "50%",
      // Only UI and page-script tests need a DOM. Starting jsdom for every file cost about a
      // third of the run, so the rest run in plain Node.
      projects: [
        {
          extends: true,
          test: {
            name: "dom",
            include: DOM_TESTS,
            environment: "jsdom",
            setupFiles: ["src/test/setup.ts"],
          },
        },
        {
          extends: true,
          test: {
            name: "node",
            include: ["src/**/*.test.ts"],
            exclude: DOM_TESTS,
            environment: "node",
          },
        },
      ],
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
