import { runSync, type Tick } from "../test/run-sync.ts";
import { SimulatedPlayer } from "../test/simulated-player.ts";
import { DEFAULT_TUNING } from "./tuning.ts";

function players(...latencies: number[]): SimulatedPlayer[] {
  return latencies.map((latency, index) => new SimulatedPlayer({ id: `p${index}`, latency }));
}

/** Largest difference in latency (plus offset) between players at one tick. */
function spread(tick: Tick, offsets: Record<string, number> = {}): number {
  const lags = Object.entries(tick.latencies).map(([id, lag]) => lag + (offsets[id] ?? 0));
  return Math.max(...lags) - Math.min(...lags);
}

function allRates(ticks: Tick[]): number[] {
  return ticks.flatMap((tick) => Object.values(tick.rates));
}

function stalls(ticks: Tick[], id: string): number {
  return ticks.filter((tick) => tick.states[id] === "buffering").length;
}

function settled(ticks: Tick[], from: number): Tick[] {
  return ticks.filter((tick) => tick.second >= from);
}

describe("sync against simulated live players", () => {
  it("brings two players a few seconds apart into sync and back to normal speed", () => {
    const ticks = runSync({ players: players(3.6, 6.5), seconds: 90 });

    for (const tick of settled(ticks, 60)) {
      expect(spread(tick)).toBeLessThan(DEFAULT_TUNING.startError);
      expect(Object.values(tick.rates)).toEqual([1, 1]);
    }
    expect(Math.max(...allRates(ticks))).toBeLessThanOrEqual(1);
    expect(stalls(ticks, "p0") + stalls(ticks, "p1")).toBe(0);
  });

  it("never touches a single player that has enough buffer", () => {
    const ticks = runSync({ players: players(6), seconds: 20 });

    expect(ticks.flatMap((tick) => tick.actions)).toEqual([]);
  });

  it("pauses the leader when the gap is too big to slow down", () => {
    const ticks = runSync({ players: players(4, 16), seconds: 60 });

    expect(ticks[0]?.actions).toContainEqual({ type: "pause", id: "p0" });
    expect(ticks.some((tick) => tick.actions.some((action) => action.type === "play"))).toBe(true);
    for (const tick of settled(ticks, 40)) {
      expect(spread(tick)).toBeLessThan(DEFAULT_TUNING.startError);
      expect(tick.states).toEqual({ p0: "playing", p1: "playing" });
    }
  });

  it("holds back the other stream while one stalls, and never speeds the stalled one up", () => {
    const [stalling, steady] = players(5, 5) as [SimulatedPlayer, SimulatedPlayer];
    const ticks = runSync({
      players: [stalling, steady],
      seconds: 120,
      events: { 10: () => stalling.dropNetwork(6) },
    });

    expect(stalls(ticks, "p0")).toBeGreaterThan(0);
    expect(ticks.some((tick) => tick.rates.p1 === DEFAULT_TUNING.slowRate)).toBe(true);
    expect(Math.max(...allRates(ticks))).toBeLessThanOrEqual(1);
    for (const tick of settled(ticks, 100)) {
      expect(spread(tick)).toBeLessThan(DEFAULT_TUNING.startError);
    }
  });

  it("puts everyone back to normal during an ad and closes the gap after it", () => {
    const [withAd, other] = players(5, 6) as [SimulatedPlayer, SimulatedPlayer];
    const ticks = runSync({
      players: [withAd, other],
      seconds: 120,
      events: { 5: () => withAd.showAd(15) },
    });

    for (const tick of ticks.filter((t) => t.states.p0 === "ad")) {
      expect(tick.errors).toEqual({});
      expect(tick.rates.p1).toBe(1);
    }
    for (const tick of settled(ticks, 100)) {
      expect(spread(tick)).toBeLessThan(DEFAULT_TUNING.startError);
    }
  });

  it("undoes YouTube's catch-up speed-up on the next step", () => {
    const [caughtUp, other] = players(6, 6) as [SimulatedPlayer, SimulatedPlayer];
    const ticks = runSync({
      players: [caughtUp, other],
      seconds: 5,
      events: { 2: () => (caughtUp.playbackRate = 1.05) },
    });

    expect(ticks[2]?.actions).toEqual([{ type: "setRate", id: "p0", rate: 1 }]);
    expect(ticks[4]?.rates.p0).toBe(1);
  });

  it("keeps the manual offset between players", () => {
    const offsets = { p1: 0.8 };
    const ticks = runSync({ players: players(6, 6), seconds: 60, settings: { offsets } });

    const last = ticks.at(-1) as Tick;
    expect(spread(last, offsets)).toBeLessThan(DEFAULT_TUNING.startError);
    expect((last.latencies.p0 ?? 0) - (last.latencies.p1 ?? 0)).toBeCloseTo(0.8, 0);
  });

  it("builds extra buffer on every player for the safety margin", () => {
    const ticks = runSync({ players: players(5, 5), seconds: 150, settings: { safetyMargin: 2 } });

    const lowest = Math.min(...settled(ticks, 120).flatMap((tick) => Object.values(tick.buffers)));
    expect(lowest).toBeGreaterThan(DEFAULT_TUNING.minBuffer + 2 - DEFAULT_TUNING.startError);
    expect(spread(ticks.at(-1) as Tick)).toBeLessThan(DEFAULT_TUNING.startError);
  });

  it("syncs three players at once", () => {
    const ticks = runSync({ players: players(3.5, 7, 5), seconds: 120 });

    for (const tick of settled(ticks, 90)) {
      expect(spread(tick)).toBeLessThan(DEFAULT_TUNING.startError);
    }
  });

  it("hands players back at normal speed when syncing is turned off", () => {
    const group = players(4, 6);
    const settings = { enabled: true, offsets: {}, safetyMargin: 0 };
    const ticks = runSync({
      players: group,
      seconds: 10,
      settings,
      events: { 5: () => (settings.enabled = false) },
    });

    expect(ticks[4]?.rates.p0).toBe(DEFAULT_TUNING.slowRate);
    expect(ticks[5]?.actions).toEqual([{ type: "setRate", id: "p0", rate: 1 }]);
    expect(ticks.slice(6).flatMap((tick) => tick.actions)).toEqual([]);
  });
});
