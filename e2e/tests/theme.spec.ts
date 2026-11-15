import type { Page } from "puppeteer-core";

import { openExtensionPage } from "../fixtures/firefox.ts";
import { expect, test } from "../fixtures/test.ts";

function isDark(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains("dark"));
}

async function clickButton(page: Page, label: string): Promise<void> {
  const button = await page.waitForSelector(`button[aria-label='${label}']`);
  await button?.click();
}

test("switches the theme in the popup, and the settings page and next popup follow", async ({
  firefoxPage,
  openPopup,
}) => {
  const popup = await openPopup();
  // The test browser reports a light system theme.
  await expect.poll(() => isDark(popup)).toBe(false);

  await clickButton(popup, "Switch to dark theme");
  await expect.poll(() => isDark(popup)).toBe(true);

  const nextPopup = await openPopup();
  await expect.poll(() => isDark(nextPopup)).toBe(true);
  const settings = await firefoxPage.browser().newPage({ type: "window" });
  await openExtensionPage(settings, "options/index.html#settings");
  await expect.poll(() => isDark(settings)).toBe(true);

  // Switching back in the settings page reaches the popup that is still open.
  await clickButton(settings, "Switch to light theme");
  await expect.poll(() => isDark(settings)).toBe(false);
  await expect.poll(() => isDark(popup)).toBe(false);
});
