import type { PlayerCommand, PlayerReport } from "../lib/messages.ts";
import { assumeDone } from "./convert.ts";

// A player that hasn't reported for this long is left out until it reports again.
const STALE_AFTER = 3;

interface Entry {
  report: PlayerReport;
  at: number;
}

/** The latest report from every player, and when it came in. */
export function createReportStore(now: () => number) {
  const entries = new Map<string, Entry>();

  /** Stores a report and returns the one it replaced. */
  function set(id: string, report: PlayerReport): PlayerReport | undefined {
    const previous = entries.get(id)?.report;
    entries.set(id, { report, at: now() });
    return previous;
  }

  /** Until the player reports back, assume it carried out `command`. */
  function assume(id: string, command: PlayerCommand) {
    const entry = entries.get(id);
    if (entry) {
      entries.set(id, { ...entry, report: assumeDone(entry.report, command) });
    }
  }

  /** Reports recent enough to sync on: [player id, report, seconds since it came in]. */
  function fresh(): [string, PlayerReport, number][] {
    const time = now();
    return [...entries]
      .filter(([, entry]) => time - entry.at <= STALE_AFTER)
      .map(([id, entry]) => [id, entry.report, time - entry.at]);
  }

  return {
    set,
    assume,
    fresh,
    get: (id: string) => entries.get(id)?.report,
    delete: (id: string) => entries.delete(id),
    all: () => [...entries].map(([id, entry]): [string, PlayerReport] => [id, entry.report]),
  };
}
