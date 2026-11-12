import { runArchiveSync, type ArchiveTick } from "../../test/run-archive-sync.ts";
import { SimulatedArchive } from "../../test/simulated-archive.ts";

// The two real archives used for testing started 70 s apart.
const START_A = 1_794_315_580;
const START_B = START_A + 70;

/** Broadcast moment each player shows, given its start time. */
function moments(tick: ArchiveTick, starts: Record<string, number>): number[] {
  return Object.entries(tick.positions).map(([id, position]) => (starts[id] ?? 0) + position);
}

function spread(values: number[]): number {
  return Math.max(...values) - Math.min(...values);
}

describe("archive sync against simulated players", () => {
  it("lines up two archives by their start times and settles at normal speed", () => {
    const a = new SimulatedArchive({ id: "a", position: 100, startTime: START_A });
    const b = new SimulatedArchive({ id: "b", position: 100, startTime: START_B });

    const ticks = runArchiveSync({ players: [a, b], seconds: 30 });

    const last = ticks.at(-1) as ArchiveTick;
    expect(spread(moments(last, { a: START_A, b: START_B }))).toBeLessThan(0.1);
    expect(last.rates).toEqual({ a: 1, b: 1 });
    expect(ticks[0]?.actions).toEqual([
      { type: "pause", id: "a" },
      { type: "pause", id: "b" },
      { type: "seek", id: "b", position: 30 },
    ]);
    expect(last.states).toEqual({ a: "playing", b: "playing" });
  });

  it("follows the player the user seeks", () => {
    const a = new SimulatedArchive({ id: "a", position: 100, startTime: START_A });
    const b = new SimulatedArchive({ id: "b", position: 30, startTime: START_B });

    const ticks = runArchiveSync({
      players: [a, b],
      seconds: 30,
      events: { 3: () => b.user({ type: "seek", id: "b", position: 1000 }) },
    });

    const last = ticks.at(-1) as ArchiveTick;
    expect(last.positions.b).toBeGreaterThan(1000);
    expect(spread(moments(last, { a: START_A, b: START_B }))).toBeLessThan(0.1);
  });

  it("pauses and plays everyone with the player the user touched", () => {
    const a = new SimulatedArchive({ id: "a", position: 100, startTime: START_A });
    const b = new SimulatedArchive({ id: "b", position: 30, startTime: START_B });

    const ticks = runArchiveSync({
      players: [a, b],
      seconds: 12,
      events: {
        3: () => b.user({ type: "pause", id: "b" }),
        8: () => a.user({ type: "play", id: "a" }),
      },
    });

    expect(ticks[5]?.states).toEqual({ a: "paused", b: "paused" });
    expect(ticks[11]?.states).toEqual({ a: "playing", b: "playing" });
  });

  it("matches the speed the user picks", () => {
    const a = new SimulatedArchive({ id: "a", position: 100, startTime: START_A });
    const b = new SimulatedArchive({ id: "b", position: 30, startTime: START_B });

    const ticks = runArchiveSync({
      players: [a, b],
      seconds: 30,
      events: { 2: () => a.user({ type: "setRate", id: "a", rate: 1.5 }) },
    });

    const last = ticks.at(-1) as ArchiveTick;
    expect(last.rates.b).toBeCloseTo(1.5);
    expect(spread(moments(last, { a: START_A, b: START_B }))).toBeLessThan(0.2);
  });

  it("closes a small drift with a speed trim instead of a jump", () => {
    const a = new SimulatedArchive({ id: "a", position: 100, startTime: START_A });
    const b = new SimulatedArchive({ id: "b", position: 30.6, startTime: START_B });

    const ticks = runArchiveSync({ players: [a, b], seconds: 40 });

    expect(ticks.flatMap((tick) => tick.actions).some((action) => action.type === "seek")).toBe(
      false,
    );
    expect(ticks[0]?.actions).toEqual([{ type: "setRate", id: "b", rate: 0.95 }]);
    const last = ticks.at(-1) as ArchiveTick;
    expect(spread(moments(last, { a: START_A, b: START_B }))).toBeLessThan(0.1);
    expect(last.rates.b).toBe(1);
  });

  it("holds a stream that hadn't started yet at the start until its moment comes", () => {
    const a = new SimulatedArchive({ id: "a", position: 20, startTime: START_A });
    const b = new SimulatedArchive({ id: "b", position: 10, startTime: START_B });

    const ticks = runArchiveSync({ players: [a, b], seconds: 60 });

    expect(ticks[2]?.states.b).toBe("paused");
    expect(ticks[2]?.positions.b).toBe(0);
    const last = ticks.at(-1) as ArchiveTick;
    expect(last.states.b).toBe("playing");
    expect(spread(moments(last, { a: START_A, b: START_B }))).toBeLessThan(0.2);
  });

  it("keeps embeds without start times as they were when ticked, plus the nudge", () => {
    const a = new SimulatedArchive({ id: "a", position: 500 });
    const b = new SimulatedArchive({ id: "b", position: 200 });

    const ticks = runArchiveSync({ players: [a, b], seconds: 30, settings: { offsets: { b: 2 } } });

    const last = ticks.at(-1) as ArchiveTick;
    expect((last.positions.a ?? 0) - (last.positions.b ?? 0)).toBeCloseTo(298, 1);
  });

  it("starts everyone together after a jump, even when one buffers much slower", () => {
    const a = new SimulatedArchive({ id: "a", position: 100, startTime: START_A, loadRate: 8 });
    const b = new SimulatedArchive({ id: "b", position: 30, startTime: START_B, loadRate: 1.5 });

    const ticks = runArchiveSync({
      players: [a, b],
      seconds: 30,
      events: { 5: () => b.user({ type: "seek", id: "b", position: 2000 }) },
    });

    const restart = ticks.findIndex(
      (tick, index) => index > 5 && tick.actions.some((x) => x.type === "play"),
    );
    expect(ticks[restart]?.actions.filter((action) => action.type === "play")).toHaveLength(2);
    expect(ticks.slice(6, restart).every((tick) => tick.states.a !== "playing")).toBe(true);
    const after = ticks.slice(restart + 1);
    expect(after.every((tick) => spread(moments(tick, { a: START_A, b: START_B })) < 0.05)).toBe(
      true,
    );
    expect(after.flatMap((tick) => tick.actions).some((x) => x.type === "setRate")).toBe(false);
  });

  it("pauses everyone while one stream stalls, then carries on together", () => {
    const a = new SimulatedArchive({ id: "a", position: 100, startTime: START_A });
    const b = new SimulatedArchive({ id: "b", position: 30, startTime: START_B });

    const ticks = runArchiveSync({
      players: [a, b],
      seconds: 30,
      events: {
        8: () => {
          b.bufferAhead = 0;
          b.state = "buffering";
        },
      },
    });

    const last = ticks.at(-1) as ArchiveTick;
    expect(last.states).toEqual({ a: "playing", b: "playing" });
    expect(spread(moments(last, { a: START_A, b: START_B }))).toBeLessThan(0.1);
  });

  it("carries on without a stream that never finishes buffering, and takes it back later", () => {
    const a = new SimulatedArchive({ id: "a", position: 100, startTime: START_A });
    const b = new SimulatedArchive({ id: "b", position: 30, startTime: START_B });

    const ticks = runArchiveSync({
      players: [a, b],
      seconds: 80,
      events: {
        3: () => a.user({ type: "seek", id: "a", position: 500 }),
        4: () => b.setLoadRate(0),
        40: () => b.setLoadRate(4),
      },
    });

    // Gave up after about 15 s and kept a playing on its own.
    const alone = ticks.slice(25, 40);
    expect(alone.every((tick) => tick.states.a === "playing")).toBe(true);
    const last = ticks.at(-1) as ArchiveTick;
    expect(last.states).toEqual({ a: "playing", b: "playing" });
    expect(spread(moments(last, { a: START_A, b: START_B }))).toBeLessThan(0.1);
  });

  it("keeps playing without a background tab that won't start, and takes it back once shown", () => {
    const a = new SimulatedArchive({ id: "a", position: 100, startTime: START_A });
    const b = new SimulatedArchive({ id: "b", position: 30, startTime: START_B });
    b.holdBack();

    const ticks = runArchiveSync({
      players: [a, b],
      seconds: 60,
      events: { 30: () => b.show() },
    });

    // a only waits a few seconds for b, then plays on: no endless pause and regroup loop.
    const waiting = ticks.slice(0, 30).filter((tick) => tick.states.a !== "playing");
    expect(waiting.length).toBeLessThanOrEqual(4);
    expect(ticks.slice(10, 30).every((tick) => tick.states.a === "playing")).toBe(true);
    const last = ticks.at(-1) as ArchiveTick;
    expect(last.states).toEqual({ a: "playing", b: "playing" });
    expect(spread(moments(last, { a: START_A, b: START_B }))).toBeLessThan(0.1);
  });

  it("doesn't compound catch-up speeds when the user touches a catching-up stream", () => {
    const a = new SimulatedArchive({ id: "a", position: 100, startTime: START_A });
    // b is 0.5 s behind, so it gets sped up a little to catch up.
    const b = new SimulatedArchive({ id: "b", position: 29.5, startTime: START_B });
    const presses: Record<number, () => void> = {};
    for (const second of [2, 4, 6, 8, 10]) {
      // The user keeps pressing play on whichever stream is catching up.
      presses[second] = () =>
        (second % 4 === 2 ? b : a).user({ type: "play", id: second % 4 === 2 ? "b" : "a" });
    }

    const ticks = runArchiveSync({ players: [a, b], seconds: 40, events: presses });

    const fastest = Math.max(...ticks.flatMap((tick) => Object.values(tick.rates)));
    expect(fastest).toBeLessThanOrEqual(1.05 + 1e-9);
    expect(ticks.at(-1)?.rates).toEqual({ a: 1, b: 1 });
  });

  it("plays everyone at once when the user presses play during a regroup", () => {
    const a = new SimulatedArchive({ id: "a", position: 100, startTime: START_A, loadRate: 8 });
    const b = new SimulatedArchive({ id: "b", position: 30, startTime: START_B, loadRate: 0.2 });

    const ticks = runArchiveSync({
      players: [a, b],
      seconds: 12,
      events: {
        3: () => a.user({ type: "seek", id: "a", position: 900 }),
        5: () => a.user({ type: "play", id: "a" }),
      },
    });

    // b is far from buffered, but the user asked to play: both play from the next step on.
    expect(ticks[5]?.actions.filter((action) => action.type === "play")).not.toHaveLength(0);
    expect(ticks[7]?.states.a).toBe("playing");
  });
});
