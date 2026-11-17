import { runSync, type Tick } from "./run-sync.ts";
import { SimulatedPlayer, type SimulatedPlayerOptions } from "./simulated-player.ts";

/**
 * Fixed situations the live sync is scored on, so a change can be compared with what came
 * before it (`bench-baseline.json`) before anyone hand-tests it. Each one is deterministic.
 */
export interface Scenario {
  name: string;
  players: Omit<SimulatedPlayerOptions, "id">[];
  /** Things that happen at a given second, given the players by index. */
  events?: (players: SimulatedPlayer[]) => Record<number, () => void>;
}

/** Lower is better for every score. */
export interface Scores {
  /** Median gap between the streams furthest apart, over the last two minutes (s). */
  spread: number;
  /** The worst 10% of those gaps, from the first minute on (s). */
  worstSpread: number;
  /** Seconds until the gap stays under half a second; the run length if it never does. */
  settleTime: number;
  /** Commands that move a stream: skips, pauses and speed changes. */
  moves: number;
  /** Seconds spent buffering, all streams together. */
  stalls: number;
}

const SECONDS = 300;
const WARM_UP = 60;
const TAIL = 120;
const SETTLED_GAP = 0.5;

/** A network drop of `seconds` on one player every `every` seconds. */
function dropsEvery(player: SimulatedPlayer, every: number, seconds: number) {
  const events: Record<number, () => void> = {};
  for (let second = every; second < SECONDS; second += every) {
    events[second] = () => player.dropNetwork(seconds);
  }
  return events;
}

export const SCENARIOS: Scenario[] = [
  { name: "two streams 3 s apart", players: [{ latency: 3.6 }, { latency: 6.5 }] },
  { name: "three streams spread out", players: [{ latency: 4 }, { latency: 7 }, { latency: 11 }] },
  { name: "leader 12 s ahead", players: [{ latency: 4 }, { latency: 16 }] },
  {
    name: "rewind-off leader 12 s ahead",
    players: [{ latency: 4, rewind: false }, { latency: 16 }],
  },
  {
    name: "rewind-off streams 3 s apart",
    players: [
      { latency: 4, rewind: false },
      { latency: 7, rewind: false },
    ],
  },
  {
    name: "one shaky stream of three",
    players: [{ latency: 5 }, { latency: 6 }, { latency: 7 }],
    events: (players) => dropsEvery(players[1] as SimulatedPlayer, 45, 4),
  },
  {
    name: "two shaky streams of three",
    players: [{ latency: 5 }, { latency: 6 }, { latency: 7 }],
    events: (players) => ({
      ...dropsEvery(players[0] as SimulatedPlayer, 50, 3),
      ...dropsEvery(players[2] as SimulatedPlayer, 35, 5),
    }),
  },
  {
    name: "ad on one stream",
    players: [{ latency: 5 }, { latency: 6 }],
    events: (players) => ({ 60: () => (players[0] as SimulatedPlayer).showAd(15) }),
  },
];

function spreadAt(tick: Tick): number {
  const lags = Object.values(tick.latencies);
  return Math.max(...lags) - Math.min(...lags);
}

function quantile(values: readonly number[], q: number): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;
}

function settleTime(spreads: readonly number[]): number {
  const lastWide = spreads.findLastIndex((spread) => spread >= SETTLED_GAP);
  return lastWide + 1;
}

const MOVES = new Set(["skip", "pause", "setRate"]);

function score(ticks: readonly Tick[]): Scores {
  const spreads = ticks.map(spreadAt);
  const actions = ticks.flatMap((tick) => tick.actions);
  const states = ticks.flatMap((tick) => Object.values(tick.states));
  return {
    spread: quantile(spreads.slice(-TAIL), 0.5),
    worstSpread: quantile(spreads.slice(WARM_UP), 0.9),
    settleTime: settleTime(spreads),
    moves: actions.filter((action) => MOVES.has(action.type)).length,
    stalls: states.filter((state) => state === "buffering").length,
  };
}

export function runScenario(scenario: Scenario): Scores {
  const players = scenario.players.map(
    (options, index) => new SimulatedPlayer({ id: `p${index}`, ...options }),
  );
  const events = scenario.events?.(players);
  return score(runSync({ players, seconds: SECONDS, events }));
}
