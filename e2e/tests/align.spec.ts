import type { Page } from "puppeteer-core";

import { openExtensionPage } from "../fixtures/firefox.ts";
import { addAllStreams } from "../fixtures/popup.ts";
import { expect, test } from "../fixtures/test.ts";
import { FAKE_TOKEN, startFakeYtdlpz, type FakeYtdlpz } from "../fixtures/ytdlpz.ts";
import { openMultiview, streamFrame } from "../fixtures/youtube.ts";

// The second broadcast started 70 s after the first; yt-dlp-z says its content is 31 s later.
const START_A = "2026-11-10T12:59:40+00:00";
const START_B = "2026-11-10T13:00:50+00:00";
const URL_A = "https://www.youtube.com/watch?v=pov-a";
const URL_B = "https://www.youtube.com/watch?v=pov-b";

let server: FakeYtdlpz;

test.beforeEach(async () => {
  server = await startFakeYtdlpz({ [URL_A]: 0, [URL_B]: 31 });
});

test.afterEach(async () => {
  await server.close();
});

async function openSettings(page: Page): Promise<Page> {
  const settings = await page.browser().newPage({ type: "window" });
  await openExtensionPage(settings, "options/index.html");
  await settings.waitForSelector("#ytdlpz-address");
  return settings;
}

/** Types like a user: React only sees typed input, not a value set from outside. */
async function typeInto(page: Page, selector: string, text: string) {
  await page.click(selector, { count: 3 });
  await page.keyboard.press("Backspace");
  await page.type(selector, text);
}

async function turnOn(settings: Page, token = FAKE_TOKEN) {
  await typeInto(settings, "#ytdlpz-address", server.address);
  await typeInto(settings, "#ytdlpz-token", token);
  await settings.locator("::-p-aria(Turn on)").click();
}

function outputText(page: Page): Promise<string> {
  return page.evaluate(() => document.querySelector("output")?.textContent ?? "");
}

test("settings page tests the server before turning alignment on", async ({ firefoxPage }) => {
  const settings = await openSettings(firefoxPage);
  expect(await settings.evaluate(() => document.body.textContent)).toContain(
    "What leaves your browser",
  );

  await turnOn(settings, "wrong-token");
  await expect.poll(() => outputText(settings)).toBe("yt-dlp-z didn't accept this API token.");

  await typeInto(settings, "#ytdlpz-token", FAKE_TOKEN);
  await settings.locator("::-p-aria(Turn on)").click();
  await expect.poll(() => outputText(settings)).toBe("Connected. Alignment is on.");

  await settings.locator("::-p-aria(Turn off)").click();
  await expect.poll(() => outputText(settings)).toBe("Alignment is off.");
});

/** The background's offset for each stream, by title. */
function offsets(popup: Page): Promise<Record<string, number>> {
  return popup.evaluate(async () => {
    type Runtime = { sendMessage: (message: unknown) => Promise<unknown> };
    const api = (globalThis as unknown as { browser: { runtime: Runtime } }).browser;
    const status = (await api.runtime.sendMessage({ type: "getStatus" })) as {
      players: { title: string; offset: number }[];
    };
    return Object.fromEntries(status.players.map((player) => [player.title, player.offset]));
  });
}

test("aligns the group's archives through yt-dlp-z", async ({ firefoxPage, openPopup }) => {
  await openMultiview(firefoxPage, [
    { id: "pov-a", position: 300, start: START_A },
    { id: "pov-b", position: 40, start: START_B },
  ]);
  await streamFrame(firefoxPage, "pov-a");
  await streamFrame(firefoxPage, "pov-b");
  const popup = await openPopup();
  await addAllStreams(popup, 2);
  // Off until set up: the popup doesn't offer it.
  expect(await popup.$("::-p-aria(Align with yt-dlp-z)")).toBeNull();

  const settings = await openSettings(firefoxPage);
  await turnOn(settings);
  await expect.poll(() => outputText(settings)).toBe("Connected. Alignment is on.");

  await popup.locator("::-p-aria(Align with yt-dlp-z)").click();
  await expect
    .poll(() => popup.$("::-p-text(Aligned.)").then(Boolean), { timeout: 15_000 })
    .toBe(true);
  expect(server.started).toEqual([[URL_A, URL_B]]);
  // 31 s later in content, and it started 70 s later: 31 + 70 on the broadcast clock.
  expect(await offsets(popup)).toMatchObject({ "pov-a": 0, "pov-b": 101 });
  expect(server.deleted).toEqual(["job-1"]);
});
