import type { Page } from "puppeteer-core";

/** Each player row's text, sorted (players are listed in the order they joined). */
export function popupRows(popup: Page): Promise<string[]> {
  return popup.evaluate(() =>
    [...document.querySelectorAll("li")].map((row) => row.textContent ?? "").toSorted(),
  );
}

async function waitForStreams(popup: Page, count: number): Promise<void> {
  await popup.waitForFunction(
    (expected) => document.querySelectorAll("input[type=checkbox]").length === expected,
    {},
    count,
  );
}

/** Ticks or unticks the stream whose row starts with `title`, like a user would. */
export async function toggleStream(popup: Page, title: string): Promise<void> {
  const clicked = await popup.evaluate((wanted) => {
    const row = [...document.querySelectorAll("li")].find((item) =>
      item.textContent?.startsWith(wanted),
    );
    row?.querySelector("input")?.click();
    return row !== undefined;
  }, title);
  if (!clicked) {
    throw new Error(`No stream called ${title} in the popup`);
  }
}

/** Waits until the popup lists `count` live streams, then ticks every one of them. */
export async function tickAllStreams(popup: Page, count: number): Promise<void> {
  await waitForStreams(popup, count);
  await popup.evaluate(() => {
    for (const box of document.querySelectorAll<HTMLInputElement>("input[type=checkbox]")) {
      box.click();
    }
  });
}
