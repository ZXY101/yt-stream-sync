import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { Frame, Page } from "puppeteer-core";

import { addAllStreams } from "../fixtures/popup.ts";
import { expect, test } from "../fixtures/test.ts";

// Opt-in: two archives of the same collab with their broadcast start times, e.g.
// AUDIO_STREAMS=<id>@<ISO start>,<id>@<ISO start> npm run test:e2e:live
const STREAMS = (process.env.AUDIO_STREAMS ?? "")
  .split(",")
  .filter(Boolean)
  .map((entry) => {
    const [id, start] = entry.split("@") as [string, string];
    return { id, start: Date.parse(start) / 1000 };
  });

// Embeds have no start time, so they're aligned as they were when added: start them out of
// step and let the audio match find it. (Start times include each streamer's encoder delay,
// so they're no ground truth; a second match finding ~0 s is.)
const OUT_OF_STEP = 2;

function serveEmbeds(starts: number[]): Promise<Server> {
  const frames = STREAMS.map(
    (stream, index) =>
      `<iframe width=480 height=270 allow=autoplay src="https://www.youtube.com/embed/${stream.id}?autoplay=1&mute=1&start=${starts[index]}"></iframe>`,
  ).join("");
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><body>${frames}</body>`);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function position(frame: Frame): Promise<number> {
  return frame.evaluate(() => (document.querySelector("video") as HTMLVideoElement).currentTime);
}

/** Seconds the second stream is behind the first in broadcast time (0 when in step). */
async function behind(first: Frame, second: Frame): Promise<number> {
  const [a, b] = await Promise.all([position(first), position(second)]);
  const [startA, startB] = [STREAMS[0]?.start ?? 0, STREAMS[1]?.start ?? 0];
  return startA + a - (startB + b);
}

async function audioStatus(popup: Page): Promise<unknown> {
  return popup.evaluate(async () => {
    type Runtime = { sendMessage: (message: unknown) => Promise<{ audio: unknown }> };
    const api = (globalThis as unknown as { browser: { runtime: Runtime } }).browser;
    return (await api.runtime.sendMessage({ type: "getStatus" })).audio;
  });
}

test("matches two real archives in embeds by their audio", async ({ firefoxPage, openPopup }) => {
  test.skip(STREAMS.length !== 2, "set AUDIO_STREAMS to two archives with start times");
  test.setTimeout(180_000);
  const [first, second] = STREAMS as unknown as [{ start: number }, { start: number }];
  const at = 600;
  const secondAt = Math.round(at + first.start - second.start - OUT_OF_STEP);
  const server = await serveEmbeds([at, secondAt]);
  const { port } = server.address() as AddressInfo;
  await firefoxPage.goto(`http://127.0.0.1:${port}/`);
  await expect.poll(() => firefoxPage.frames().length, { timeout: 20_000 }).toBe(3);
  const [, a, b] = firefoxPage.frames() as [Frame, Frame, Frame];
  await expect.poll(() => position(b), { timeout: 40_000 }).toBeGreaterThan(secondAt);

  const popup = await openPopup();
  await addAllStreams(popup, 2);
  await expect
    .poll(() => audioStatus(popup), { timeout: 90_000, intervals: [3_000] })
    .toMatchObject({ state: "matched" });
  console.warn("first match", JSON.stringify(await audioStatus(popup)));
  // Let the correction (a regroup) play out before listening again.
  await new Promise((resolve) => setTimeout(resolve, 8_000));

  // Once applied, a fresh match must find the streams in step.
  await popup.evaluate(async () => {
    type Runtime = { sendMessage: (message: unknown) => Promise<unknown> };
    const api = (globalThis as unknown as { browser: { runtime: Runtime } }).browser;
    await api.runtime.sendMessage({ type: "rematchAudio" });
  });
  await expect
    .poll(() => audioStatus(popup), { timeout: 90_000, intervals: [3_000] })
    .toMatchObject({ state: "matched" });
  const again = (await audioStatus(popup)) as { lags: Record<string, number> };
  console.warn("second match", JSON.stringify(again), "start-time gap now", await behind(a, b));
  for (const lag of Object.values(again.lags)) {
    expect(Math.abs(lag)).toBeLessThan(0.15);
  }
  server.close();
});
