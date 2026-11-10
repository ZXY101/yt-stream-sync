import { initialState, step } from "../controller/controller.ts";
import type { Action, StepResult, SyncSettings, Tuning } from "../controller/types.ts";
import type { SimulatedPlayer } from "./simulated-player.ts";

export interface Tick {
  second: number;
  latencies: Record<string, number>;
  buffers: Record<string, number>;
  rates: Record<string, number>;
  states: Record<string, string>;
  errors: StepResult["errors"];
  actions: Action[];
}

export interface RunOptions {
  players: SimulatedPlayer[];
  seconds: number;
  settings?: Partial<SyncSettings>;
  tuning?: Tuning;
  /** Things that happen at a given second, before that second's control step. */
  events?: Record<number, () => void>;
}

const SUBSTEPS = 10;
const DEFAULTS: SyncSettings = { enabled: true, offsets: {}, safetyMargin: 0 };

function snapshot<T>(
  players: SimulatedPlayer[],
  pick: (player: SimulatedPlayer) => T,
): Record<string, T> {
  return Object.fromEntries(players.map((player) => [player.id, pick(player)]));
}

/** Runs the controller against simulated players once a second, like the background script. */
export function runSync(options: RunOptions): Tick[] {
  const { players, seconds, tuning } = options;
  const byId = new Map(players.map((player) => [player.id, player]));
  let state = initialState();
  const ticks: Tick[] = [];
  for (let second = 0; second < seconds; second += 1) {
    options.events?.[second]?.();
    // Read every second, so a test can change settings mid-run.
    const settings: SyncSettings = { ...DEFAULTS, ...options.settings };
    const samples = players.map((player) => player.sample());
    const result = step(state, samples, settings, tuning);
    state = result.state;
    for (const action of result.actions) {
      byId.get(action.id)?.apply(action);
    }
    ticks.push({
      second,
      latencies: snapshot(players, (player) => player.latency),
      buffers: snapshot(players, (player) => player.bufferAhead),
      rates: snapshot(players, (player) => player.playbackRate),
      states: snapshot(players, (player) => player.state),
      errors: result.errors,
      actions: result.actions,
    });
    for (let index = 0; index < SUBSTEPS; index += 1) {
      players.forEach((player) => player.advance(1 / SUBSTEPS));
    }
  }
  return ticks;
}
