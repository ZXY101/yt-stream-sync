import type { SyncSettings } from "../controller/types.ts";
import type { PlayerCommand, PlayerReport, SyncStatus } from "../lib/messages.ts";
import { createControllers } from "./controllers.ts";
import { toCommand, toStatus, type SyncInfo } from "./convert.ts";
import { createGroup } from "./group.ts";
import { createReportStore } from "./reports.ts";

export interface CoordinatorOptions {
  send: (id: string, command: PlayerCommand) => void;
  /** Settings the user doesn't set per player (the group and nudges live here). */
  settings: () => Pick<SyncSettings, "enabled" | "safetyMargin">;
  /** Seconds on a monotonic clock. */
  now: () => number;
}

/** The user just seeked, played, paused or changed speed on this archive. */
function wasTouched(report: PlayerReport, previous: PlayerReport | undefined): boolean {
  if (report.kind !== "archive" || previous?.kind !== "archive") {
    return false;
  }
  return report.userActions > previous.userActions;
}

/**
 * Knows every frame with a live stream or archive, and runs the matching controller over the
 * players the user opted in. Live streams and archives can't be synced together.
 */
export function createCoordinator(options: CoordinatorOptions) {
  const reports = createReportStore(options.now);
  const group = createGroup((id) => reports.get(id)?.videoId);
  const controllers = createControllers();
  let errors: Record<string, number> = {};

  function remove(id: string) {
    reports.delete(id);
    group.remove(id);
  }

  function report(id: string, playerReport: PlayerReport | null) {
    if (!playerReport) {
      remove(id);
      return;
    }
    const previous = reports.set(id, playerReport);
    // The others follow what the user just did now, not on the next second.
    if (wasTouched(playerReport, previous) && group.has(id)) {
      tick();
    }
  }

  function isMixed(ids: readonly string[]): boolean {
    return new Set(ids.map((id) => reports.get(id)?.kind)).size > 1;
  }

  function tick() {
    const ids = group.ids();
    const groupIds = isMixed(ids) ? [] : ids;
    const settings = { ...options.settings(), group: groupIds, offsets: group.offsets() };
    const result = controllers.run(reports.fresh(), settings);
    errors = result.errors;
    for (const action of result.actions) {
      const command = toCommand(action);
      options.send(action.id, command);
      reports.assume(action.id, command);
    }
  }

  function syncInfo(id: string): SyncInfo {
    return { inGroup: group.has(id), offset: group.offset(id), error: errors[id] };
  }

  function status(): SyncStatus {
    const players = reports.all().map(([id, r]) => toStatus(id, r, syncInfo(id)));
    return { players, mixed: isMixed(group.ids()) };
  }

  function nudge(id: string, seconds: number) {
    group.nudge(id, seconds);
    // Applied now, so the user sees each press take effect.
    tick();
  }

  return { report, remove, setInGroup: group.set, nudge, tick, status };
}
