import type { Action } from "../types.ts";
import type { ArchiveSample, ArchiveTuning } from "./types.ts";

const RATE_EPSILON = 0.001;

export interface FollowInput {
  follower: ArchiveSample;
  reference: ArchiveSample;
  /** Where the follower should be right now. */
  target: number;
  trimming: boolean;
  tuning: ArchiveTuning;
}

export interface FollowResult {
  actions: Action[];
  trimming: boolean;
}

function isPlaying(sample: ArchiveSample): boolean {
  return sample.state === "playing" || sample.state === "buffering";
}

/** Play or pause the follower like the reference; wait at the start if it hasn't begun yet. */
function matchPlayState(input: FollowInput, waiting: boolean): Action[] {
  const { follower, reference } = input;
  const id = follower.id;
  const shouldPlay = isPlaying(reference) && !waiting;
  if (shouldPlay && follower.state === "paused") {
    return [{ type: "play", id }];
  }
  if (!shouldPlay && isPlaying(follower)) {
    return [{ type: "pause", id }];
  }
  return [];
}

function trimmedRate(drift: number, input: FollowInput): { rate: number; trimming: boolean } {
  const { tuning, reference } = input;
  const limit = input.trimming ? tuning.stopError : tuning.startError;
  if (Math.abs(drift) <= limit) {
    return { rate: reference.playbackRate, trimming: false };
  }
  const factor = drift > 0 ? 1 - tuning.trim : 1 + tuning.trim;
  return { rate: reference.playbackRate * factor, trimming: true };
}

/** Commands that keep one follower on the reference's moment. */
export function follow(input: FollowInput): FollowResult {
  const { follower, reference, target, tuning } = input;
  const id = follower.id;
  const waiting = target < 0;
  const actions = matchPlayState(input, waiting);
  if (waiting) {
    // The follower's broadcast hadn't started yet at this moment: hold it at the start.
    const atStart = follower.position < tuning.seekError;
    return {
      actions: atStart ? actions : [...actions, { type: "seek", id, position: 0 }],
      trimming: false,
    };
  }
  const settling = follower.state === "buffering" || reference.state === "buffering";
  if (settling || target > follower.duration) {
    return { actions, trimming: input.trimming };
  }
  const drift = follower.position - target;
  if (Math.abs(drift) > tuning.seekError) {
    actions.push({ type: "seek", id, position: target });
    return { actions, trimming: false };
  }
  const { rate, trimming } = trimmedRate(drift, input);
  if (Math.abs(follower.playbackRate - rate) > RATE_EPSILON) {
    actions.push({ type: "setRate", id, rate });
  }
  return { actions, trimming };
}
