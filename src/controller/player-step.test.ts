import type { PlayerSample } from "./types.ts";
import { actionsFor, nextMode } from "./player-step.ts";
import { DEFAULT_TUNING as tuning } from "./tuning.ts";

function sample(overrides: Partial<PlayerSample> = {}): PlayerSample {
  return { id: "a", latency: 5, bufferAhead: 3, state: "playing", playbackRate: 1, ...overrides };
}

describe("nextMode", () => {
  it.each([
    ["normal", 0.2, "normal"],
    ["normal", 0.4, "slowing"],
    ["slowing", 0.2, "slowing"],
    ["slowing", 0.05, "normal"],
    ["normal", 9, "paused"],
    ["slowing", 9, "paused"],
    ["paused", 3, "paused"],
    ["paused", 0.8, "slowing"],
    ["paused", 0.05, "normal"],
  ] as const)("%s at %ss ahead becomes %s", (mode, error, expected) => {
    expect(nextMode(mode, error, tuning)).toBe(expected);
  });
});

describe("actionsFor", () => {
  it("pauses a playing player once", () => {
    expect(actionsFor(sample(), "paused", tuning)).toEqual([{ type: "pause", id: "a" }]);
    expect(actionsFor(sample({ state: "paused" }), "paused", tuning)).toEqual([]);
  });

  it("resumes a paused player at the slow rate", () => {
    expect(actionsFor(sample({ state: "paused" }), "slowing", tuning)).toEqual([
      { type: "play", id: "a" },
      { type: "setRate", id: "a", rate: tuning.slowRate },
    ]);
  });

  it("only sends a rate when the player's differs", () => {
    expect(actionsFor(sample({ playbackRate: 0.9200000001 }), "slowing", tuning)).toEqual([]);
    expect(actionsFor(sample({ playbackRate: 1.05 }), "normal", tuning)).toEqual([
      { type: "setRate", id: "a", rate: 1 },
    ]);
  });
});
