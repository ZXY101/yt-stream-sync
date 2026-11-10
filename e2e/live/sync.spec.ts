import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { Frame } from "puppeteer-core";

import { expect, test } from "../fixtures/test.ts";

// Opt-in: needs network and a stream that is live right now, e.g.
// LIVE_STREAM=<video id> npm run test:e2e:live
const STREAM = process.env.LIVE_STREAM ?? "";

function serveMultiview(): Promise<Server> {
  const embed = `https://www.youtube.com/embed/${STREAM}?autoplay=1&mute=1`;
  const html = `<!doctype html><body><iframe src="${embed}"></iframe><iframe src="${embed}"></iframe>`;
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(html);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

interface Reading {
  latency: number;
  rate: number;
}

function read(frame: Frame): Promise<Reading> {
  return frame.evaluate(() => {
    const player = document.getElementById("movie_player") as unknown as {
      getStatsForNerds: () => Record<string, string>;
    };
    const latency = Number.parseFloat(player.getStatsForNerds().live_latency_secs ?? "");
    return { latency, rate: document.querySelector("video")?.playbackRate ?? Number.NaN };
  });
}

function setPaused(frame: Frame, paused: boolean): Promise<void> {
  return frame.evaluate((pause) => {
    const player = document.getElementById("movie_player") as unknown as Record<string, () => void>;
    player[pause ? "pauseVideo" : "playVideo"]?.();
  }, paused);
}

test("closes a real gap between two live players", async ({ firefoxPage }) => {
  test.skip(!STREAM, "set LIVE_STREAM to a live video id");
  test.setTimeout(150_000);
  const server = await serveMultiview();
  const { port } = server.address() as AddressInfo;
  await firefoxPage.goto(`http://127.0.0.1:${port}/`);
  await expect.poll(() => firefoxPage.frames().length, { timeout: 20_000 }).toBe(3);
  const [, first, second] = firefoxPage.frames() as [Frame, Frame, Frame];
  await expect
    .poll(
      async () => (await Promise.all([read(first), read(second)])).every((r) => r.latency > 0),
      {
        timeout: 40_000,
      },
    )
    .toBe(true);

  // A user pause takes a player out of the group; when it plays again it's 3 s behind.
  await setPaused(second, true);
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  await setPaused(second, false);

  await expect.poll(async () => (await read(first)).rate, { timeout: 15_000 }).toBe(0.92);
  await expect
    .poll(
      async () => {
        const [a, b] = await Promise.all([read(first), read(second)]);
        return { inSync: Math.abs(a.latency - b.latency) < 0.5, rates: [a.rate, b.rate] };
      },
      { timeout: 90_000, intervals: [2_000] },
    )
    .toEqual({ inSync: true, rates: [1, 1] });
  server.close();
});
