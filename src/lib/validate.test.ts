import { CONTENT_TAG, PAGE_TAG, type PlayerReport } from "./messages.ts";
import {
  isContentMessage,
  isGroupRequest,
  isPageMessage,
  isPlayerCommand,
  isPlayerReport,
} from "./validate.ts";

const report: PlayerReport = {
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
  });

  it.each([
    ["a non-object", "report"],
    ["null", null],
    ["a negative latency", { ...report, latency: -1 }],
    ["an infinite buffer", { ...report, bufferAhead: Infinity }],
    ["a latency over a day", { ...report, latency: 90_000 }],
    ["an unknown state", { ...report, state: "seeking" }],
    ["an absurd rate", { ...report, playbackRate: 40 }],
    ["a huge title", { ...report, title: "x".repeat(501) }],
    ["a missing channel", { ...report, channel: undefined }],
    ["a missing video id", { ...report, videoId: 42 }],
  ])("rejects %s", (_name, value) => {
    expect(isPlayerReport(value)).toBe(false);
  });
});

describe("isPlayerCommand", () => {
  it.each([
    [{ type: "setRate", rate: 0.92 }, true],
    [{ type: "setRate", rate: 1 }, true],
    [{ type: "setRate", rate: 1.5 }, false],
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
    expect(isContentMessage({ tag: CONTENT_TAG, command: { type: "setRate", rate: 2 } })).toBe(
      false,
    );
  });
});

describe("isGroupRequest", () => {
  it.each([
    [{ type: "setInGroup", id: "3:0", inGroup: true }, true],
    [{ type: "setInGroup", id: "3:0", inGroup: false }, true],
    [{ type: "setInGroup", id: 3, inGroup: true }, false],
    [{ type: "setInGroup", id: "3:0", inGroup: "yes" }, false],
    [{ type: "getStatus" }, false],
    [null, false],
  ])("%j → %s", (value, expected) => {
    expect(isGroupRequest(value)).toBe(expected);
  });
});
