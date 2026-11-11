import type { LiveReport } from "../lib/messages.ts";
import { assumeDone, toCommand, toLiveSample } from "./convert.ts";

const report: LiveReport = {
  kind: "live",
  latency: 17,
  bufferAhead: 15,
  state: "playing",
  playbackRate: 1,
  title: "Collab stream",
  channel: "Someone",
  videoId: "abc123",
};

describe("live jumps", () => {
  it("turns a skip action into a skip command", () => {
    expect(toCommand({ type: "skip", id: "1:0", seconds: 10 })).toEqual({
      type: "skip",
      seconds: 10,
    });
  });

  it("passes the lowest buffer and pinned flag on to the controller", () => {
    const sample = toLiveSample("1:0", { ...report, bufferLow: 12, pinned: true });

    expect(sample).toMatchObject({ bufferLow: 12, pinned: true });
  });

  it("assumes a skip moved the player closer to live and used up its buffer", () => {
    expect(assumeDone(report, { type: "skip", seconds: 10 })).toMatchObject({
      latency: 7,
      bufferAhead: 5,
      bufferLow: 5,
    });
    expect(assumeDone({ ...report, bufferLow: 3 }, { type: "skip", seconds: 10 })).toMatchObject({
      bufferLow: 0,
    });
  });
});
