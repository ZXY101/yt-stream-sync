import type { Action } from "../types.ts";
import type { LiveSample } from "./types.ts";

/** How far each reading pulls the estimate towards itself. */
const GAIN = 0.1;
/** A reading this far off the estimate is a jump, not noise, if the next one agrees. */
const JUMP = 2.5;
/** Readings in a row, off the same way, that make a jump real. */
const JUMP_READINGS = 2;

/** Per player: the latency estimate, moved on to now, and readings in a row off by a jump. */
export type LatencyHistory = Readonly<Record<string, readonly number[]>>;

function estimate(previous: readonly number[] | undefined, reading: number): number[] {
  const [predicted, offBy = 0] = previous ?? [];
  if (predicted === undefined) {
    return [reading, 0];
  }
  const residual = reading - predicted;
  if (Math.abs(residual) < JUMP) {
    return [predicted + GAIN * residual, 0];
  }
  const streak =
    Math.sign(residual) === Math.sign(offBy) ? offBy + Math.sign(residual) : Math.sign(residual);
  if (Math.abs(streak) >= JUMP_READINGS) {
    return [reading, 0];
  }
  return [predicted, streak];
}

/**
 * Each player's latency, filtered. YouTube's stats can be off by seconds from one reading to
 * the next while the stream plays smoothly (seen on a real collab), and acting on every
 * reading made the sync slow two streams in turn every 2 s. Between readings a latency only
 * grows by what the speed adds, so the estimate follows that and is nudged by each reading;
 * a real jump (YouTube moving the stream) is taken once 2 readings in a row agree on it.
 * Pinned players are left as read: holding them back relies on spotting a snap in a single
 * reading (see `pinned-step.ts`).
 */
export function smoothLatencies(
  history: LatencyHistory,
  samples: readonly LiveSample[],
): { samples: LiveSample[]; history: Record<string, number[]> } {
  const next: Record<string, number[]> = {};
  const smoothed = samples.map((sample) => {
    if (sample.pinned === true) {
      return sample;
    }
    const filtered = estimate(history[sample.id], sample.latency);
    next[sample.id] = filtered;
    return { ...sample, latency: filtered[0] ?? sample.latency };
  });
  return { samples: smoothed, history: next };
}

/** Seconds a player's latency grows by in the next second, given what it was just told. */
function growth(sample: LiveSample, actions: readonly Action[]): number {
  if (sample.state !== "playing") {
    return 1;
  }
  const rate = actions.findLast((action) => action.type === "setRate");
  return 1 - (rate?.type === "setRate" ? rate.rate : sample.playbackRate);
}

/**
 * Moves each estimate on by one control step (about a second), by what the player's speed
 * adds. A skip, pause or play makes the estimate meaningless, so it's dropped.
 */
export function ageHistory(
  history: LatencyHistory,
  samples: readonly LiveSample[],
  actions: readonly Action[],
): Record<string, number[]> {
  const next: Record<string, number[]> = {};
  for (const sample of samples) {
    const [latency, offBy = 0] = history[sample.id] ?? [];
    const own = actions.filter((action) => action.id === sample.id);
    if (latency === undefined || own.some((action) => action.type !== "setRate")) {
      continue;
    }
    next[sample.id] = [latency + growth(sample, own), offBy];
  }
  return next;
}
