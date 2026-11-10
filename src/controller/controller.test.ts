import { initialState, step } from "./controller.ts";
import type { ControllerState, PlayerSample, SyncSettings } from "./types.ts";

const settings: SyncSettings = {
  enabled: true,
  group: ["a", "b", "c", "d"],
  offsets: {},
  safetyMargin: 0,
};

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
      sample("d"),
    ];

    const result = step(initialState(), samples, settings);

    expect(result.errors).toEqual({ c: 0, d: 0 });
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
    const state: ControllerState = { modes: { gone: "slowing", a: "normal", b: "normal" } };

    const result = step(state, [sample("a"), sample("b")], settings);

    expect(result.state.modes).toEqual({ a: "normal", b: "normal" });
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

  it("never touches players the user didn't opt in", () => {
    const samples = [sample("a", { latency: 4 }), sample("b"), sample("x", { latency: 2 })];

    const result = step(initialState(), samples, { ...settings, group: ["a", "b"] });

    expect(result.actions).toEqual([{ type: "setRate", id: "a", rate: 0.92 }]);
    expect(Object.keys(result.errors)).toEqual(["a", "b"]);
  });

  it("does nothing with fewer than two players in the group", () => {
    const samples = [sample("a", { latency: 2 }), sample("x")];

    const result = step(initialState(), samples, { ...settings, group: ["a"] });

    expect(result).toEqual({ state: initialState(), actions: [], errors: {} });
  });

  it("hands back a player that was taken out of the group", () => {
    const state: ControllerState = { modes: { a: "slowing", b: "normal", c: "normal" } };
    const samples = [sample("a", { playbackRate: 0.92 }), sample("b"), sample("c")];

    const result = step(state, samples, { ...settings, group: ["b", "c"] });

    expect(result.actions).toEqual([{ type: "setRate", id: "a", rate: 1 }]);
    expect(result.state.modes).toEqual({ b: "normal", c: "normal" });
  });

  it("doesn't resume a player the user paused when handing it back", () => {
    const state: ControllerState = { modes: { a: "slowing", b: "normal" } };
    const samples = [sample("a", { state: "paused", playbackRate: 0.92 }), sample("b")];

    const result = step(state, samples, { ...settings, enabled: false });

    expect(result.actions).toEqual([{ type: "setRate", id: "a", rate: 1 }]);
  });

  it("ignores ads outside the group", () => {
    const samples = [sample("a", { latency: 4 }), sample("b"), sample("x", { state: "ad" })];

    const result = step(initialState(), samples, { ...settings, group: ["a", "b"] });

    expect(result.actions).toEqual([{ type: "setRate", id: "a", rate: 0.92 }]);
  });
});
