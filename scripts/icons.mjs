// Renders the toolbar icons from the project logo. Run by hand after the logo changes:
// node scripts/icons.mjs (uses Playwright's Chromium).
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const logo = readFileSync(new URL("../docs/assets/logo.svg", import.meta.url), "utf8");
const browser = await chromium.launch();

async function render(size) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>body{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${logo}`,
  );
  const path = new URL(`../static/icons/icon-${size}.png`, import.meta.url);
  await page.locator("svg").screenshot({ path: path.pathname, omitBackground: true });
}

await Promise.all([16, 32, 48, 128].map((size) => render(size)));
await browser.close();
