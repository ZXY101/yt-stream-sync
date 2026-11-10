import { popupRows, tickAllStreams, toggleStream } from "../fixtures/popup.ts";
import { expect, test } from "../fixtures/test.ts";
import { openMultiview, readStream, streamFrame } from "../fixtures/youtube.ts";

test("leaves streams alone until the user ticks them", async ({ firefoxPage, openPopup }) => {
  await openMultiview(firefoxPage, [
    { id: "first", latency: 4 },
    { id: "second", latency: 6 },
  ]);
  const first = await streamFrame(firefoxPage, "first");
  const popup = await openPopup();

  await expect
    .poll(() => popupRows(popup))
    .toEqual([
      expect.stringMatching(/^first.*Not synced/),
      expect.stringMatching(/^second.*Not synced/),
    ]);
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  expect((await readStream(first)).rate).toBe(1);
});

test("slows the stream that's ahead until both show the same moment", async ({
  firefoxPage,
  openPopup,
}) => {
  test.setTimeout(60_000);
  await openMultiview(firefoxPage, [
    { id: "ahead", latency: 4 },
    { id: "behind", latency: 5 },
  ]);
  const ahead = await streamFrame(firefoxPage, "ahead");
  const behind = await streamFrame(firefoxPage, "behind");
  const popup = await openPopup();

  await tickAllStreams(popup, 2);

  await expect.poll(async () => (await readStream(ahead)).rate, { timeout: 5_000 }).toBe(0.92);
  expect((await readStream(behind)).rate).toBe(1);
  await expect
    .poll(() => popupRows(popup))
    .toEqual([
      expect.stringMatching(/^ahead.*Slowed to 0\.92×/),
      expect.stringMatching(/^behind.*In sync/),
    ]);
  await expect
    .poll(
      async () => {
        const [a, b] = await Promise.all([readStream(ahead), readStream(behind)]);
        return { inSync: Math.abs(a.latency - b.latency) < 0.3, rate: a.rate };
      },
      { timeout: 30_000, intervals: [1_000] },
    )
    .toEqual({ inSync: true, rate: 1 });
});

test("pauses the leader for a big gap and resumes it in sync", async ({
  firefoxPage,
  openPopup,
}) => {
  test.setTimeout(60_000);
  await openMultiview(firefoxPage, [
    { id: "far-ahead", latency: 4 },
    { id: "far-behind", latency: 14 },
  ]);
  const ahead = await streamFrame(firefoxPage, "far-ahead");
  const behind = await streamFrame(firefoxPage, "far-behind");
  await tickAllStreams(await openPopup(), 2);

  await expect.poll(async () => (await readStream(ahead)).state, { timeout: 5_000 }).toBe(2);
  await expect
    .poll(
      async () => {
        const [a, b] = await Promise.all([readStream(ahead), readStream(behind)]);
        return { playing: a.state === 1, inSync: Math.abs(a.latency - b.latency) < 0.3 };
      },
      { timeout: 40_000, intervals: [1_000] },
    )
    .toEqual({ playing: true, inSync: true });
});

test("hands a stream back at normal speed when it's unticked", async ({
  firefoxPage,
  openPopup,
}) => {
  await openMultiview(firefoxPage, [
    { id: "lead", latency: 4 },
    { id: "trail", latency: 7 },
  ]);
  const lead = await streamFrame(firefoxPage, "lead");
  const popup = await openPopup();
  await tickAllStreams(popup, 2);
  await expect.poll(async () => (await readStream(lead)).rate, { timeout: 5_000 }).toBe(0.92);

  await toggleStream(popup, "lead");

  await expect.poll(async () => (await readStream(lead)).rate, { timeout: 5_000 }).toBe(1);
  await expect.poll(() => popupRows(popup)).toContainEqual(expect.stringMatching(/^lead.*Not/));
});
