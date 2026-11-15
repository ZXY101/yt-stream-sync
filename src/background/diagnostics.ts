import type { AudioStatus, PlayerCommand, PlayerReport } from "../lib/messages.ts";
import { createDebugLog } from "./debug-log.ts";

const LEVELS_EVERY = 5;

function describe(report: PlayerReport): string {
  const where =
    report.kind === "live"
      ? `latency ${report.latency.toFixed(1)} buffer ${report.bufferAhead.toFixed(1)}`
      : `at ${report.position.toFixed(1)}`;
  return `${report.state} ${where} x${report.playbackRate.toFixed(2)}`;
}

/** "MDE_STREAM_OPTIMIZATIONS_RENDERER_LATENCY_LOW" → "LOW". */
function shortClass(latencyClass: string | undefined): string {
  return latencyClass?.replace(/^.*_LATENCY_/, "") || "unknown";
}

/** Who a player is, for the log: enough to look the stream up again. */
function identify(report: PlayerReport): string {
  const url = `https://www.youtube.com/watch?v=${report.videoId}`;
  const who = `"${report.title}" by ${report.channel || "?"}`;
  if (report.kind !== "live") {
    return `archive ${url} ${who}`;
  }
  const flags = [
    `latency class ${shortClass(report.latencyClass)}`,
    `rewind ${report.noRewind === true ? "off" : "on"}`,
    ...(report.pinned === true ? ["pinned"] : []),
  ];
  return `live ${url} ${who} (${flags.join(", ")})`;
}

function userActed(report: PlayerReport, previous: PlayerReport | undefined): boolean {
  if (report.kind !== "archive" || previous?.kind !== "archive") {
    return false;
  }
  return report.userActions > previous.userActions;
}

/** Where the sync has each grouped player, and how long audio matching has heard it steady. */
export interface SyncNotes {
  /** Seconds ahead of the group's spot (negative: behind). */
  errors: Readonly<Record<string, number>>;
  /** Players the sync can't move any closer. */
  stuck: readonly string[];
  /** Seconds each has played steadily; audio matching needs 30. */
  steady: Readonly<Record<string, number>>;
}

const NO_NOTES: SyncNotes = { errors: {}, stuck: [], steady: {} };

/** " 2.0 s ahead stuck steady 0 s" for a grouped player; nothing for the others. */
function place(id: string, sync: SyncNotes): string {
  const error = sync.errors[id];
  if (error === undefined) {
    return "";
  }
  const off = Math.abs(error).toFixed(1);
  const where = off === "0.0" ? "in sync" : `${off} s ${error > 0 ? "ahead" : "behind"}`;
  const stuck = sync.stuck.includes(id) ? " stuck" : "";
  return ` ${where}${stuck} steady ${Math.round(sync.steady[id] ?? 0)} s`;
}

/** Logs players joining (with who they are) and leaving the sync group. */
function createGroupLog(log: ReturnType<typeof createDebugLog>) {
  let members = new Set<string>();

  return function onGroup(ids: readonly string[], reports: ReadonlyMap<string, PlayerReport>) {
    // Only players with a report count as joined, so each join is logged with its details.
    const next = new Set(ids.filter((id) => reports.has(id)));
    for (const id of next) {
      const report = reports.get(id);
      if (!members.has(id) && report) {
        log.add(`joined group: ${id} ${identify(report)}`);
      }
    }
    for (const id of members) {
      if (!next.has(id)) {
        log.add(`left group: ${id}`);
      }
    }
    members = next;
  };
}

/**
 * Writes what the add-on decides and sees to the debug log: commands, the user's actions,
 * how audio matching goes, and how loud each player sounds (silence means it can't hear).
 */
export function createDiagnostics(now: () => number, log = createDebugLog()) {
  const loudest = new Map<string, number>();
  let lastAudio = "";
  let levelsAt = 0;
  const onGroup = createGroupLog(log);

  function onCommand(id: string, command: PlayerCommand) {
    if (command.type !== "clip") {
      log.add(`→ ${id} ${JSON.stringify(command)}`);
    }
  }

  /** Every command sent through this is logged. */
  function logged(send: (id: string, command: PlayerCommand) => void) {
    return (id: string, command: PlayerCommand) => {
      onCommand(id, command);
      send(id, command);
    };
  }

  function onReport(id: string, report: PlayerReport, previous: PlayerReport | undefined) {
    if (userActed(report, previous)) {
      log.add(`user acted on ${id}: ${describe(report)}`);
    }
    if (report.audio?.note) {
      log.add(`listening to ${id}: ${report.audio.note}`);
    }
    const peak = Math.max(0, ...(report.audio?.envelope ?? []));
    loudest.set(id, Math.max(loudest.get(id) ?? 0, peak));
  }

  function afterTick(
    audio: AudioStatus,
    reports: [string, PlayerReport][],
    groupIds: readonly string[] = [],
    sync: SyncNotes = NO_NOTES,
  ) {
    onGroup(groupIds, new Map(reports));
    const text = JSON.stringify(audio);
    if (text !== lastAudio) {
      log.add(`audio: ${text}`);
      lastAudio = text;
    }
    if (now() - levelsAt >= LEVELS_EVERY) {
      levelsAt = now();
      const players = reports.map(
        ([id, report]) =>
          `${id} ${describe(report)} loudest ${(loudest.get(id) ?? 0).toFixed(3)}${place(id, sync)}`,
      );
      log.add(`players: ${players.join(" | ") || "none"}`);
      loudest.clear();
    }
  }

  return { logged, onReport, afterTick, note: log.add, text: log.text };
}
