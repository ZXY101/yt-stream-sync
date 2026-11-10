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
  /** Too far off to fix by speed: the group has to regroup. */
  needsJump: boolean;
}

export function isPlaying(sample: ArchiveSample): boolean {
  return sample.state === "playing" || sample.state === "buffering";
}

/** The follower's broadcast hadn't started yet at the reference's moment. */
export function isWaiting(target: number): boolean {
  return target < 0;
}

/** Where a follower should sit: its target, or its start while it's waiting. */
export function spotFor(target: number): number {
  return Math.max(0, target);
}

/** Play or pause the follower like the reference; hold it at its start while it's waiting. */
function matchPlayState(input: FollowInput): Action[] {
  const { follower, reference, target } = input;
  const id = follower.id;
  const shouldPlay = isPlaying(reference) && !isWaiting(target);
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

/** Keeps one follower on the reference's moment while everyone plays normally. */
export function follow(input: FollowInput): FollowResult {
  const { follower, target, tuning } = input;
  const drift = follower.position - spotFor(target);
  if (Math.abs(drift) > tuning.seekError && target <= follower.duration) {
    return { actions: [], trimming: false, needsJump: true };
  }
  const actions = matchPlayState(input);
  if (isWaiting(target) || target > follower.duration) {
    return { actions, trimming: false, needsJump: false };
  }
  const { rate, trimming } = trimmedRate(drift, input);
  if (Math.abs(follower.playbackRate - rate) > RATE_EPSILON) {
    actions.push({ type: "setRate", id: follower.id, rate });
  }
  return { actions, trimming, needsJump: false };
}
