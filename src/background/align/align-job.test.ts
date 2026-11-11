import { describe, expect, it, vi } from "vitest";

import { createAlignJob } from "./align-job.ts";
import { AlignError, type AlignClient, type AlignJobStatus } from "./client.ts";
import type { AlignMember } from "./offsets.ts";

const MEMBERS: AlignMember[] = [
  { id: "1:0", url: "u-a", startTime: 1000, offset: 0 },
  { id: "2:0", url: "u-b", startTime: 1099, offset: 0 },
];

function running(progress: number): AlignJobStatus {
  return {
    state: "downloading",
    progress,
    offsets: {},
    error: null,
    streams: [
      { url: "u-a", stage: "ready", downloaded: 1 },
      { url: "u-b", stage: "downloading", downloaded: 0.2 },
      { url: "u-unknown", stage: "downloading", downloaded: 0 },
    ],
  };
}

function fakeClient() {
  return {
    start: vi.fn<AlignClient["start"]>().mockResolvedValue("job-1"),
    check: vi.fn<AlignClient["check"]>(),
    remove: vi.fn<AlignClient["remove"]>().mockResolvedValue(undefined),
  };
}

async function settle() {
  for (let round = 0; round < 5; round += 1) {
    // oxlint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

function setUp(client: AlignClient | null) {
  let now = 0;
  const apply = vi.fn<(targets: Record<string, number>) => void>();
  const job = createAlignJob({ client: () => client ?? undefined, apply, now: () => now });
  /** Lets pending answers arrive, moves the clock and ticks. */
  async function wait(seconds: number) {
    await settle();
    now += seconds;
    job.tick();
    await settle();
  }
  return { job, apply, wait };
}

describe("createAlignJob", () => {
  it("is off until yt-dlp-z is set up, and ignores starts then", () => {
    const { job } = setUp(null);
    job.start(MEMBERS);
    expect(job.status()).toEqual({ state: "off" });
    expect(job.shownFor()).toEqual([]);
  });

  it("polls, applies the offsets and deletes the job on the server", async () => {
    const client = fakeClient();
    client.check.mockResolvedValueOnce(running(0.4)).mockResolvedValueOnce({
      state: "done",
      progress: 1,
      offsets: { "u-b": 31 },
      error: null,
      streams: [],
    });
    const { job, apply, wait } = setUp(client);
    expect(job.status()).toEqual({ state: "ready" });

    job.start(MEMBERS);
    expect(job.status()).toMatchObject({ state: "running", phase: "starting", progress: 0 });
    expect(job.shownFor()).toEqual(["1:0", "2:0"]);
    await wait(1);
    expect(client.check).not.toHaveBeenCalled();
    expect(job.status()).toMatchObject({ phase: "fetching", elapsed: 1, streams: [] });
    await wait(1);
    expect(job.status()).toEqual({
      state: "running",
      phase: "fetching",
      progress: 0.4,
      elapsed: 2,
      streams: [
        { id: "1:0", stage: "ready", downloaded: 1 },
        { id: "2:0", stage: "downloading", downloaded: 0.2 },
      ],
    });
    await wait(2);

    expect(apply).toHaveBeenCalledWith({ "2:0": 31 + 99 });
    expect(job.status()).toEqual({ state: "done", unmatched: [] });
    expect(client.remove).toHaveBeenCalledWith("job-1");
  });

  it("says when the server is comparing", async () => {
    const client = fakeClient();
    client.check.mockResolvedValueOnce({ ...running(0.95), state: "analysing" });
    const { job, wait } = setUp(client);
    job.start(MEMBERS);
    await wait(2);
    expect(job.status()).toMatchObject({ phase: "comparing", progress: 0.95 });
  });

  it("reports the server's failure and deletes the job", async () => {
    const client = fakeClient();
    client.check.mockResolvedValueOnce({
      state: "failed",
      progress: 1,
      offsets: {},
      error: "Only ended streams can be aligned",
      streams: [],
    });
    const { job, apply, wait } = setUp(client);
    job.start(MEMBERS);
    await wait(2);
    expect(job.status()).toEqual({ state: "failed", message: "Only ended streams can be aligned" });
    expect(apply).not.toHaveBeenCalled();
    expect(client.remove).toHaveBeenCalledWith("job-1");
  });

  it("falls back to a general message when the server gives none", async () => {
    const client = fakeClient();
    client.check.mockResolvedValueOnce({
      state: "failed",
      progress: 1,
      offsets: {},
      error: null,
      streams: [],
    });
    const { job, wait } = setUp(client);
    job.start(MEMBERS);
    await wait(2);
    expect(job.status()).toEqual({ state: "failed", message: "yt-dlp-z couldn't align them." });
  });

  it("shows why it couldn't start, and errors while checking", async () => {
    const client = fakeClient();
    client.start.mockRejectedValueOnce(new AlignError("Can't reach yt-dlp-z."));
    const { job, wait } = setUp(client);
    job.start(MEMBERS);
    await wait(0);
    expect(job.status()).toEqual({ state: "failed", message: "Can't reach yt-dlp-z." });

    client.check.mockRejectedValueOnce(new Error("boom"));
    job.start(MEMBERS);
    await wait(2);
    expect(job.status()).toEqual({ state: "failed", message: "Alignment failed unexpectedly." });
  });

  it("cancels: deletes the job and is ready again", async () => {
    const client = fakeClient();
    const { job, wait } = setUp(client);
    job.start(MEMBERS);
    await wait(0);
    job.cancel();
    expect(client.remove).toHaveBeenCalledWith("job-1");
    expect(job.status()).toEqual({ state: "ready" });
    await wait(5);
    expect(client.check).not.toHaveBeenCalled();
  });

  it("deletes a job that was cancelled before the server answered", async () => {
    const client = fakeClient();
    const { job, wait } = setUp(client);
    job.start(MEMBERS);
    job.cancel();
    await wait(0);
    expect(client.remove).toHaveBeenCalledWith("job-1");
  });

  it("runs one at a time and needs two members", () => {
    const client = fakeClient();
    const { job } = setUp(client);
    job.start([MEMBERS[0] as AlignMember]);
    expect(client.start).not.toHaveBeenCalled();
    job.start(MEMBERS);
    job.start(MEMBERS);
    expect(client.start).toHaveBeenCalledTimes(1);
  });
});
