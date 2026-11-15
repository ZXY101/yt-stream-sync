import type { Page } from "puppeteer-core";

import { openExtensionPage } from "../fixtures/firefox.ts";
import { expect, test } from "../fixtures/test.ts";

function isDark(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains("dark"));
}

async function pickTheme(page: Page, label: string): Promise<void> {
  const radio = await page.waitForSelector(`::-p-aria(${label}[role="radio"])`);
  await radio?.click();
}

test("picks the theme on the settings page, and the popup follows", async ({
  firefoxPage,
  openPopup,
}) => {
  const popup = await openPopup();
  // The test browser reports a light system theme; the popup has no theme button of its own.
  await expect.poll(() => isDark(popup)).toBe(false);
  expect(await popup.$("button[aria-label*='theme']")).toBeNull();

  const settings = await firefoxPage.browser().newPage({ type: "window" });
  await openExtensionPage(settings, "options/index.html#settings");
  await pickTheme(settings, "Dark");
  await expect.poll(() => isDark(settings)).toBe(true);
  // The popup that is already open follows, and so does the next one.
  await expect.poll(() => isDark(popup)).toBe(true);
  const nextPopup = await openPopup();
  await expect.poll(() => isDark(nextPopup)).toBe(true);

  await pickTheme(settings, "System");
  await expect.poll(() => isDark(nextPopup)).toBe(false);
});
