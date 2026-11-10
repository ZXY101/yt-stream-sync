import { initialArchiveState, stepArchive } from "../controller/archive/step.ts";
import type { ArchiveSettings } from "../controller/archive/types.ts";
import type { Action } from "../controller/types.ts";
import type { SimulatedArchive } from "./simulated-archive.ts";

export interface ArchiveTick {
  second: number;
  positions: Record<string, number>;
  rates: Record<string, number>;
  states: Record<string, string>;
  actions: Action[];
}

export interface ArchiveRunOptions {
  players: SimulatedArchive[];
  seconds: number;
  settings?: Partial<ArchiveSettings>;
  events?: Record<number, () => void>;
}

const SUBSTEPS = 10;

function snapshot<T>(players: SimulatedArchive[], pick: (player: SimulatedArchive) => T) {
  return Object.fromEntries(players.map((player) => [player.id, pick(player)]));
}

/** Runs archive sync against simulated players once a second. */
export function runArchiveSync(options: ArchiveRunOptions): ArchiveTick[] {
  const { players, seconds } = options;
  const byId = new Map(players.map((player) => [player.id, player]));
  let state = initialArchiveState();
  const ticks: ArchiveTick[] = [];
  for (let second = 0; second < seconds; second += 1) {
    options.events?.[second]?.();
    const group = players.map((player) => player.id);
    const settings: ArchiveSettings = { enabled: true, group, offsets: {}, ...options.settings };
    const result = stepArchive(
      state,
      players.map((player) => player.sample()),
      settings,
    );
    state = result.state;
    for (const action of result.actions) {
      byId.get(action.id)?.apply(action);
    }
    ticks.push({
      second,
      positions: snapshot(players, (player) => player.position),
      rates: snapshot(players, (player) => player.playbackRate),
      states: snapshot(players, (player) => player.state),
      actions: result.actions,
    });
    for (let index = 0; index < SUBSTEPS; index += 1) {
      players.forEach((player) => player.advance(1 / SUBSTEPS));
    }
  }
  return ticks;
}
