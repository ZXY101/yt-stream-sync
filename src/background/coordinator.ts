import type { SyncSettings } from "../controller/types.ts";
import type { PlayerCommand, PlayerReport, SyncStatus } from "../lib/messages.ts";
import { createControllers } from "./controllers.ts";
import { toCommand, toStatus, type SyncInfo } from "./convert.ts";
import { createGroup } from "./group.ts";

// A player that hasn't reported for this long is left out until it reports again.
const STALE_AFTER = 3;

export interface CoordinatorOptions {
  send: (id: string, command: PlayerCommand) => void;
  /** Settings the user doesn't set per player (the group and nudges live here). */
  settings: () => Pick<SyncSettings, "enabled" | "safetyMargin">;
  /** Seconds on a monotonic clock. */
  now: () => number;
}

interface Entry {
  report: PlayerReport;
  at: number;
}

/** The user just seeked, played, paused or changed speed on this archive. */
function wasTouched(report: PlayerReport, previous: PlayerReport | undefined): boolean {
  if (report.kind !== "archive" || previous?.kind !== "archive") {
    return false;
  }
  return report.userActions > previous.userActions;
}

/** Reports recent enough to sync on: [player id, report, seconds since it came in]. */
function freshReports(entries: Map<string, Entry>, now: number): [string, PlayerReport, number][] {
  return [...entries]
    .filter(([, entry]) => now - entry.at <= STALE_AFTER)
    .map(([id, entry]) => [id, entry.report, now - entry.at]);
}

/**
 * Knows every frame with a live stream or archive, and runs the matching controller over the
 * players the user opted in. Live streams and archives can't be synced together.
 */
export function createCoordinator(options: CoordinatorOptions) {
  const entries = new Map<string, Entry>();
  const group = createGroup((id) => entries.get(id)?.report.videoId);
  const controllers = createControllers();
  let errors: Record<string, number> = {};

  function remove(id: string) {
    entries.delete(id);
    group.remove(id);
  }

  function report(id: string, playerReport: PlayerReport | null) {
    if (!playerReport) {
      remove(id);
      return;
    }
    const previous = entries.get(id)?.report;
    entries.set(id, { report: playerReport, at: options.now() });
    // The others follow what the user just did now, not on the next second.
    if (wasTouched(playerReport, previous) && group.has(id)) {
      tick();
    }
  }

  function isMixed(ids: readonly string[]): boolean {
    return new Set(ids.map((id) => entries.get(id)?.report.kind)).size > 1;
  }

  function tick() {
    const ids = group.ids();
    const groupIds = isMixed(ids) ? [] : ids;
    const settings = { ...options.settings(), group: groupIds, offsets: group.offsets() };
    const result = controllers.run(freshReports(entries, options.now()), settings);
    errors = result.errors;
    for (const action of result.actions) {
      options.send(action.id, toCommand(action));
    }
  }

  function syncInfo(id: string): SyncInfo {
    return { inGroup: group.has(id), offset: group.offset(id), error: errors[id] };
  }

  function status(): SyncStatus {
    const players = [...entries].map(([id, entry]) => toStatus(id, entry.report, syncInfo(id)));
    return { players, mixed: isMixed(group.ids()) };
  }

  function nudge(id: string, seconds: number) {
    group.nudge(id, seconds);
    // Applied now, so the user sees each press take effect.
    tick();
  }

  return { report, remove, setInGroup: group.set, nudge, tick, status };
}
