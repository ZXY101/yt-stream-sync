import type { AudioStatus, PlayerCommand, PlayerReport } from "../lib/messages.ts";
import { createDebugLog } from "./debug-log.ts";

const LEVELS_EVERY = 5;

type Send = (id: string, command: PlayerCommand) => void;

function describe(report: PlayerReport): string {
  const where =
    report.kind === "live"
      ? `latency ${report.latency.toFixed(1)}`
      : `at ${report.position.toFixed(1)}`;
  return `${report.state} ${where} x${report.playbackRate.toFixed(2)}`;
}

function userActed(report: PlayerReport, previous: PlayerReport | undefined): boolean {
  if (report.kind !== "archive" || previous?.kind !== "archive") {
    return false;
  }
  return report.userActions > previous.userActions;
}

/**
 * Logs a group member that stopped reporting, once, and when it's back. Its last report
 * still shows in the players line, so without this a silent stream looks merely calm.
 */
function createStaleWatch(add: (line: string) => void) {
  let silent = new Set<string>();
  return function noteStale(stale: readonly [string, number][]) {
    const current = new Set(stale.map(([id]) => id));
    for (const [id, seconds] of stale) {
      if (!silent.has(id)) {
        add(`no readings from ${id} for ${Math.round(seconds)} s: left out of the sync`);
      }
    }
    for (const id of silent) {
      if (!current.has(id)) {
        add(`${id} reports again`);
      }
    }
    silent = current;
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
  const noteStale = createStaleWatch(log.add);

  function onCommand(id: string, command: PlayerCommand) {
    if (command.type !== "clip") {
      log.add(`→ ${id} ${JSON.stringify(command)}`);
    }
  }

  /** Every command sent through this is logged, and shown to `watch` too. */
  function logged(send: Send, watch: Send = () => {}) {
    return (id: string, command: PlayerCommand) => {
      onCommand(id, command);
      watch(id, command);
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

  function afterTick(audio: AudioStatus, reports: [string, PlayerReport][]) {
    const text = JSON.stringify(audio);
    if (text !== lastAudio) {
      log.add(`audio: ${text}`);
      lastAudio = text;
    }
    if (now() - levelsAt >= LEVELS_EVERY) {
      levelsAt = now();
      const players = reports.map(
        ([id, report]) => `${id} ${describe(report)} loudest ${(loudest.get(id) ?? 0).toFixed(3)}`,
      );
      log.add(`players: ${players.join(" | ") || "none"}`);
      loudest.clear();
    }
  }

  return { logged, onReport, noteStale, afterTick, note: log.add, text: log.text };
}
