import type { PlayerSample, Reach, Tuning } from "./types.ts";

// Each retry tries this much further than what YouTube last allowed.
const EASE = 0.5;

/**
 * Counts down the learned limits; when the time is up, eases each by `EASE` and starts
 * again, so a stream that YouTube moved is tried a little further now and then.
 */
function countDown(reach: Reach, tuning: Tuning): Reach {
  if (reach.forgetIn === undefined) {
    return reach;
  }
  if (reach.forgetIn > 1) {
    return { ...reach, forgetIn: reach.forgetIn - 1 };
  }
  const eased: Reach = { ...reach, forgetIn: tuning.learnedSteps };
  if (reach.floor !== undefined) {
    eased.floor = reach.floor - EASE;
  }
  if (reach.ceiling !== undefined) {
    eased.ceiling = reach.ceiling + EASE;
  }
  return eased;
}

/**
 * Updates what's known about where a no-rewind stream stays. YouTube moves these on its own:
 * further back after a stall or a jump ahead it won't keep (seen 6.8 → 19.1 s), toward live
 * when it is held too far back (seen 15 → 9 s). Either move teaches a limit, kept for a while.
 */
export function learnReach(
  previous: Reach | undefined,
  sample: PlayerSample,
  tuning: Tuning,
): Reach {
  const { latency } = sample;
  if (!previous) {
    return { home: latency, last: latency };
  }
  const reach = countDown(previous, tuning);
  const moved = latency - previous.last;
  const forgetIn = tuning.learnedSteps;
  if (moved > tuning.moveJump) {
    const floor = previous.last + tuning.learnedMargin;
    return { ...reach, home: latency, last: latency, floor, forgetIn, pressedFor: 0 };
  }
  if (moved < -tuning.moveJump && sample.state === "playing") {
    const ceiling = previous.last - tuning.learnedMargin;
    return { ...reach, home: latency, last: latency, ceiling, forgetIn, pressedFor: 0 };
  }
  return { ...reach, last: latency };
}

export interface Range {
  low: number;
  high: number;
}

/**
 * The latencies a no-rewind stream can sit at now: no closer to live than its buffer allows
 * (keeping `noRewindMinBuffer`) or than a learned floor, no further back than a little past
 * where YouTube keeps it or than a learned ceiling.
 */
export function reachRange(sample: PlayerSample, reach: Reach, tuning: Tuning): Range {
  const buffer = sample.bufferLow ?? sample.bufferAhead;
  const edge = sample.latency - buffer + tuning.noRewindMinBuffer;
  const low = Math.max(edge, reach.floor ?? -Infinity);
  const roomy = Math.min(reach.home + tuning.slowRoom, reach.ceiling ?? Infinity);
  return { low, high: Math.max(low, roomy) };
}

/** The back limit comes from where YouTube keeps it, not from a ceiling it showed. */
function roomFromHome(reach: Reach, tuning: Tuning): boolean {
  return reach.ceiling === undefined || reach.ceiling > reach.home + tuning.slowRoom;
}

/**
 * Probes how far back YouTube lets a stream go: one held at its back limit while the group
 * wants it further back gets a second more room every `probeSteps`, until YouTube pulls it
 * toward live (which teaches a ceiling, see `learnReach`).
 */
export function probeRoom(reach: Reach, pressed: boolean, tuning: Tuning): Reach {
  if (!pressed || !roomFromHome(reach, tuning)) {
    return reach.pressedFor ? { ...reach, pressedFor: 0 } : reach;
  }
  const pressedFor = (reach.pressedFor ?? 0) + 1;
  if (pressedFor < tuning.probeSteps) {
    return { ...reach, pressedFor };
  }
  return { ...reach, home: reach.home + 1, pressedFor: 0 };
}
