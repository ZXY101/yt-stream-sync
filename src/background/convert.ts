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
  if (action.type === "skip") {
    return { type: "skip", seconds: action.seconds };
  }
  return { type: action.type };
}

export function toLiveSample(id: string, report: LiveReport): PlayerSample {
  const { latency, bufferAhead, bufferLow, pinned, state, playbackRate } = report;
  return { id, latency, bufferAhead, bufferLow, pinned, state, playbackRate };
}

/**
 * `age` is how many seconds ago the report came in. A playing archive has moved on since,
 * and a jump aimed at its old position would land off by that much.
 */
export function toArchiveSample(id: string, report: ArchiveReport, age: number): ArchiveSample {
  const { duration, startTime, state, playbackRate, userActions } = report;
  const moved = state === "playing" ? age * playbackRate : 0;
  const position = Math.min(duration, report.position + moved);
  const bufferAhead = Math.max(0, report.bufferAhead - moved);
  return { id, position, duration, bufferAhead, startTime, state, playbackRate, userActions };
}

/**
 * What a player's report will say once it has carried out `command`. Reports sent before the
 * command arrived would otherwise make the next step undo it (e.g. pause a player that was
 * just told to play, because the reference still looked paused).
 */
export function assumeDone(report: PlayerReport, command: PlayerCommand): PlayerReport {
  if (command.type === "setRate") {
    return { ...report, playbackRate: command.rate };
  }
  if (command.type === "seek") {
    return report.kind === "archive"
      ? { ...report, position: command.position, bufferAhead: 0 }
      : report;
  }
  if (command.type === "skip" && report.kind === "live") {
    const { seconds } = command;
    return {
      ...report,
      latency: Math.max(0, report.latency - seconds),
      bufferAhead: Math.max(0, report.bufferAhead - seconds),
      bufferLow: Math.max(0, (report.bufferLow ?? report.bufferAhead) - seconds),
    };
  }
  if (command.type === "play" || command.type === "pause") {
    return { ...report, state: command.type === "play" ? "playing" : "paused" };
  }
  return report;
}

export type SyncInfo = Pick<PlayerStatus, "inGroup" | "offset" | "error" | "stuck" | "waveform">;

function kindDetails(report: PlayerReport): Partial<PlayerStatus> {
  if (report.kind === "live") {
    return { latency: report.latency, pinned: report.pinned };
  }
  return { position: report.position, hasStartTime: report.startTime !== undefined };
}

export function toStatus(id: string, report: PlayerReport, sync: SyncInfo): PlayerStatus {
  const { kind, title, channel, state, playbackRate, videoId } = report;
  const tabId = tabOf(id);
  const hearing = report.audio?.state;
  const base = { id, tabId, videoId, kind, title, channel, state, playbackRate, hearing };
  return { ...base, ...kindDetails(report), ...sync };
}
