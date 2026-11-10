import { initialState, step } from "../controller/controller.ts";
import type { Action, PlayerSample, SyncSettings } from "../controller/types.ts";
import type { PlayerCommand, PlayerReport, PlayerStatus } from "../lib/messages.ts";
import { createGroup } from "./group.ts";

// A player that hasn't reported for this long is left out until it reports again.
const STALE_AFTER = 3;

export interface CoordinatorOptions {
  send: (id: string, command: PlayerCommand) => void;
  /** Everything but the group, which the coordinator keeps itself. */
  settings: () => Omit<SyncSettings, "group">;
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

function toSample(id: string, report: PlayerReport): PlayerSample {
  const { latency, bufferAhead, state, playbackRate } = report;
  return { id, latency, bufferAhead, state, playbackRate };
}

type SyncInfo = Pick<PlayerStatus, "inGroup" | "error">;

function toStatus(id: string, report: PlayerReport, sync: SyncInfo): PlayerStatus {
  const { title, channel, latency, state, playbackRate } = report;
  return { id, title, channel, latency, state, playbackRate, ...sync };
}

/** Knows every frame with a live player and runs the controller over the opted-in ones. */
export function createCoordinator(options: CoordinatorOptions) {
  const entries = new Map<string, Entry>();
  const group = createGroup((id) => entries.get(id)?.report.videoId);
  let state = initialState();
  let errors: Record<string, number> = {};

  function remove(id: string) {
    entries.delete(id);
    group.remove(id);
  }

  function report(id: string, playerReport: PlayerReport | null) {
    if (playerReport) {
      entries.set(id, { report: playerReport, at: options.now() });
    } else {
      remove(id);
    }
  }

  function freshSamples(): PlayerSample[] {
    const now = options.now();
    const fresh = [...entries].filter(([, entry]) => now - entry.at <= STALE_AFTER);
    return fresh.map(([id, entry]) => toSample(id, entry.report));
  }

  function tick() {
    const settings = { ...options.settings(), group: group.ids() };
    const result = step(state, freshSamples(), settings);
    state = result.state;
    errors = result.errors;
    for (const action of result.actions) {
      options.send(action.id, toCommand(action));
    }
  }

  function status(): PlayerStatus[] {
    return [...entries].map(([id, entry]) =>
      toStatus(id, entry.report, { inGroup: group.has(id), error: errors[id] }),
    );
  }

  return { report, remove, setInGroup: group.set, tick, status };
}
