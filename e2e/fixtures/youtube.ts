import { readFileSync } from "node:fs";

import type { Frame, Page } from "puppeteer-core";

const FAKE_PLAYER = readFileSync(new URL("../pages/fake-player.html", import.meta.url), "utf8");
const EMBED = "https://www.youtube.com/embed/";

export interface FakeStream {
  id: string;
  latency: number;
}

const MULTIVIEW = "https://multiview.test/";

function multiviewPage(streams: FakeStream[]): string {
  const frames = streams.map(
    ({ id, latency }) => `<iframe src="${EMBED}${id}?latency=${latency}&title=${id}"></iframe>`,
  );
  return `<!doctype html><title>Multiview</title><body>${frames.join("")}</body>`;
}

/**
 * Opens a multiview-like page with one fake live player per stream. Requests are answered
 * locally (YouTube embeds get the fake player page) and everything else is blocked, so the
 * real manifest's content scripts run without any network access.
 */
export async function openMultiview(page: Page, streams: FakeStream[]): Promise<void> {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(EMBED)) {
      void request.respond({ status: 200, contentType: "text/html", body: FAKE_PLAYER });
    } else if (url.startsWith(MULTIVIEW)) {
      void request.respond({ status: 200, contentType: "text/html", body: multiviewPage(streams) });
    } else {
      void request.abort();
    }
  });
  await page.goto(MULTIVIEW);
}

export async function streamFrame(page: Page, id: string): Promise<Frame> {
  const frame = await page.waitForFrame((candidate) => candidate.url().startsWith(EMBED + id));
  await frame.waitForFunction(() => "fakeLatency" in window);
  return frame;
}

export interface StreamReading {
  latency: number;
  rate: number;
  state: number;
}

export function readStream(frame: Frame): Promise<StreamReading> {
  return frame.evaluate(() => {
    const fake = window as unknown as { fakeLatency: () => number; fakeState: () => number };
    const rate = document.querySelector("video")?.playbackRate ?? Number.NaN;
    return { latency: fake.fakeLatency(), rate, state: fake.fakeState() };
  });
}
