import { AUDIO_RATE } from "../audio/ring.ts";
import { CONTENT_TAG, PAGE_TAG, type PlayerReport } from "./messages.ts";
import {
  isAudioClip,
  isContentMessage,
  isPopupRequest,
  isPageMessage,
  isPlayerCommand,
  isPlayerReport,
} from "./validate.ts";

const report: PlayerReport = {
  kind: "live",
  latency: 4.2,
  bufferAhead: 3,
  state: "playing",
  playbackRate: 1,
  title: "Collab stream",
  channel: "Someone",
  videoId: "abc123",
};

describe("isPlayerReport", () => {
  it("accepts a well-formed report", () => {
    expect(isPlayerReport(report)).toBe(true);
    expect(isPlayerReport({ ...report, bufferLow: 2, pinned: true })).toBe(true);
  });

  it.each([
    ["a non-object", "report"],
    ["null", null],
    ["a negative latency", { ...report, latency: -1 }],
    ["an infinite buffer", { ...report, bufferAhead: Infinity }],
    ["a latency over a week", { ...report, latency: 700_000 }],
    ["an unknown state", { ...report, state: "seeking" }],
    ["an absurd rate", { ...report, playbackRate: 40 }],
    ["a huge title", { ...report, title: "x".repeat(501) }],
    ["a missing channel", { ...report, channel: undefined }],
    ["a missing video id", { ...report, videoId: 42 }],
    ["a negative lowest buffer", { ...report, bufferLow: -1 }],
    ["a non-boolean pinned", { ...report, pinned: "yes" }],
  ])("rejects %s", (_name, value) => {
    expect(isPlayerReport(value)).toBe(false);
  });
});

describe("isPlayerCommand", () => {
  it.each([
    [{ type: "setRate", rate: 0.92 }, true],
    [{ type: "setRate", rate: 1 }, true],
    [{ type: "setRate", rate: 1.5 }, true],
    [{ type: "setRate", rate: 20 }, false],
    [{ type: "seek", position: 3600 }, true],
    [{ type: "seek", position: -1 }, false],
    [{ type: "skip", seconds: 10 }, true],
    [{ type: "skip", seconds: 500 }, false],
    [{ type: "skip", seconds: -2 }, true],
    [{ type: "skip", seconds: -500 }, false],
    [{ type: "setRate", rate: 0 }, false],
    [{ type: "pause" }, true],
    [{ type: "play" }, true],
    [{ type: "seek" }, false],
    [null, false],
  ])("%j → %s", (value, expected) => {
    expect(isPlayerCommand(value)).toBe(expected);
  });
});

describe("window messages", () => {
  it("accepts tagged page reports, including the no-player report", () => {
    expect(isPageMessage({ tag: PAGE_TAG, report })).toBe(true);
    expect(isPageMessage({ tag: PAGE_TAG, report: null })).toBe(true);
  });

  it("rejects page messages with another tag or a bad report", () => {
    expect(isPageMessage({ tag: CONTENT_TAG, report })).toBe(false);
    expect(isPageMessage({ tag: PAGE_TAG, report: { latency: 1 } })).toBe(false);
    expect(isPageMessage("hello")).toBe(false);
  });

  it("accepts only tagged, valid commands", () => {
    expect(isContentMessage({ tag: CONTENT_TAG, command: { type: "pause" } })).toBe(true);
    expect(isContentMessage({ tag: PAGE_TAG, command: { type: "pause" } })).toBe(false);
    expect(isContentMessage({ tag: CONTENT_TAG, command: { type: "setRate", rate: 0 } })).toBe(
      false,
    );
  });
});

describe("archive reports", () => {
  const archive = {
    kind: "archive",
    position: 120.5,
    duration: 12_338,
    bufferAhead: 8,
    startTime: 1_794_315_580,
    userActions: 2,
    state: "playing",
    playbackRate: 1.5,
    title: "Archive",
    channel: "Someone",
    videoId: "M8nW5BZOD4I",
  };

  it("accepts archives with and without a start time", () => {
    expect(isPlayerReport(archive)).toBe(true);
    expect(isPlayerReport({ ...archive, startTime: undefined })).toBe(true);
  });

  it.each([
    ["an unknown kind", { ...archive, kind: "clip" }],
    ["a start time in milliseconds", { ...archive, startTime: 1_794_315_580_000 }],
    ["a start time before YouTube", { ...archive, startTime: 1000 }],
    ["a fractional action count", { ...archive, userActions: 1.5 }],
    ["a negative position", { ...archive, position: -3 }],
  ])("rejects %s", (_name, value) => {
    expect(isPlayerReport(value)).toBe(false);
  });
});

describe("isPopupRequest", () => {
  it.each([
    [{ type: "getStatus" }, true],
    [{ type: "setInGroup", id: "3:0", inGroup: true }, true],
    [{ type: "setInGroup", id: 3, inGroup: true }, false],
    [{ type: "setInGroup", id: "3:0", inGroup: "yes" }, false],
    [{ type: "nudge", id: "3:0", seconds: -0.1 }, true],
    [{ type: "nudge", id: "3:0", seconds: -600 }, true],
    [{ type: "nudge", id: "3:0", seconds: 3601 }, false],
    [{ type: "nudge", id: "3:0", seconds: Number.NaN }, false],
    [{ type: "reload" }, false],
    [null, false],
  ])("%j → %s", (value, expected) => {
    expect(isPopupRequest(value)).toBe(expected);
  });
});

describe("audio", () => {
  const clip = { request: 3, start: 1_794_315_580_000, rate: AUDIO_RATE, pcm: "AAAA" };

  it("accepts reports with audio levels and rejects bad ones", () => {
    const audio = { state: "listening", envelope: [0, 0.4, 1], end: 1_794_315_580_000 };

    expect(isPlayerReport({ ...report, audio })).toBe(true);
    expect(isPlayerReport({ ...report, audio: { ...audio, state: "loud" } })).toBe(false);
    expect(isPlayerReport({ ...report, audio: { ...audio, envelope: [2] } })).toBe(false);
    expect(
      isPlayerReport({
        ...report,
        audio: { ...audio, envelope: Array.from({ length: 500 }, () => 0) },
      }),
    ).toBe(false);
    expect(isPlayerReport({ ...report, audio: "loud" })).toBe(false);
  });

  it("accepts clips at the audio rate only, of sane size", () => {
    expect(isAudioClip(clip)).toBe(true);
    expect(isAudioClip({ ...clip, rate: 48_000 })).toBe(false);
    expect(isAudioClip({ ...clip, pcm: "A".repeat(250_000) })).toBe(false);
    expect(isAudioClip({ ...clip, request: -1 })).toBe(false);
    expect(isPageMessage({ tag: PAGE_TAG, clip })).toBe(true);
    expect(isPageMessage({ tag: PAGE_TAG, clip: { ...clip, pcm: 4 } })).toBe(false);
  });

  it("accepts listen and clip commands", () => {
    expect(isPlayerCommand({ type: "listen", on: true })).toBe(true);
    expect(isPlayerCommand({ type: "listen", on: "yes" })).toBe(false);
    expect(isPlayerCommand({ type: "clip", request: 1, seconds: 20 })).toBe(true);
    expect(isPlayerCommand({ type: "clip", request: 1, seconds: 3600 })).toBe(false);
  });
});
