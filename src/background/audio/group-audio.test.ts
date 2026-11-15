import type { LiveReport } from "../../lib/messages.ts";
import { isSettled } from "./group-audio.ts";

function live(overrides: Partial<LiveReport> = {}): LiveReport {
  return {
    kind: "live",
    latency: 8,
    bufferAhead: 4,
    state: "playing",
    playbackRate: 1,
    title: "",
    channel: "",
    videoId: "v",
    noRewind: true,
    ...overrides,
  };
}

describe("isSettled", () => {
  it("counts a stream at the group's spot", () => {
    expect(isSettled({ id: "a", report: live(), error: 0.1 })).toBe(true);
  });

  it("counts a stuck stream playing steadily close by, but not one far off", () => {
    expect(isSettled({ id: "a", report: live(), error: -1.5, stuck: true })).toBe(true);
    expect(isSettled({ id: "a", report: live(), error: -10.5, stuck: true })).toBe(false);
  });

  it("doesn't count a stream being slowed", () => {
    expect(
      isSettled({ id: "a", report: live({ playbackRate: 0.92 }), error: 1, stuck: true }),
    ).toBe(false);
  });
});
