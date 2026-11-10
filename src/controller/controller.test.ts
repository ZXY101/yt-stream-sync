import { initialState, step } from "./controller.ts";
import type { ControllerState, PlayerSample, SyncSettings } from "./types.ts";

const settings: SyncSettings = { enabled: true, offsets: {}, safetyMargin: 0 };

function sample(id: string, overrides: Partial<PlayerSample> = {}): PlayerSample {
  return { id, latency: 5, bufferAhead: 3, state: "playing", playbackRate: 1, ...overrides };
}

describe("step", () => {
  it("slows the player that's ahead and reports how far ahead each one is", () => {
    const result = step(initialState(), [sample("a", { latency: 4 }), sample("b")], settings);

    expect(result.actions).toEqual([{ type: "setRate", id: "a", rate: 0.92 }]);
    expect(result.errors).toEqual({ a: 1, b: 0 });
    expect(result.state.modes).toEqual({ a: "slowing", b: "normal" });
  });

  it("leaves out players the user paused and players that ended", () => {
    const samples = [
      sample("a", { latency: 2, state: "paused" }),
      sample("b", { latency: 3, state: "ended" }),
      sample("c"),
    ];

    const result = step(initialState(), samples, settings);

    expect(result.errors).toEqual({ c: 0 });
    expect(result.actions).toEqual([]);
  });

  it("keeps a player it paused itself in the group", () => {
    const state: ControllerState = { modes: { a: "paused", b: "normal" } };
    const samples = [sample("a", { latency: 14, state: "paused" }), sample("b", { latency: 14.5 })];

    const result = step(state, samples, settings);

    expect(result.state.modes.a).toBe("slowing");
    expect(result.actions).toEqual([
      { type: "play", id: "a" },
      { type: "setRate", id: "a", rate: 0.92 },
    ]);
  });

  it("does nothing when no player can be synced", () => {
    const result = step(initialState(), [sample("a", { state: "ended" })], settings);

    expect(result).toEqual({ state: initialState(), actions: [], errors: {} });
  });

  it("forgets players that left the group", () => {
    const state: ControllerState = { modes: { gone: "slowing", b: "normal" } };

    const result = step(state, [sample("b")], settings);

    expect(result.state.modes).toEqual({ b: "normal" });
  });

  it("resumes and restores every player it changed when syncing is off", () => {
    const state: ControllerState = { modes: { a: "paused", b: "slowing", c: "normal" } };
    const samples = [
      sample("a", { state: "paused" }),
      sample("b", { playbackRate: 0.92 }),
      sample("c", { playbackRate: 1.05 }),
    ];

    const result = step(state, samples, { ...settings, enabled: false });

    expect(result.actions).toEqual([
      { type: "play", id: "a" },
      { type: "setRate", id: "b", rate: 1 },
    ]);
    expect(result.state).toEqual(initialState());
  });

  it("holds while any player shows an ad", () => {
    const samples = [sample("a", { latency: 2 }), sample("b", { state: "ad" })];

    const result = step(initialState(), samples, settings);

    expect(result.actions).toEqual([]);
    expect(result.errors).toEqual({});
  });
});
