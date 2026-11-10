import type { Action, Mode, PlayerSample, Tuning } from "./types.ts";

// Players report rates like 0.9200000001; anything closer than this counts as equal.
const RATE_EPSILON = 0.001;

/** The mode for a player that is `error` seconds ahead, with hysteresis around each switch. */
export function nextMode(mode: Mode, error: number, tuning: Tuning): Mode {
  if (mode === "paused" && error > tuning.resumeError) {
    return "paused";
  }
  if (mode !== "paused" && error > tuning.pauseError) {
    return "paused";
  }
  const threshold = mode === "normal" ? tuning.startError : tuning.stopError;
  return error > threshold ? "slowing" : "normal";
}

function rateFor(mode: Mode, tuning: Tuning): number {
  return mode === "slowing" ? tuning.slowRate : 1;
}

/**
 * Commands that bring a player into `mode`. Rates are re-sent whenever the player reports a
 * different one, which also undoes YouTube's own low-latency catch-up speed changes.
 */
export function actionsFor(sample: PlayerSample, mode: Mode, tuning: Tuning): Action[] {
  const { id } = sample;
  if (mode === "paused") {
    return sample.state === "paused" ? [] : [{ type: "pause", id }];
  }
  const actions: Action[] = [];
  // Only players the controller paused itself reach this point while paused.
  if (sample.state === "paused") {
    actions.push({ type: "play", id });
  }
  const rate = rateFor(mode, tuning);
  if (Math.abs(sample.playbackRate - rate) > RATE_EPSILON) {
    actions.push({ type: "setRate", id, rate });
  }
  return actions;
}
