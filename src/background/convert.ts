import type { ArchiveSample } from "../controller/archive/types.ts";
import type { Action, PlayerSample } from "../controller/types.ts";
import {
  tabOf,
  type ArchiveReport,
  type LiveReport,
  type PlayerCommand,
  type PlayerReport,
  type PlayerStatus,
} from "../lib/messages.ts";

export function toCommand(action: Action): PlayerCommand {
  if (action.type === "setRate") {
    return { type: "setRate", rate: action.rate };
  }
  if (action.type === "seek") {
    return { type: "seek", position: action.position };
  }
  return { type: action.type };
}

export function toLiveSample(id: string, report: LiveReport): PlayerSample {
  const { latency, bufferAhead, state, playbackRate } = report;
  return { id, latency, bufferAhead, state, playbackRate };
}

/**
 * `age` is how many seconds ago the report came in. A playing archive has moved on since,
 * and a jump aimed at its old position would land off by that much.
 */
export function toArchiveSample(id: string, report: ArchiveReport, age: number): ArchiveSample {
  const { duration, startTime, state, playbackRate, userActions } = report;
  const moved = state === "playing" ? age * playbackRate : 0;
  const position = Math.min(duration, report.position + moved);
  return { id, position, duration, startTime, state, playbackRate, userActions };
}

export type SyncInfo = Pick<PlayerStatus, "inGroup" | "offset" | "error">;

function kindDetails(report: PlayerReport): Partial<PlayerStatus> {
  if (report.kind === "live") {
    return { latency: report.latency };
  }
  return { position: report.position, hasStartTime: report.startTime !== undefined };
}

export function toStatus(id: string, report: PlayerReport, sync: SyncInfo): PlayerStatus {
  const { kind, title, channel, state, playbackRate, videoId } = report;
  const tabId = tabOf(id);
  const base = { id, tabId, videoId, kind, title, channel, state, playbackRate };
  return { ...base, ...kindDetails(report), ...sync };
}
