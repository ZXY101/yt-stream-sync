import type { LiveReport, PlayerCommand, PlayerReport, StreamHealth } from "../lib/messages.ts";

/** Seconds of history the label is about. */
const WINDOW = 120;
/** No label before this: a stream that just joined has no history worth judging. */
const WARM_UP = 30;
/** A report this soon after one of our commands may still be carrying it out. */
const QUIET_AFTER_COMMAND = 3;
/** Latency that changes this much more than playback explains was moved by YouTube. */
const MOVE_THRESHOLD = 2;
const RATE_EPSILON = 0.001;
// Buffering and YouTube's moves weigh double: the sync causes corrections, the stream doesn't.
const STEADY_MAX = 2;
const SHAKY_MAX = 6;

type EventKind = "buffering" | "moved" | "corrections";

interface Track {
  since: number;
  last?: { report: LiveReport; at: number };
  commandAt: number;
  /** The speed we last set; anything else the player reports was YouTube's doing. */
  rate: number;
  events: { kind: EventKind; at: number }[];
  logged?: StreamHealth["label"];
}

/** How much latency should have grown between two reports, from how the player played. */
function expectedGrowth(previous: LiveReport, seconds: number): number {
  return previous.state === "playing" ? seconds * (1 - previous.playbackRate) : seconds;
}

function latencyJumped(previous: LiveReport, report: LiveReport, seconds: number): boolean {
  const growth = report.latency - previous.latency;
  return Math.abs(growth - expectedGrowth(previous, seconds)) >= MOVE_THRESHOLD;
}

function rateMoved(track: Track, previous: LiveReport, report: LiveReport): boolean {
  return isOff(report.playbackRate, track.rate) && !isOff(previous.playbackRate, track.rate);
}

function isOff(rate: number, expected: number): boolean {
  return Math.abs(rate - expected) > RATE_EPSILON;
}

/** Whether YouTube moved the stream since the last report, without being told to. */
function wasMoved(track: Track, report: LiveReport, at: number): boolean {
  const last = track.last;
  if (!last || at - track.commandAt < QUIET_AFTER_COMMAND) {
    return false;
  }
  if (last.report.state === "ad" || report.state === "ad") {
    return false;
  }
  return latencyJumped(last.report, report, at - last.at) || rateMoved(track, last.report, report);
}

/** Skips, pauses and slow-downs; handing a player back (play, speed 1) isn't a correction. */
function isCorrection(track: Track, command: PlayerCommand): boolean {
  if (command.type === "setRate") {
    return command.rate < 1 && track.rate >= 1 - RATE_EPSILON;
  }
  return command.type === "skip" || command.type === "pause";
}

function labelFor(points: number): StreamHealth["label"] {
  if (points <= STEADY_MAX) {
    return "steady";
  }
  return points <= SHAKY_MAX ? "shaky" : "unstable";
}

function countOf(track: Track, kind: EventKind): number {
  return track.events.filter((event) => event.kind === kind).length;
}

function summarize(track: Track): StreamHealth {
  const buffering = countOf(track, "buffering");
  const moved = countOf(track, "moved");
  const corrections = countOf(track, "corrections");
  const label = labelFor(2 * buffering + 2 * moved + corrections);
  return { label, buffering, moved, corrections };
}

function recordCommand(track: Track, command: PlayerCommand, at: number) {
  track.commandAt = at;
  if (isCorrection(track, command)) {
    track.events.push({ kind: "corrections", at });
  }
  if (command.type === "setRate") {
    track.rate = command.rate;
  }
}

/** The debug log line for a stream whose label changed. */
function describeChange(id: string, health: StreamHealth): string {
  const { label, buffering, moved, corrections } = health;
  const counts = `buffered ${buffering}, moved ${moved}, corrected ${corrections}`;
  return `health ${id}: ${label} (${counts} in 2 min)`;
}

/**
 * How calm each live stream in the group has been over the last 2 minutes: how often it
 * buffered, how often YouTube moved it by itself, and how often the sync had to correct it.
 * Only shown to the user; the sync never acts on it.
 */
export function createHealth(now: () => number, note: (text: string) => void) {
  const tracks = new Map<string, Track>();

  /** Tracks exactly these players; one that (re)joins starts with a clean history. */
  function follow(ids: readonly string[]) {
    for (const id of tracks.keys()) {
      if (!ids.includes(id)) {
        tracks.delete(id);
      }
    }
    for (const id of ids) {
      if (!tracks.has(id)) {
        tracks.set(id, { since: now(), commandAt: -Infinity, rate: 1, events: [] });
      }
    }
  }

  function onReport(id: string, report: PlayerReport) {
    const track = tracks.get(id);
    if (!track || report.kind !== "live") {
      return;
    }
    const at = now();
    if (report.state === "buffering" && track.last?.report.state !== "buffering") {
      track.events.push({ kind: "buffering", at });
    }
    if (wasMoved(track, report, at)) {
      track.events.push({ kind: "moved", at });
    }
    track.last = { report, at };
  }

  function onCommand(id: string, command: PlayerCommand) {
    const track = tracks.get(id);
    if (track) {
      recordCommand(track, command, now());
    }
  }

  /** The stream's health, once it has been watched for 30 s. */
  function get(id: string): StreamHealth | undefined {
    const track = tracks.get(id);
    const time = now();
    if (!track?.last || time - track.since < WARM_UP) {
      return undefined;
    }
    track.events = track.events.filter((event) => time - event.at <= WINDOW);
    const health = summarize(track);
    if (health.label !== track.logged) {
      track.logged = health.label;
      note(describeChange(id, health));
    }
    return health;
  }

  return { follow, onReport, onCommand, get };
}
