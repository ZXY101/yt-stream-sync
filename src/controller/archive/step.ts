import type { Action } from "../types.ts";
import { assignBases, pickReference, shownMoment, targetPosition } from "./clock.ts";
import { follow, isPlaying } from "./follow.ts";
import { regroup } from "./regroup.ts";
import { ARCHIVE_TUNING } from "./tuning.ts";
import type {
  ArchiveSample,
  ArchiveSettings,
  ArchiveState,
  ArchiveStepResult,
  ArchiveTuning,
} from "./types.ts";

export function initialArchiveState(): ArchiveState {
  return { seen: {}, bases: {}, trimming: {} };
}

function seenCounts(samples: readonly ArchiveSample[]): Record<string, number> {
  return Object.fromEntries(samples.map((sample) => [sample.id, sample.userActions]));
}

/** Nothing to sync: players whose speed was trimmed go back to normal speed. */
function idle(state: ArchiveState, samples: readonly ArchiveSample[]): ArchiveStepResult {
  const actions: Action[] = [];
  for (const sample of samples) {
    if (state.trimming[sample.id]) {
      actions.push({ type: "setRate", id: sample.id, rate: 1 });
    }
  }
  return { state: { ...initialArchiveState(), seen: seenCounts(samples) }, actions, errors: {} };
}

interface Frame {
  members: ArchiveSample[];
  reference: ArchiveSample;
  /** The player the user just touched, if any. */
  user: ArchiveSample | undefined;
  baseRate: number;
  targets: Record<string, number>;
  errors: Record<string, number>;
  next: ArchiveState;
}

const RATE_EPSILON = 0.001;

/**
 * The speed the user chose. Only a speed the controller didn't set itself (normal, or a
 * catch-up trim of it) counts, or a trimmed player that becomes the reference would pass its
 * trim on to everyone, and trims would compound.
 */
function userRate(state: ArchiveState, user: ArchiveSample | undefined, tuning: ArchiveTuning) {
  const base = state.baseRate ?? 1;
  if (!user) {
    return base;
  }
  const ours = [base, base * (1 - tuning.trim), base * (1 + tuning.trim)];
  const isOurs = ours.some((rate) => Math.abs(user.playbackRate - rate) < RATE_EPSILON);
  return isOurs ? base : user.playbackRate;
}

/** Where everyone should be, from the reference's moment. */
function frame(
  state: ArchiveState,
  members: ArchiveSample[],
  settings: ArchiveSettings,
  tuning: ArchiveTuning,
): Frame {
  const referenceId = pickReference(state, members);
  const reference = members.find((sample) => sample.id === referenceId) as ArchiveSample;
  const bases = assignBases(state, members, referenceId);
  const moment = shownMoment(reference, bases[referenceId] as number, settings);
  const targets: Record<string, number> = {};
  const errors: Record<string, number> = { [referenceId]: 0 };
  for (const sample of members.filter((member) => member !== reference)) {
    const target = targetPosition(moment, sample, bases[sample.id] as number, settings);
    targets[sample.id] = target;
    errors[sample.id] = sample.position - target;
  }
  const user = touched(state, members);
  const baseRate = userRate(state, user, tuning);
  const next = { ...state, reference: referenceId, seen: seenCounts(members), bases, baseRate };
  return { members, reference, user, baseRate, targets, errors, next };
}

/** Did the user just touch a player? Then their play or pause decides what happens next. */
function touched(state: ArchiveState, members: readonly ArchiveSample[]) {
  return members.find((sample) => sample.userActions > (state.seen[sample.id] ?? 0));
}

function continueRegroup(state: ArchiveState, view: Frame, tuning: ArchiveTuning) {
  const current = state.regroup as { play: boolean; steps: number };
  const { user } = view;
  const play = user ? isPlaying(user) : current.play;
  // The user pressing play while a regroup waits doesn't wait for buffers: they asked for it
  // now. (A seek that starts a regroup still waits, so everyone starts together.)
  const now = user !== undefined && play && current.steps > 0;
  const result = regroup({ ...view, play, steps: current.steps, tuning, now });
  const regroupState = result.done ? undefined : { play, steps: current.steps + 1 };
  const stuck = Object.fromEntries(result.stuck.map((id) => [id, true]));
  const next: ArchiveState = { ...view.next, trimming: {}, regroup: regroupState, stuck };
  return { state: next, actions: result.actions, errors: view.errors };
}

function followAll(view: Frame, state: ArchiveState, tuning: ArchiveTuning) {
  const actions: Action[] = [];
  const trimming: Record<string, boolean> = {};
  const stuck = stillStuck(state, view.members);
  const followers = view.members.filter((sample) => sample !== view.reference && !stuck[sample.id]);
  for (const follower of followers) {
    const target = view.targets[follower.id] as number;
    const wasTrimming = state.trimming[follower.id] ?? false;
    const result = follow({
      follower,
      reference: view.reference,
      target,
      trimming: wasTrimming,
      baseRate: view.baseRate,
      tuning,
    });
    if (result.needsJump) {
      const regroupState = { play: isPlaying(view.reference), steps: 0 };
      return continueRegroup({ ...state, regroup: regroupState }, view, tuning);
    }
    actions.push(...result.actions);
    trimming[follower.id] = result.trimming;
  }
  return {
    state: { ...view.next, trimming, stuck },
    actions: [...referenceRate(view), ...actions],
    errors: view.errors,
  };
}

/** The reference plays at the user's speed (it may have been catching up before). */
function referenceRate(view: Frame): Action[] {
  const { reference, baseRate } = view;
  if (Math.abs(reference.playbackRate - baseRate) < RATE_EPSILON) {
    return [];
  }
  return [{ type: "setRate", id: reference.id, rate: baseRate }];
}

/** Stuck players stay set aside until they play again; then they're synced like the rest. */
function stillStuck(state: ArchiveState, members: readonly ArchiveSample[]) {
  const stuck = members.filter((sample) => state.stuck?.[sample.id] && sample.state !== "playing");
  return Object.fromEntries(stuck.map((sample) => [sample.id, true]));
}

/**
 * One step of archive sync: every added player shows the same broadcast moment as the
 * reference (the player the user touched last); plays, pauses and speed follow it. Jumps
 * happen as a regroup, so players that finish buffering at different times still start
 * together. Pure, like the live controller.
 */
export function stepArchive(
  state: ArchiveState,
  samples: readonly ArchiveSample[],
  settings: ArchiveSettings,
  tuning: ArchiveTuning = ARCHIVE_TUNING,
): ArchiveStepResult {
  const members = samples.filter((sample) => settings.group.includes(sample.id));
  const onHold = members.some((sample) => sample.state === "ad");
  if (!settings.enabled || onHold || members.length < 2) {
    return idle(state, samples);
  }
  const view = frame(state, members, settings, tuning);
  if (state.regroup) {
    return continueRegroup(state, view, tuning);
  }
  return followAll(view, state, tuning);
}
