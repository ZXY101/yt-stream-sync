import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { Frame, Page } from "puppeteer-core";

import { addAllStreams } from "../fixtures/popup.ts";
import { expect, test } from "../fixtures/test.ts";

// Opt-in: two or more archives of the same collab with their broadcast start times, e.g.
// AUDIO_STREAMS=<id>@<ISO start>,<id>@<ISO start>[,…] npm run test:e2e:live
const STREAMS = (process.env.AUDIO_STREAMS ?? "")
  .split(",")
  .filter(Boolean)
  .map((entry) => {
    const [id, start] = entry.split("@") as [string, string];
    return { id, start: Date.parse(start) / 1000 };
  });

// Embeds have no start time, so they're aligned as they were when added: they start at the
// same broadcast moment by their start times, which are off by each streamer's encoder
// delay. The audio match has to find those offsets; a second match then finding ~0 s shows
// it applied them right (start times are no ground truth).
const MOMENT = 1500;

function serveEmbeds(starts: number[]): Promise<Server> {
  const frames = STREAMS.map(
    (stream, index) =>
      `<iframe width=320 height=180 allow=autoplay src="https://www.youtube.com/embed/${stream.id}?autoplay=1&mute=1&start=${starts[index]}"></iframe>`,
  ).join("");
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><body>${frames}</body>`);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function position(frame: Frame): Promise<number> {
  return frame.evaluate(() => document.querySelector("video")?.currentTime ?? 0);
}

async function send(popup: Page, message: unknown): Promise<{ audio: unknown }> {
  return popup.evaluate(async (body) => {
    type Runtime = { sendMessage: (message: unknown) => Promise<{ audio: unknown }> };
    const api = (globalThis as unknown as { browser: { runtime: Runtime } }).browser;
    return api.runtime.sendMessage(body);
  }, message);
}

async function matched(popup: Page) {
  await expect
    .poll(async () => (await send(popup, { type: "getStatus" })).audio, {
      timeout: 150_000,
      intervals: [3_000],
    })
    .toMatchObject({ state: "matched" });
  return (await send(popup, { type: "getStatus" })).audio as {
    lags: Record<string, number>;
    unmatched?: string[];
  };
}

test("matches real archives in embeds by their audio", async ({ firefoxPage, openPopup }) => {
  test.skip(STREAMS.length < 2, "set AUDIO_STREAMS to two or more archives with start times");
  test.setTimeout(420_000);
  const earliest = Math.min(...STREAMS.map((stream) => stream.start));
  const starts = STREAMS.map((stream) => Math.round(MOMENT + earliest - stream.start));
  const server = await serveEmbeds(starts);
  const { port } = server.address() as AddressInfo;
  await firefoxPage.goto(`http://127.0.0.1:${port}/`);
  await expect
    .poll(() => firefoxPage.frames().length, { timeout: 20_000 })
    .toBe(STREAMS.length + 1);
  const frames = firefoxPage.frames().slice(1);
  for (const [index, frame] of frames.entries()) {
    const at = starts[index] ?? 0;
    // oxlint-disable-next-line no-await-in-loop
    await expect.poll(() => position(frame), { timeout: 90_000 }).toBeGreaterThan(at);
  }

  const popup = await openPopup();
  await addAllStreams(popup, STREAMS.length);
  const first = await matched(popup);
  console.warn("first match", JSON.stringify(first));
  expect(first.unmatched ?? []).toEqual([]);
  expect(Object.keys(first.lags)).toHaveLength(STREAMS.length - 1);

  // Let the correction (a regroup) play out, then listen again.
  await new Promise((resolve) => setTimeout(resolve, 8_000));
  await send(popup, { type: "rematchAudio" });
  const again = await matched(popup);
  console.warn("second match", JSON.stringify(again));
  for (const lag of Object.values(again.lags)) {
    expect(Math.abs(lag)).toBeLessThan(0.15);
  }
  server.close();
});
