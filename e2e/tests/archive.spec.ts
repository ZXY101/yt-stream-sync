import type { Frame } from "puppeteer-core";

import { tickAllStreams, toggleStream } from "../fixtures/popup.ts";
import { expect, test } from "../fixtures/test.ts";
import { openMultiview, readArchive, streamFrame, userAction } from "../fixtures/youtube.ts";

// Like the two real test archives: the second broadcast started 70 s after the first.
const START_A = "2026-11-10T12:59:40+00:00";
const START_B = "2026-11-10T13:00:50+00:00";
const APART = 70;

/** How far apart the two archives are in broadcast time (0 when in sync). */
async function gap(first: Frame, second: Frame): Promise<number> {
  const [a, b] = await Promise.all([readArchive(first), readArchive(second)]);
  return Math.abs(a.position - (b.position + APART));
}

async function openPair(firefoxPage: Parameters<typeof openMultiview>[0]) {
  await openMultiview(firefoxPage, [
    { id: "pov-a", position: 300, start: START_A },
    { id: "pov-b", position: 40, start: START_B },
  ]);
  return {
    first: await streamFrame(firefoxPage, "pov-a"),
    second: await streamFrame(firefoxPage, "pov-b"),
  };
}

test("lines archives up by their broadcast start times once ticked", async ({
  firefoxPage,
  openPopup,
}) => {
  const { first, second } = await openPair(firefoxPage);
  expect(await gap(first, second)).toBeGreaterThan(5);

  await tickAllStreams(await openPopup(), 2);

  await expect.poll(() => gap(first, second), { timeout: 10_000 }).toBeLessThan(0.5);
});

test("follows the user's seek, pause and play on any archive", async ({
  firefoxPage,
  openPopup,
}) => {
  const { first, second } = await openPair(firefoxPage);
  await tickAllStreams(await openPopup(), 2);
  await expect.poll(() => gap(first, second), { timeout: 10_000 }).toBeLessThan(0.5);

  await userAction(second, { type: "seek", position: 2000 });
  await expect.poll(async () => (await readArchive(first)).position).toBeGreaterThan(2060);
  await expect.poll(() => gap(first, second)).toBeLessThan(0.5);

  await userAction(first, { type: "pause" });
  await expect.poll(async () => (await readArchive(second)).state).toBe(2);

  await userAction(second, { type: "play" });
  await expect.poll(async () => (await readArchive(first)).state).toBe(1);
});

test("keeps the user's nudge between archives", async ({ firefoxPage, openPopup }) => {
  const { first, second } = await openPair(firefoxPage);
  const popup = await openPopup();
  await tickAllStreams(popup, 2);
  await expect.poll(() => gap(first, second), { timeout: 10_000 }).toBeLessThan(0.5);

  await popup.locator("::-p-aria(Move pov-b ahead 1 second)").click();
  await popup.locator("::-p-aria(Move pov-b ahead 1 second)").click();

  // pov-b now shows 2 s ahead of pov-a.
  await expect
    .poll(async () => {
      const [a, b] = await Promise.all([readArchive(first), readArchive(second)]);
      return Math.abs(b.position + APART - a.position - 2);
    })
    .toBeLessThan(0.5);
  await toggleStream(popup, "pov-b");
});
