import { defineConfig } from "@playwright/test";

// Playwright is the test runner only. Firefox is driven by puppeteer-core over WebDriver BiDi
// (see e2e/fixtures/firefox.ts), because Playwright can't install add-ons into Firefox.
export default defineConfig({
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  globalSetup: "./e2e/global-setup.ts",
  projects: [
    { name: "firefox", testDir: "e2e/tests" },
    // Real YouTube, network needed. Opt-in: `npm run test:e2e:live` (see e2e/live/).
    { name: "live", testDir: "e2e/live" },
  ],
});
