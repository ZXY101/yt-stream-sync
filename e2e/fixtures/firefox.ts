import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { firefox } from "@playwright/test";
import { launch, type Browser, type Page } from "puppeteer-core";

import manifest from "../../static/manifest.json" with { type: "json" };

const DIST = path.resolve(import.meta.dirname, "../../dist");
const ADDON_ID = manifest.browser_specific_settings.gecko.id;
// Firefox gives each add-on a random UUID per profile; pinning it makes page URLs predictable.
const ADDON_UUID = "6f1c2b7e-0d3a-4e59-9a61-2c8f4b5d7e10";

const EXTENSION_ORIGIN = `moz-extension://${ADDON_UUID}`;

export interface FirefoxSession {
  browser: Browser;
  page: Page;
  close: () => Promise<void>;
}

export async function launchFirefox(): Promise<FirefoxSession> {
  const profile = mkdtempSync(path.join(tmpdir(), "yt-stream-sync-e2e-"));
  const browser = await launch({
    browser: "firefox",
    executablePath: firefox.executablePath(),
    headless: true,
    userDataDir: profile,
    // WebDriver BiDi refuses to open moz-extension:// pages unless this is set (test only).
    env: { ...process.env, MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
    extraPrefsFirefox: {
      "extensions.webextensions.uuids": JSON.stringify({ [ADDON_ID]: ADDON_UUID }),
    },
  });
  await browser.installExtension(DIST);
  // newPage() hangs in this Firefox build, so tests reuse the window's first tab.
  const [page] = await browser.pages();
  if (!page) {
    throw new Error("Firefox started without a tab");
  }

  async function close() {
    await browser.close();
    rmSync(profile, { recursive: true, force: true });
  }

  return { browser, page, close };
}

// Extension pages load in their own process, and puppeteer never sees that navigation finish
// (the target keeps reporting about:blank). The page does load, so start the navigation, then
// wait until the document itself says it's there.
export async function openExtensionPage(page: Page, file: string): Promise<Page> {
  const url = `${EXTENSION_ORIGIN}/${file}`;
  await page.goto(url, { timeout: 1000 }).catch(() => undefined);
  await page.waitForFunction((expected) => location.href === expected, {}, url);
  await page.waitForFunction(() => document.readyState === "complete");
  return page;
}
