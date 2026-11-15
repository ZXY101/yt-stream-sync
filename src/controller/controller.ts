import { type PinnedInput, stepPinned } from "./pinned-step.ts";
import { type PlannedInput, stepPlanned } from "./planned-step.ts";
import { actionsFor, nextMode, releaseActions } from "./player-step.ts";
import { computeErrors } from "./target.ts";
import { DEFAULT_TUNING } from "./tuning.ts";
import type {
  Action,
  ControllerState,
  Mode,
  PlayerSample,
  StepResult,
  SyncSettings,
  Tuning,
} from "./types.ts";

export function initialState(): ControllerState {
  return { modes: {}, cooldowns: {}, held: {}, ceilings: {}, floors: {}, reach: {} };
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
  sample: PlayerSample,
  state: ControllerState,
  error: number,
  tuning: Tuning,
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
  sample: PlayerSample,
  state: ControllerState,
  error: number,
  tuning: Tuning,
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
  const mode = nextMode(previous, error, tuning);
  return { mode, cooldown, actions: actionsFor(sample, mode, tuning) };
}

/**
 * Players the controller syncs. A player the user paused, or one that ended, is left alone;
 * one the controller paused itself stays in the group.
 */
function isSynced(sample: PlayerSample, mode: Mode): boolean {
  if (sample.state === "ended") {
    return false;
  }
  return sample.state !== "paused" || mode === "paused";
}

/** Hands players back unchanged. Used for players outside the group, or for all of them. */
function release(state: ControllerState, samples: readonly PlayerSample[]): Action[] {
  return samples.flatMap((sample) => releaseActions(sample, state.modes[sample.id] ?? "normal"));
}

function idle(state: ControllerState, samples: readonly PlayerSample[]): StepResult {
  // Ceilings, floors and reach are learned per stream, so they outlive a pause in syncing.
  const learned = {
    ceilings: state.ceilings ?? {},
    floors: state.floors ?? {},
    reach: state.reach ?? {},
  };
  const next = { ...initialState(), ...learned };
  return { state: next, actions: release(state, samples), errors: {}, stuck: [] };
}

/**
 * One control step, run about once a second: player readings in, commands out.
 * Only players in `settings.group` (the ones the user opted in) are synced, and only once
 * there are two of them.
 * Pure: no clock, no browser APIs. The caller applies the actions and keeps the new state.
 */
export function step(
  state: ControllerState,
  samples: readonly PlayerSample[],
  settings: SyncSettings,
  tuning: Tuning = DEFAULT_TUNING,
): StepResult {
  const members = samples.filter((sample) => settings.group.includes(sample.id));
  // During an ad the gap can't be measured; it is fixed once the ad ends.
  const onHold = members.some((sample) => sample.state === "ad");
  if (!settings.enabled || onHold) {
    return idle(state, samples);
  }
  const synced = members.filter((sample) => isSynced(sample, state.modes[sample.id] ?? "normal"));
  if (synced.length < 2) {
    return idle(state, samples);
  }
  const others = samples.filter((sample) => !synced.includes(sample));
  const floors = updateFloors(state.floors ?? {}, synced);
  const group = { state, synced, settings, tuning, floors };
  // Streams without rewind need their own plan: see `planned-step.ts`.
  const result = synced.some((sample) => sample.noRewind === true)
    ? stepPlanned(group)
    : stepHeldBack(group);
  return { ...result, actions: [...release(state, others), ...result.actions] };
}

/** The usual step: the group waits for the player furthest behind (or meets pinned ones). */
function stepHeldBack(group: PlannedInput): StepResult {
  const { state, synced, settings, tuning, floors } = group;
  const minBuffer = tuning.minBuffer + settings.safetyMargin;
  const held = new Set(Object.keys(state.held ?? {}));
  const errors = computeErrors(synced, settings, { minBuffer, floors, held });
  const ceilings = { ...state.ceilings };
  const next: MutableState = { modes: {}, cooldowns: {}, held: {}, ceilings, floors };
  const actions: Action[] = [];
  const stuck: string[] = [];
  for (const sample of synced) {
    const result = stepPlayer(sample, state, errors[sample.id] ?? 0, tuning);
    record(next, sample.id, result);
    if (result.stuck === true) {
      stuck.push(sample.id);
    }
    actions.push(...result.actions);
  }
  return { state: { ...next, reach: state.reach }, actions, errors, stuck };
}

/** The lowest latency each pinned player has shown: where its live edge is. */
function updateFloors(
  floors: Readonly<Record<string, number>>,
  samples: readonly PlayerSample[],
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
  [K in Exclude<keyof ControllerState, "reach" | "aim">]-?: Record<
    string,
    NonNullable<ControllerState[K]>[string]
  >;
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
