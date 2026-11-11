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

  describe("with a pinned (ultra-low-latency) player", () => {
    it("jumps the player behind ahead instead of holding back the pinned one", () => {
      const samples = [
        sample("a", { latency: 2, bufferAhead: 1.6, pinned: true }),
        sample("b", { latency: 17, bufferAhead: 17, bufferLow: 16.5 }),
      ];

      const result = step(initialState(), samples, settings);

      expect(result.actions).toEqual([{ type: "skip", id: "b", seconds: 15 }]);
      expect(result.errors).toEqual({ a: 0, b: -15 });
    });

    it("jumps only as far as the buffer allows, and the pinned one stays ahead", () => {
      const samples = [
        sample("a", { latency: 2, bufferAhead: 1.6, pinned: true }),
        sample("b", { latency: 17, bufferAhead: 15, bufferLow: 10.5 }),
      ];

      const result = step(initialState(), samples, settings);

      expect(result.actions).toEqual([{ type: "skip", id: "b", seconds: 9 }]);
      expect(result.errors).toEqual({ a: 6, b: -9 });
    });

    it("never pauses or slows the pinned player, and doesn't touch its speed", () => {
      const samples = [
        sample("a", { latency: 2, pinned: true, playbackRate: 1.05 }),
        sample("b", { latency: 12, bufferAhead: 2, bufferLow: 1.5 }),
      ];

      const result = step(initialState(), samples, settings);

      expect(result.actions).toEqual([]);
      expect(result.state.modes).toEqual({ a: "normal", b: "normal" });
      expect(result.errors).toEqual({ a: 10, b: 0 });
    });

    it("hands back a pinned player it was slowing before it knew", () => {
      const state: ControllerState = { modes: { a: "slowing", b: "normal" } };
      const samples = [
        sample("a", { latency: 3, pinned: true, playbackRate: 0.92 }),
        sample("b", { latency: 3 }),
      ];

      expect(step(state, samples, settings).actions).toEqual([
        { type: "setRate", id: "a", rate: 1 },
      ]);
    });

    it("hands back a pinned player it had paused before it knew", () => {
      const state: ControllerState = { modes: { a: "paused", b: "normal" } };
      const samples = [
        sample("a", { latency: 3, state: "paused", pinned: true }),
        sample("b", { latency: 3 }),
      ];

      const result = step(state, samples, settings);

      expect(result.actions).toEqual([{ type: "play", id: "a" }]);
      expect(result.state.modes.a).toBe("normal");
    });

    it("waits out the cooldown before jumping again", () => {
      const samples = [
        sample("a", { latency: 2, pinned: true }),
        sample("b", { latency: 10, bufferAhead: 9.5, bufferLow: 9.5 }),
      ];
      const first = step(initialState(), samples, settings);
      const second = step(first.state, samples, settings);

      expect(first.actions).toEqual([{ type: "skip", id: "b", seconds: 8 }]);
      expect(second.actions).toEqual([]);
    });

    it("slows a normal player that's ahead of the pinned one", () => {
      const samples = [
        sample("a", { latency: 4, pinned: true }),
        sample("b", { latency: 3, bufferAhead: 3, bufferLow: 3 }),
      ];

      const result = step(initialState(), samples, settings);

      expect(result.actions).toEqual([{ type: "setRate", id: "b", rate: 0.92 }]);
    });

    it("doesn't jump a player within a second of the target", () => {
      const samples = [
        sample("a", { latency: 4, pinned: true }),
        sample("b", { latency: 4.8, bufferAhead: 5, bufferLow: 5 }),
      ];

      expect(step(initialState(), samples, settings).actions).toEqual([]);
    });
  });
});
