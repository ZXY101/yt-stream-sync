import type { Page } from "puppeteer-core";

import { addAllStreams } from "../fixtures/popup.ts";
import { expect, test } from "../fixtures/test.ts";

// Opt-in: needs network and two archives of the same collab, e.g.
// ARCHIVE_STREAMS=<id>,<id> npm run test:e2e:live
const STREAMS = (process.env.ARCHIVE_STREAMS ?? "").split(",").filter(Boolean);

interface Reading {
  moment: number;
  position: number;
  paused: boolean;
}

/** The broadcast moment a watch page shows: its start time plus its position. */
function read(page: Page): Promise<Reading> {
  return page.evaluate(() => {
    const player = document.getElementById("movie_player") as unknown as {
      getPlayerResponse: () => {
        microformat?: {
          playerMicroformatRenderer?: { liveBroadcastDetails?: { startTimestamp?: string } };
        };
      };
    };
    const details = player.getPlayerResponse().microformat?.playerMicroformatRenderer;
    const start = Date.parse(details?.liveBroadcastDetails?.startTimestamp ?? "") / 1000;
    const video = document.querySelector("video") as HTMLVideoElement;
    return { moment: start + video.currentTime, position: video.currentTime, paused: video.paused };
  });
}

async function openWatchPage(page: Page, id: string, at: number): Promise<void> {
  await page.goto(`https://www.youtube.com/watch?v=${id}&t=${at}s`, { waitUntil: "load" });
  await page.waitForFunction(() => (document.querySelector("video")?.currentTime ?? 0) > 0, {
    timeout: 60_000,
  });
  await page.evaluate(() => {
    const video = document.querySelector("video") as HTMLVideoElement;
    video.muted = true;
  });
}

async function gap(first: Page, second: Page): Promise<number> {
  const [a, b] = await Promise.all([read(first), read(second)]);
  return Math.abs(a.moment - b.moment);
}

test("lines up two real archives by broadcast time and links their controls", async ({
  firefoxPage,
  openPopup,
}) => {
  test.skip(STREAMS.length !== 2, "set ARCHIVE_STREAMS to two archive video ids");
  test.setTimeout(180_000);
  const [firstId, secondId] = STREAMS as [string, string];
  const second = await firefoxPage.browser().newPage({ type: "window" });
  await openWatchPage(firefoxPage, firstId, 600);
  await openWatchPage(second, secondId, 60);
  expect(await gap(firefoxPage, second)).toBeGreaterThan(5);

  const popup = await openPopup();
  await addAllStreams(popup, 2);
  // The popup closes in real use too; in headless Firefox it would keep the focus, and
  // media in unfocused windows stops.
  await popup.close();
  await expect.poll(() => gap(firefoxPage, second), { timeout: 30_000 }).toBeLessThan(1);

  // A user seek on either player moves both, whichever was being followed.
  const before = await read(firefoxPage);
  await second.evaluate(() => {
    (document.querySelector("video") as HTMLVideoElement).currentTime += 300;
  });
  await expect
    .poll(async () => (await read(firefoxPage)).position - before.position, { timeout: 30_000 })
    .toBeGreaterThan(250);
  await expect.poll(() => gap(firefoxPage, second), { timeout: 30_000 }).toBeLessThan(1);

  await firefoxPage.evaluate(() => (document.querySelector("video") as HTMLVideoElement).pause());
  await expect.poll(async () => (await read(second)).paused, { timeout: 10_000 }).toBe(true);
});
