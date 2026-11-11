import { describe, expect, it, vi } from "vitest";

import type { ArchiveReport, PlayerReport } from "../../lib/messages.ts";
import { createGroupAlign } from "./group-align.ts";

const SETTINGS = { enabled: true, address: "https://server.test", token: "fake-token" };

function archive(videoId: string, startTime?: number): ArchiveReport {
  return {
    kind: "archive",
    videoId,
    startTime,
    title: videoId,
    channel: "Channel",
    state: "playing",
    playbackRate: 1,
    position: 100,
    duration: 9000,
    bufferAhead: 10,
    userActions: 0,
  };
}

const URL_B = "https://www.youtube.com/watch?v=b";

function setUp(reports: Record<string, PlayerReport>) {
  let ids = Object.keys(reports);
  const clock = { now: 0 };
  const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
    const body = init?.method === "POST" ? { id: "job-1" } : {};
    return new Response(JSON.stringify(body), { status: init?.method === "POST" ? 202 : 204 });
  });
  const nudge = vi.fn<(id: string, seconds: number) => void>();
  const align = createGroupAlign({
    group: { ids: () => ids, offset: () => 0, nudge, report: (id) => reports[id] },
    onApplied: () => undefined,
    now: () => clock.now,
    fetcher,
  });
  return { align, fetcher, clock, setIds: (next: string[]) => (ids = next) };
}

function methods(fetcher: ReturnType<typeof vi.fn<typeof fetch>>): string[] {
  return fetcher.mock.calls.map(([, init]) => init?.method ?? "GET");
}

describe("createGroupAlign", () => {
  it("is off until enabled in the settings", () => {
    const { align } = setUp({ "1:0": archive("a", 1000), "2:0": archive("b", 1099) });
    expect(align.status()).toEqual({ state: "off" });
    align.setSettings({ ...SETTINGS, enabled: false });
    expect(align.status()).toEqual({ state: "off" });
    align.setSettings(SETTINGS);
    expect(align.status()).toEqual({ state: "ready" });
  });

  it("sends the group's watch page links", async () => {
    const { align, fetcher } = setUp({ "1:0": archive("aaa", 1000), "2:0": archive("bbb", 1099) });
    align.setSettings(SETTINGS);
    align.start();
    expect(align.status()).toMatchObject({ state: "running", progress: 0 });
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled());
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as { urls: string[] };
    expect(body.urls).toEqual([
      "https://www.youtube.com/watch?v=aaa",
      "https://www.youtube.com/watch?v=bbb",
    ]);
  });

  it("only aligns archives that know their start time", () => {
    const { align, fetcher } = setUp({ "1:0": archive("a", 1000), "2:0": archive("b") });
    align.setSettings(SETTINGS);
    align.start();
    expect(align.status()).toEqual({ state: "ready" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("stops when the group changes while it runs", async () => {
    const reports = { "1:0": archive("a", 1000), "2:0": archive("b", 1099) };
    const { align, fetcher, setIds } = setUp(reports);
    align.setSettings(SETTINGS);
    align.start();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    align.tick();
    expect(align.status()).toMatchObject({ state: "running", progress: 0 });
    setIds(["1:0"]);
    align.tick();
    expect(align.status()).toEqual({ state: "ready" });
    await vi.waitFor(() => expect(methods(fetcher)).toContain("DELETE"));
  });

  it("forgets the last outcome once the group changes", async () => {
    const reports = { "1:0": archive("a", 1000), "2:0": archive("b", 1099) };
    const { align, fetcher, setIds, clock } = setUp(reports);
    const done = { state: "done", progress: 1, offsets: { [URL_B]: 31 }, error: null };
    fetcher.mockImplementation(async (_url, init) => {
      if (init?.method === "POST") {
        return new Response(JSON.stringify({ id: "job-1" }), { status: 202 });
      }
      return new Response(JSON.stringify(done), { status: init?.method ? 204 : 200 });
    });
    align.setSettings(SETTINGS);
    align.start();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => {
      clock.now += 5;
      align.tick();
      expect(align.status()).toEqual({ state: "done", unmatched: [] });
    });

    align.tick();
    expect(align.status()).toEqual({ state: "done", unmatched: [] });
    setIds(["1:0", "3:0"]);
    align.tick();
    expect(align.status()).toEqual({ state: "ready" });
  });

  it("stops when the settings change", async () => {
    const { align, fetcher } = setUp({ "1:0": archive("a", 1000), "2:0": archive("b", 1099) });
    align.setSettings(SETTINGS);
    align.start();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    align.setSettings(undefined);
    expect(align.status()).toEqual({ state: "off" });
    await vi.waitFor(() => expect(methods(fetcher)).toContain("DELETE"));
  });
});
