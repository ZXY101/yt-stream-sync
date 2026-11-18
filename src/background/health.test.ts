import { describe, expect, it } from "vitest";

import type { LiveReport } from "../lib/messages.ts";
import { createHealth } from "./health.ts";

function live(overrides: Partial<LiveReport> = {}): LiveReport {
  return {
    kind: "live",
    state: "playing",
    playbackRate: 1,
    title: "Stream",
    channel: "Channel",
    videoId: "aaaaaaaaaaa",
    latency: 5,
    bufferAhead: 4,
    ...overrides,
  };
}

/** A health tracker on a fake clock, and a player that reports once a second. */
function setup() {
  let time = 0;
  const notes: string[] = [];
  const health = createHealth(
    () => time,
    (text) => notes.push(text),
  );
  let latency = 5;
  function play(seconds: number, overrides: Partial<LiveReport> = {}) {
    for (let i = 0; i < seconds; i++) {
      time += 1;
      health.onReport("1:0", live({ latency, ...overrides }));
    }
  }
  return {
    health,
    notes,
    play,
    setLatency: (value: number) => (latency = value),
  };
}

describe("stream health", () => {
  it("says nothing until it has watched a stream for 30 s", () => {
    const { health, play } = setup();
    health.follow(["1:0"]);
    play(20);
    expect(health.get("1:0")).toBeUndefined();
    play(15);
    expect(health.get("1:0")).toEqual({ label: "steady", buffering: 0, moved: 0, corrections: 0 });
  });

  it("knows nothing about a player it never started", () => {
    const { health, play } = setup();
    play(40);
    expect(health.get("1:0")).toBeUndefined();
  });

  it("counts each time a stream starts buffering", () => {
    const { health, play } = setup();
    health.follow(["1:0"]);
    play(10);
    play(3, { state: "buffering" });
    play(10);
    play(2, { state: "buffering" });
    play(10);
    expect(health.get("1:0")).toMatchObject({ buffering: 2, label: "shaky" });
  });

  it("counts latency jumps that nobody asked for as YouTube moving the stream", () => {
    const { health, play, setLatency } = setup();
    health.follow(["1:0"]);
    play(15);
    setLatency(9);
    play(20);
    expect(health.get("1:0")).toMatchObject({ moved: 1 });
  });

  it("doesn't count latency that grows while paused, slowed or buffering", () => {
    const { health, play, setLatency } = setup();
    health.follow(["1:0"]);
    play(5);
    for (let latency = 6; latency < 16; latency++) {
      setLatency(latency);
      play(1, { state: "paused" });
    }
    health.onCommand("1:0", { type: "setRate", rate: 0.92 });
    play(20, { playbackRate: 0.92 });
    expect(health.get("1:0")).toMatchObject({ moved: 0 });
  });

  it("doesn't count a jump right after a command as YouTube's", () => {
    const { health, play, setLatency } = setup();
    health.follow(["1:0"]);
    play(30);
    health.onCommand("1:0", { type: "skip", seconds: 4 });
    setLatency(1);
    play(5);
    expect(health.get("1:0")).toMatchObject({ moved: 0, corrections: 1 });
  });

  it("counts YouTube changing the speed by itself as a move", () => {
    const { health, play } = setup();
    health.follow(["1:0"]);
    play(15);
    play(3, { playbackRate: 1.05 });
    play(15);
    expect(health.get("1:0")).toMatchObject({ moved: 1 });
  });

  it("counts skips, pauses and slow-downs as corrections, not their undoing", () => {
    const { health, play } = setup();
    health.follow(["1:0"]);
    play(30);
    health.onCommand("1:0", { type: "setRate", rate: 0.92 });
    health.onCommand("1:0", { type: "setRate", rate: 0.92 });
    health.onCommand("1:0", { type: "setRate", rate: 1 });
    health.onCommand("1:0", { type: "pause" });
    health.onCommand("1:0", { type: "play" });
    health.onCommand("1:0", { type: "skip", seconds: 2 });
    play(1);
    expect(health.get("1:0")).toMatchObject({ corrections: 3, label: "shaky" });
  });

  it("doesn't count buffering right after one of our skips", () => {
    const { health, play } = setup();
    health.follow(["1:0"]);
    play(40);
    health.onCommand("1:0", { type: "skip", seconds: 2 });
    play(2, { state: "buffering" });
    play(10);
    health.onCommand("1:0", { type: "skip", seconds: -1 });
    play(4);
    play(2, { state: "buffering" });
    play(10);
    expect(health.get("1:0")).toMatchObject({ buffering: 0, corrections: 2, label: "steady" });
  });

  it("doesn't count lining the streams up after one joins as corrections", () => {
    const { health, play } = setup();
    health.follow(["1:0"]);
    play(40);
    health.follow(["1:0", "2:0"]);
    health.onCommand("1:0", { type: "skip", seconds: 2.4 });
    play(10);
    health.onCommand("1:0", { type: "skip", seconds: 2.8 });
    play(25);
    expect(health.get("1:0")).toMatchObject({ corrections: 0 });
    health.onCommand("1:0", { type: "setRate", rate: 0.92 });
    play(1);
    expect(health.get("1:0")).toMatchObject({ corrections: 1, label: "steady" });
  });

  it("calls a stream that keeps buffering and moving unstable", () => {
    const { health, play, setLatency } = setup();
    health.follow(["1:0"]);
    for (let round = 0; round < 4; round++) {
      play(5);
      play(2, { state: "buffering" });
      setLatency(round % 2 === 0 ? 10 : 5);
      play(5);
    }
    expect(health.get("1:0")?.label).toBe("unstable");
  });

  it("forgets what happened more than 2 minutes ago", () => {
    const { health, play } = setup();
    health.follow(["1:0"]);
    play(5);
    play(2, { state: "buffering" });
    play(5);
    play(2, { state: "buffering" });
    play(30);
    expect(health.get("1:0")?.label).toBe("shaky");
    play(100);
    expect(health.get("1:0")).toMatchObject({ label: "steady", buffering: 0 });
  });

  it("starts over when a stream joins again, and forgets ones that left", () => {
    const { health, play } = setup();
    health.follow(["1:0"]);
    play(10, { state: "buffering" });
    play(30);
    health.follow([]);
    play(40);
    expect(health.get("1:0")).toBeUndefined();
    health.follow(["1:0"]);
    play(30);
    expect(health.get("1:0")).toMatchObject({ buffering: 0 });
  });

  it("ignores latency jumps across an ad break", () => {
    const { health, play, setLatency } = setup();
    health.follow(["1:0"]);
    play(10);
    play(5, { state: "ad" });
    setLatency(20);
    play(20);
    expect(health.get("1:0")).toMatchObject({ moved: 0, buffering: 0 });
  });

  it("writes label changes to the debug log", () => {
    const { health, notes, play } = setup();
    health.follow(["1:0"]);
    play(10);
    play(2, { state: "buffering" });
    play(5);
    play(2, { state: "buffering" });
    play(30);
    health.get("1:0");
    health.get("1:0");
    expect(notes).toEqual(["health 1:0: shaky (buffered 2, moved 0, corrected 0 in 2 min)"]);
  });
});
