import type { Action } from "../types.ts";
import { isPlaying, isWaiting, spotFor } from "./follow.ts";
import type { ArchiveSample, ArchiveTuning } from "./types.ts";

export interface RegroupInput {
  members: readonly ArchiveSample[];
  reference: ArchiveSample;
  /** Where each follower should be, by id. */
  targets: Readonly<Record<string, number>>;
  /** Play once everyone is ready. */
  play: boolean;
  steps: number;
  tuning: ArchiveTuning;
}

export interface RegroupResult {
  actions: Action[];
  /** Everyone was ready (or waited long enough) and has been told to play or stay paused. */
  done: boolean;
  /** When it gave up waiting: the players that still weren't ready. */
  stuck: string[];
}

function isReady(sample: ArchiveSample, tuning: ArchiveTuning): boolean {
  if (sample.state === "buffering") {
    return false;
  }
  const nearEnd = sample.position >= sample.duration - tuning.readyBuffer;
  return nearEnd || sample.bufferAhead >= tuning.readyBuffer;
}

/** Pauses whoever plays and puts each follower on its spot. */
function hold(input: RegroupInput): Action[] {
  const { members, reference, targets, tuning } = input;
  const actions: Action[] = [];
  for (const sample of members) {
    if (sample.state === "playing") {
      actions.push({ type: "pause", id: sample.id });
    }
    const target = targets[sample.id];
    if (sample === reference || target === undefined || target > sample.duration) {
      continue;
    }
    const spot = spotFor(target);
    const settled = sample.state !== "buffering";
    if (settled && Math.abs(sample.position - spot) > tuning.alignError) {
      actions.push({ type: "seek", id: sample.id, position: spot });
    }
  }
  return actions;
}

function playAll(input: RegroupInput): Action[] {
  const { members, reference, targets } = input;
  return members
    .filter((sample) => sample === reference || !isWaiting(targets[sample.id] ?? 0))
    .filter((sample) => !isPlaying(sample))
    .map((sample) => ({ type: "play", id: sample.id }));
}

/**
 * One step of a regroup. After a jump every player re-buffers, and they finish at different
 * times; playing each as soon as it can would leave them that far apart. So everyone waits,
 * paused at their spot, until all have enough buffered, then all play in the same step.
 */
export function regroup(input: RegroupInput): RegroupResult {
  const actions = hold(input);
  const notReady = input.members.filter((sample) => !isReady(sample, input.tuning));
  const ready = actions.length === 0 && notReady.length === 0;
  if (!ready && input.steps < input.tuning.regroupSteps) {
    return { actions, done: false, stuck: [] };
  }
  const played = input.play ? [...actions, ...playAll(input)] : actions;
  return { actions: played, done: true, stuck: notReady.map((sample) => sample.id) };
}
