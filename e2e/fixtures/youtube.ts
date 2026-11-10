import { readFileSync } from "node:fs";

import type { Frame, Page } from "puppeteer-core";

function readPage(name: string): string {
  return readFileSync(new URL(`../pages/${name}`, import.meta.url), "utf8");
}

const FAKE_LIVE = readPage("fake-player.html");
const FAKE_ARCHIVE = readPage("fake-archive.html");
const EMBED = "https://www.youtube.com/embed/";

/** A fake live stream, or with `position` a fake archive (`start`: ISO broadcast start). */
export type FakeStream =
  { id: string; latency: number } | { id: string; position: number; start?: string; load?: number };

function embedUrl(stream: FakeStream): string {
  const query = new URLSearchParams({ title: stream.id });
  if ("latency" in stream) {
    query.set("latency", String(stream.latency));
  } else {
    query.set("kind", "archive");
    query.set("position", String(stream.position));
    if (stream.start) {
      query.set("start", stream.start);
    }
    if (stream.load !== undefined) {
      query.set("load", String(stream.load));
    }
  }
  return `${EMBED}${stream.id}?${query}`;
}

const MULTIVIEW = "https://multiview.test/";

function multiviewPage(streams: FakeStream[]): string {
  const frames = streams.map(
    (stream) => `<iframe src="${embedUrl(stream).replaceAll("&", "&amp;")}"></iframe>`,
  );
  return `<!doctype html><title>Multiview</title><body>${frames.join("")}</body>`;
}

/**
 * Opens a multiview-like page with one fake player per stream. Requests are answered
 * locally (YouTube embeds get the fake player page) and everything else is blocked, so the
 * real manifest's content scripts run without any network access.
 */
export async function openMultiview(page: Page, streams: FakeStream[]): Promise<void> {
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    if (url.startsWith(EMBED)) {
      const body = url.includes("kind=archive") ? FAKE_ARCHIVE : FAKE_LIVE;
      void request.respond({ status: 200, contentType: "text/html", body });
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
  await frame.waitForFunction(() => "fakeState" in window);
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

export interface ArchiveReading {
  position: number;
  rate: number;
  state: number;
}

export function readArchive(frame: Frame): Promise<ArchiveReading> {
  return frame.evaluate(() => {
    const fake = window as unknown as { fakePosition: () => number; fakeState: () => number };
    const rate = document.querySelector("video")?.playbackRate ?? Number.NaN;
    return { position: fake.fakePosition(), rate, state: fake.fakeState() };
  });
}

/** Does what a user would on the fake archive player itself. */
export function userAction(
  frame: Frame,
  action: { type: "seek"; position: number } | { type: "pause" } | { type: "play" },
): Promise<void> {
  return frame.evaluate((wanted) => {
    const user = (window as unknown as { fakeUser: Record<string, (value?: number) => void> })
      .fakeUser;
    user[wanted.type]?.("position" in wanted ? wanted.position : undefined);
  }, action);
}
