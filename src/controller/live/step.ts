import { type PinnedInput, stepPinned } from "./pinned-step.ts";
import { actionsFor, nextMode, releaseActions } from "./player-step.ts";
import { ageHistory, smoothLatencies } from "./smoothing.ts";
import { computeErrors } from "./target.ts";
import { LIVE_TUNING } from "./tuning.ts";
import type { Action, SyncSettings } from "../types.ts";
import type { LiveSample, LiveState, LiveStepResult, LiveTuning, Mode } from "./types.ts";

export function initialLiveState(): LiveState {
  return { modes: {}, cooldowns: {}, held: {}, ceilings: {}, floors: {} };
}

interface PlayerStep {
  mode: Mode;
  cooldown: number;
  actions: Action[];
  held?: number;
  ceiling?: number;
  stuck?: boolean;
}

function pinnedInput(
  sample: LiveSample,
  state: LiveState,
  error: number,
  tuning: LiveTuning,
): PinnedInput {
  return {
    sample,
    previousMode: state.modes[sample.id] ?? "normal",
    cooldown: Math.max(0, (state.cooldowns?.[sample.id] ?? 0) - 1),
    error,
    tuning,
    held: state.held?.[sample.id],
    ceiling: state.ceilings?.[sample.id] ?? tuning.pinnedMaxLatency,
  };
}

/**
 * One player's step. A pinned player goes to `stepPinned`. A player well behind the target
 * (only with a pinned player in the group) jumps ahead, at most once per cooldown. Anything
 * else goes through the normal modes.
 */
function stepPlayer(
  sample: LiveSample,
  state: LiveState,
  error: number,
  tuning: LiveTuning,
): PlayerStep {
  const previous = state.modes[sample.id] ?? "normal";
  const cooldown = Math.max(0, (state.cooldowns?.[sample.id] ?? 0) - 1);
  if (sample.pinned === true) {
    return { mode: "normal", ...stepPinned(pinnedInput(sample, state, error, tuning)) };
  }
  if (error < -tuning.jumpError && cooldown === 0 && sample.state === "playing") {
    const actions = actionsFor(sample, "normal", tuning);
    actions.push({ type: "skip", id: sample.id, seconds: -error });
    return { mode: "normal", cooldown: tuning.jumpCooldown, actions };
  }
  const mode = modeFor(sample, previous, error, tuning);
  return { mode, cooldown, actions: actionsFor(sample, mode, tuning) };
}

/**
 * A stream with rewind off is never paused: YouTube would send it back to the live edge and
 * the sync would pause it again, forever (seen on real streams). It is slowed instead, which
 * closes any gap, only slower: 8 s per 100 s.
 */
function modeFor(sample: LiveSample, previous: Mode, error: number, tuning: LiveTuning): Mode {
  if (sample.noRewind !== true) {
    return nextMode(previous, error, tuning);
  }
  const unpaused = previous === "paused" ? "normal" : previous;
  return nextMode(unpaused, error, { ...tuning, pauseError: Infinity });
}

/**
 * Players the controller syncs. A player the user paused, or one that ended, is left alone;
 * one the controller paused itself stays in the group.
 */
function isSynced(sample: LiveSample, mode: Mode): boolean {
  if (sample.state === "ended") {
    return false;
  }
  return sample.state !== "paused" || mode === "paused";
}

/** Hands players back unchanged. Used for players outside the group, or for all of them. */
function release(state: LiveState, samples: readonly LiveSample[]): Action[] {
  return samples.flatMap((sample) => releaseActions(sample, state.modes[sample.id] ?? "normal"));
}

function idle(state: LiveState, samples: readonly LiveSample[]): LiveStepResult {
  // Ceilings and floors are learned per stream, so they outlive a pause in syncing.
  const next = {
    ...initialLiveState(),
    ceilings: state.ceilings ?? {},
    floors: state.floors ?? {},
  };
  return { state: next, actions: release(state, samples), errors: {}, stuck: [] };
}

/** The group members to sync this step, or undefined while there's nothing to sync. */
function playersToSync(
  state: LiveState,
  samples: readonly LiveSample[],
  settings: SyncSettings,
): LiveSample[] | undefined {
  const members = samples.filter((sample) => settings.group.includes(sample.id));
  // During an ad the gap can't be measured; it is fixed once the ad ends.
  const onHold = members.some((sample) => sample.state === "ad");
  if (!settings.enabled || onHold) {
    return undefined;
  }
  const read = members.filter((sample) => isSynced(sample, state.modes[sample.id] ?? "normal"));
  return read.length < 2 ? undefined : read;
}

/**
 * One control step, run about once a second: player readings in, commands out.
 * Only players in `settings.group` (the ones the user opted in) are synced, and only once
 * there are two of them.
 * Pure: no clock, no browser APIs. The caller applies the actions and keeps the new state.
 */
export function stepLive(
  state: LiveState,
  samples: readonly LiveSample[],
  settings: SyncSettings,
  tuning: LiveTuning = LIVE_TUNING,
): LiveStepResult {
  const read = playersToSync(state, samples, settings);
  if (!read) {
    return idle(state, samples);
  }
  const others = samples.filter((sample) => !read.includes(sample));
  const smoothed = smoothLatencies(state.readings ?? {}, read);
  const synced = smoothed.samples;
  const floors = updateFloors(state.floors ?? {}, synced);
  const minBuffer = tuning.minBuffer + settings.safetyMargin;
  const held = new Set(Object.keys(state.held ?? {}));
  const errors = computeErrors(synced, settings, { minBuffer, floors, held });
  const ceilings = { ...state.ceilings };
  const next: MutableState = { modes: {}, cooldowns: {}, held: {}, ceilings, floors, readings: {} };
  const actions = release(state, others);
  const stuck: string[] = [];
  for (const sample of synced) {
    const result = stepPlayer(sample, state, errors[sample.id] ?? 0, tuning);
    record(next, sample.id, result);
    if (result.stuck === true) {
      stuck.push(sample.id);
    }
    actions.push(...result.actions);
  }
  next.readings = ageHistory(smoothed.history, synced, actions);
  return { state: next, actions, errors, stuck };
}

/** The lowest latency each pinned player has shown: where its live edge is. */
function updateFloors(
  floors: Readonly<Record<string, number>>,
  samples: readonly LiveSample[],
): Record<string, number> {
  const next = { ...floors };
  for (const sample of samples) {
    if (sample.pinned === true && sample.state === "playing") {
      next[sample.id] = Math.min(next[sample.id] ?? sample.latency, sample.latency);
    }
  }
  return next;
}

type MutableState = {
  [K in keyof LiveState]-?: Record<string, NonNullable<LiveState[K]>[string]>;
};

function record(next: MutableState, id: string, result: PlayerStep) {
  next.modes[id] = result.mode;
  next.cooldowns[id] = result.cooldown;
  if (result.held !== undefined) {
    next.held[id] = result.held;
  }
  if (result.ceiling !== undefined) {
    next.ceilings[id] = result.ceiling;
  }
}
