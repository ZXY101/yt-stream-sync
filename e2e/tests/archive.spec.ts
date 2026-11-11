import type { Frame } from "puppeteer-core";

import { addAllStreams, removeStream } from "../fixtures/popup.ts";
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

async function states(first: Frame, second: Frame): Promise<number[]> {
  const [a, b] = await Promise.all([readArchive(first), readArchive(second)]);
  return [a.state, b.state];
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

  await addAllStreams(await openPopup(), 2);

  await expect.poll(() => gap(first, second), { timeout: 10_000 }).toBeLessThan(0.5);
});

test("follows the user's seek, pause and play on any archive", async ({
  firefoxPage,
  openPopup,
}) => {
  const { first, second } = await openPair(firefoxPage);
  await addAllStreams(await openPopup(), 2);
  await expect.poll(() => gap(first, second), { timeout: 10_000 }).toBeLessThan(0.5);
  // Adding them was a regroup; act once both play again.
  await expect.poll(() => states(first, second), { timeout: 10_000 }).toEqual([1, 1]);

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
  await addAllStreams(popup, 2);
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
  await removeStream(popup, "pov-b");
});

test("moves an archive by a typed offset of minutes in one go", async ({
  firefoxPage,
  openPopup,
}) => {
  const { first, second } = await openPair(firefoxPage);
  const popup = await openPopup();
  await addAllStreams(popup, 2);
  await expect.poll(() => gap(first, second), { timeout: 10_000 }).toBeLessThan(0.5);

  await popup.locator('input[aria-label^="Offset of pov-b"]').click();
  await popup.keyboard.type("1:30");
  await popup.keyboard.press("Enter");

  await expect
    .poll(async () => {
      const [a, b] = await Promise.all([readArchive(first), readArchive(second)]);
      return Math.abs(b.position + APART - a.position - 90);
    })
    .toBeLessThan(0.5);
  await removeStream(popup, "pov-b");
});

test("after a seek, waits for the slower stream to buffer and starts both together", async ({
  firefoxPage,
  openPopup,
}) => {
  await openMultiview(firefoxPage, [
    { id: "fast", position: 300, start: START_A, load: 10 },
    { id: "slow", position: 40, start: START_B, load: 1 },
  ]);
  const fast = await streamFrame(firefoxPage, "fast");
  const slow = await streamFrame(firefoxPage, "slow");
  await addAllStreams(await openPopup(), 2);
  await expect.poll(() => gap(fast, slow), { timeout: 15_000 }).toBeLessThan(0.5);
  // Adding them was a regroup too; seek once both are playing again.
  await expect
    .poll(async () => [(await readArchive(fast)).state, (await readArchive(slow)).state])
    .toEqual([1, 1]);

  await userAction(fast, { type: "seek", position: 5000 });

  // The fast one has buffered long before the slow one, but it waits paused for it.
  await expect.poll(async () => (await readArchive(fast)).state).toBe(2);
  await expect
    .poll(
      async () => {
        const [a, b] = await Promise.all([readArchive(fast), readArchive(slow)]);
        return { bothPlaying: a.state === 1 && b.state === 1, near: b.position > 4900 };
      },
      { timeout: 15_000 },
    )
    .toEqual({ bothPlaying: true, near: true });
  expect(await gap(fast, slow)).toBeLessThan(0.3);
});
