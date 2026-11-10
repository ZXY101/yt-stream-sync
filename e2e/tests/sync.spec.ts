import {
  addAllStreams,
  addButtons,
  groupRows,
  removeStream,
  showPopupForStreams,
} from "../fixtures/popup.ts";
import { expect, test } from "../fixtures/test.ts";
import { openMultiview, readStream, streamFrame } from "../fixtures/youtube.ts";

test("offers this tab's streams and leaves them alone until added", async ({
  firefoxPage,
  openPopup,
}) => {
  await openMultiview(firefoxPage, [
    { id: "first", latency: 4 },
    { id: "second", latency: 6 },
  ]);
  const first = await streamFrame(firefoxPage, "first");
  const popup = await openPopup();
  await showPopupForStreams(popup, 2);

  await expect.poll(() => addButtons(popup)).toEqual(["Add first to sync", "Add second to sync"]);
  expect(await groupRows(popup)).toEqual([]);
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

  await addAllStreams(popup, 2);

  await expect.poll(async () => (await readStream(ahead)).rate, { timeout: 5_000 }).toBe(0.92);
  expect((await readStream(behind)).rate).toBe(1);
  await expect
    .poll(() => groupRows(popup))
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
  await addAllStreams(await openPopup(), 2);

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

test("hands a stream back at normal speed when it's removed", async ({
  firefoxPage,
  openPopup,
}) => {
  await openMultiview(firefoxPage, [
    { id: "lead", latency: 4 },
    { id: "trail", latency: 7 },
  ]);
  const lead = await streamFrame(firefoxPage, "lead");
  const popup = await openPopup();
  await addAllStreams(popup, 2);
  await expect.poll(async () => (await readStream(lead)).rate, { timeout: 5_000 }).toBe(0.92);

  await removeStream(popup, "lead");

  await expect.poll(async () => (await readStream(lead)).rate, { timeout: 5_000 }).toBe(1);
  await expect.poll(() => groupRows(popup)).toEqual([expect.stringMatching(/^trail/)]);
  expect(await addButtons(popup)).toEqual(["Add lead to sync"]);
});
