import { initialState, step } from "../controller/controller.ts";
import type { Action, PlayerSample, SyncSettings } from "../controller/types.ts";
import type { PlayerCommand, PlayerReport, PlayerStatus } from "../lib/messages.ts";

// A player that hasn't reported for this long is left out until it reports again.
const STALE_AFTER = 3;

export interface CoordinatorOptions {
  send: (id: string, command: PlayerCommand) => void;
  settings: () => SyncSettings;
  /** Seconds on a monotonic clock. */
  now: () => number;
}

interface Entry {
  report: PlayerReport;
  at: number;
}

function toCommand(action: Action): PlayerCommand {
  if (action.type === "setRate") {
    return { type: "setRate", rate: action.rate };
  }
  return { type: action.type };
}

/** Keeps the sync group (every frame with a live player) and runs the controller over it. */
export function createCoordinator(options: CoordinatorOptions) {
  const entries = new Map<string, Entry>();
  let state = initialState();
  let errors: Record<string, number> = {};

  function report(id: string, playerReport: PlayerReport | null) {
    if (playerReport) {
      entries.set(id, { report: playerReport, at: options.now() });
    } else {
      entries.delete(id);
    }
  }

  function remove(id: string) {
    entries.delete(id);
  }

  function freshSamples(): PlayerSample[] {
    const now = options.now();
    const fresh = [...entries].filter(([, entry]) => now - entry.at <= STALE_AFTER);
    return fresh.map(([id, { report: r }]) => ({
      id,
      latency: r.latency,
      bufferAhead: r.bufferAhead,
      state: r.state,
      playbackRate: r.playbackRate,
    }));
  }

  function tick() {
    const result = step(state, freshSamples(), options.settings());
    state = result.state;
    errors = result.errors;
    for (const action of result.actions) {
      options.send(action.id, toCommand(action));
    }
  }

  function status(): PlayerStatus[] {
    return [...entries].map(([id, { report: r }]) => ({
      id,
      title: r.title,
      channel: r.channel,
      latency: r.latency,
      state: r.state,
      playbackRate: r.playbackRate,
      error: errors[id],
    }));
  }

  return { report, remove, tick, status };
}
