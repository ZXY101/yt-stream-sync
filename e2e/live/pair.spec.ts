import { writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import type { Frame, Page } from "puppeteer-core";

import { addAllStreams } from "../fixtures/popup.ts";
import { expect, test } from "../fixtures/test.ts";

// Opt-in: two different streams of the same live collab, live right now, e.g.
// LIVE_PAIR=<id>,<id> npx playwright test --project=live e2e/live/pair.spec.ts
// Watches them for a few minutes: latency sync, then audio matching on a live group.
// Writes a timeline to test-results/live-pair.json.
const IDS = (process.env.LIVE_PAIR ?? "").split(",").filter(Boolean);
const WATCH_MS = Number(process.env.LIVE_PAIR_WATCH_S ?? "300") * 1000;

function serveEmbeds(): Promise<Server> {
  const frames = IDS.map(
    (id) =>
      `<iframe width=320 height=180 allow=autoplay src="https://www.youtube.com/embed/${id}?autoplay=1&mute=1"></iframe>`,
  ).join("");
  const server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html");
    response.end(`<!doctype html><body>${frames}</body>`);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

interface Reading {
  latency: number;
  buffer: number;
  rate: number;
  paused: boolean;
  time: number;
}

const NO_READING: Reading = {
  latency: Number.NaN,
  buffer: Number.NaN,
  rate: Number.NaN,
  paused: false,
  time: Number.NaN,
};

/** A busy frame sometimes doesn't answer; a missing reading is logged, not fatal. */
async function read(frame: Frame): Promise<Reading> {
  const timeout = new Promise<Reading>((resolve) => {
    setTimeout(() => resolve(NO_READING), 3_000);
  });
  return Promise.race([readNow(frame).catch(() => NO_READING), timeout]);
}

function readNow(frame: Frame): Promise<Reading> {
  return frame.evaluate(() => {
    const player = document.getElementById("movie_player") as unknown as {
      getStatsForNerds: () => Record<string, string>;
    };
    const stats = player.getStatsForNerds();
    const video = document.querySelector("video");
    return {
      latency: Number.parseFloat(stats.live_latency_secs ?? ""),
      buffer: Number.parseFloat(stats.buffer_health_seconds ?? ""),
      rate: video?.playbackRate ?? Number.NaN,
      paused: video?.paused ?? true,
      time: video?.currentTime ?? Number.NaN,
    };
  });
}

function send<T>(popup: Page, message: unknown): Promise<T> {
  return popup.evaluate(async (body) => {
    type Runtime = { sendMessage: (message: unknown) => Promise<unknown> };
    const api = (globalThis as unknown as { browser: { runtime: Runtime } }).browser;
    return api.runtime.sendMessage(body);
  }, message) as Promise<T>;
}

interface Status {
  audio: { state: string; lags?: Record<string, number>; unmatched?: string[] };
}

test("syncs two real live streams of one collab, then by audio", async ({
  firefoxPage,
  openPopup,
}) => {
  test.skip(IDS.length < 2, "set LIVE_PAIR to two live video ids");
  test.setTimeout(WATCH_MS + 240_000);
  const server = await serveEmbeds();
  const { port } = server.address() as AddressInfo;
  await firefoxPage.goto(`http://127.0.0.1:${port}/`);
  await expect.poll(() => firefoxPage.frames().length, { timeout: 20_000 }).toBe(IDS.length + 1);
  const frames = firefoxPage.frames().slice(1);
  await expect
    .poll(async () => (await Promise.all(frames.map(readNow))).every((r) => r.latency > 0), {
      timeout: 60_000,
    })
    .toBe(true);

  const popup = await openPopup();
  await addAllStreams(popup, IDS.length);

  const started = Date.now();
  const timeline: unknown[] = [];
  let rematched = false;
  let firstMatch: Status["audio"] | undefined;
  let secondMatch: Status["audio"] | undefined;
  while (Date.now() - started < WATCH_MS) {
    // oxlint-disable-next-line no-await-in-loop
    const [readings, status] = await Promise.all([
      Promise.all(frames.map(read)),
      send<Status>(popup, { type: "getStatus" }),
    ]);
    const t = Math.round((Date.now() - started) / 1000);
    timeline.push({ t, readings, audio: status.audio });
    console.warn(
      t,
      readings
        .map(
          (r) =>
            `lat ${r.latency.toFixed(2)} buf ${r.buffer.toFixed(1)} x${r.rate}${r.paused ? " P" : ""}`,
        )
        .join(" | "),
      JSON.stringify(status.audio),
    );
    if (status.audio.state === "matched") {
      if (!firstMatch) {
        firstMatch = status.audio;
      } else if (
        rematched &&
        !secondMatch &&
        JSON.stringify(status.audio) !== JSON.stringify(firstMatch)
      ) {
        secondMatch = status.audio;
      }
      if (!rematched && t > 20 && Date.now() - started < WATCH_MS - 90_000) {
        // Let the first correction play out, then listen again once.
        // oxlint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        // oxlint-disable-next-line no-await-in-loop
        await send(popup, { type: "rematchAudio" });
        rematched = true;
      }
    }
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  const { log } = await send<{ log: string }>(popup, { type: "getDebugLog" });
  writeFileSync(
    "test-results/live-pair.json",
    JSON.stringify({ ids: IDS, firstMatch, secondMatch, timeline, log }, null, 1),
  );
  console.warn("first match", JSON.stringify(firstMatch), "second", JSON.stringify(secondMatch));
  server.close();

  expect(firstMatch).toBeDefined();
  // At the end both play at normal speed.
  const end = await Promise.all(frames.map(readNow));
  expect(end.map((r) => r.rate)).toEqual(IDS.map(() => 1));
});
