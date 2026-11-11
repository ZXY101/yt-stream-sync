import { releaseActions } from "./player-step.ts";
import type { Action, Mode, PlayerSample, Tuning } from "./types.ts";

// The latency reading takes about a second to follow a seek (seen on a real stream), so a
// snap-back is only looked for a few steps after one.
const SETTLE_STEPS = 3;

export interface PinnedInput {
  sample: PlayerSample;
  previousMode: Mode;
  /** Steps left before this player may be moved again. */
  cooldown: number;
  /** Seconds ahead of the target (negative: behind). */
  error: number;
  tuning: Tuning;
  /** Latency the last hold-back should have left it at, if it was held back. */
  held: number | undefined;
  /** Highest latency this player has held at, learned from snap-backs. */
  ceiling: number;
}

export interface PinnedStep {
  cooldown: number;
  actions: Action[];
  held: number | undefined;
  ceiling: number;
  /** Ahead of the target but can't be held back any further. */
  stuck: boolean;
}

/**
 * YouTube sends an ultra-low-latency player back to the live edge once it falls too far
 * behind. When its latency drops well below where a hold-back left it, that happened:
 * the player won't hold that far back, so its ceiling comes down.
 */
function learnCeiling(input: PinnedInput): Pick<PinnedStep, "held" | "ceiling"> {
  const { sample, held, ceiling, tuning } = input;
  const settled = input.cooldown <= tuning.jumpCooldown - SETTLE_STEPS;
  if (settled && held !== undefined && sample.latency < held - tuning.snapDrop) {
    return { held: undefined, ceiling: Math.min(ceiling, held - tuning.snapMargin) };
  }
  return { held, ceiling };
}

/**
 * One step for a pinned (ultra-low-latency) player. It is never paused or slowed: YouTube
 * undoes a pause and sometimes a slow-down (seen on real streams). A small seek back holds
 * as long as its latency stays below about 5 s (probed on two real streams), so a player
 * ahead of the target is held back that way, up to its ceiling. One that was held back and
 * is now behind the target jumps ahead again.
 */
export function stepPinned(input: PinnedInput): PinnedStep {
  const { sample, error, tuning, cooldown } = input;
  const actions = releaseActions(sample, input.previousMode);
  const learned = learnCeiling(input);
  const headroom = Math.max(0, learned.ceiling - sample.latency);
  const stuck = error > tuning.holdError && headroom < tuning.holdError;
  const result = { cooldown, actions, ...learned, stuck };
  if (cooldown > 0 || sample.state !== "playing") {
    return result;
  }
  const back = Math.min(error, headroom, tuning.maxHoldStep);
  if (back >= tuning.holdError) {
    actions.push({ type: "skip", id: sample.id, seconds: -back });
    return { ...result, cooldown: tuning.jumpCooldown, held: sample.latency + back };
  }
  if (error <= -tuning.holdError) {
    actions.push({ type: "skip", id: sample.id, seconds: -error });
    return { ...result, cooldown: tuning.jumpCooldown, held: undefined };
  }
  return result;
}
