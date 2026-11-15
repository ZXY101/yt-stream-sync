import { type PinnedInput, stepPinned } from "./pinned-step.ts";
import { actionsFor, nextMode, releaseActions } from "./player-step.ts";
import { computeErrors } from "./target.ts";
import { DEFAULT_TUNING } from "./tuning.ts";
import type {
  Action,
  ControllerState,
  Jump,
  Mode,
  PlayerSample,
  StepResult,
  SyncSettings,
  Tuning,
} from "./types.ts";

export function initialState(): ControllerState {
  return { modes: {}, cooldowns: {}, held: {}, ceilings: {}, floors: {}, jumps: {}, keeps: {} };
}

interface PlayerStep {
  mode: Mode;
  cooldown: number;
  actions: Action[];
  held?: number;
  ceiling?: number;
  stuck?: boolean;
  jump?: Jump;
  keep?: number;
}

// A latency reading takes about a second to follow a jump; YouTube putting a low-latency
// stream back took under 3 s (seen on a real stream). A jump is judged after this many steps.
const JUMP_SETTLE_STEPS = 3;

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
  if (sample.noRewind === true) {
    const learned = judgeJump(sample, state.jumps?.[sample.id], cooldown, tuning);
    return { ...stepNoRewind(sample, cooldown, error, tuning), ...learned };
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
 * Whether a no-rewind player's last jump ahead held. One that ends up nearer where it jumped
 * from than where it aimed was put back (a low-latency stream re-buffers to its own latency):
 * it keeps the latency it jumped from, so the sync won't push it past that again.
 */
function judgeJump(
  sample: PlayerSample,
  jump: Jump | undefined,
  cooldown: number,
  tuning: Tuning,
): Pick<PlayerStep, "jump" | "keep"> {
  if (!jump) {
    return {};
  }
  const settled = cooldown <= tuning.jumpCooldown - JUMP_SETTLE_STEPS;
  if (settled && sample.state === "playing" && sample.latency > (jump.from + jump.to) / 2) {
    return { keep: jump.from };
  }
  return cooldown === 0 ? {} : { jump };
}

/**
 * A stream without rewind: YouTube sends it back to the live edge after a pause (seen on real
 * streams: the sync paused it, it played again 15–35 s closer to live, and looped). So it is
 * never paused or slowed; one ahead of the target is `stuck`, one behind jumps ahead.
 */
function stepNoRewind(
  sample: PlayerSample,
  cooldown: number,
  error: number,
  tuning: Tuning,
): PlayerStep {
  // Normal mode's actions: play again if the sync paused it, back to 1x (which also undoes
  // YouTube's own catch-up speed, as for any normal player).
  const actions = actionsFor(sample, "normal", tuning);
  const stuck = error > tuning.holdError;
  if (error < -tuning.jumpError && cooldown === 0 && sample.state === "playing") {
    actions.push({ type: "skip", id: sample.id, seconds: -error });
    const jump = { from: sample.latency, to: sample.latency + error };
    return { mode: "normal", cooldown: tuning.jumpCooldown, actions, stuck, jump };
  }
  return { mode: "normal", cooldown, actions, stuck };
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
  // Ceilings and floors are learned per stream, so they outlive a pause in syncing.
  const learned = {
    ceilings: state.ceilings ?? {},
    floors: state.floors ?? {},
    keeps: state.keeps ?? {},
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
  const minBuffer = tuning.minBuffer + settings.safetyMargin;
  const held = new Set(Object.keys(state.held ?? {}));
  const keeps = { ...state.keeps };
  const errors = computeErrors(synced, settings, { minBuffer, floors, held, keeps });
  const ceilings = { ...state.ceilings };
  const next: MutableState = {
    modes: {},
    cooldowns: {},
    held: {},
    ceilings,
    floors,
    jumps: {},
    keeps,
  };
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
  return { state: next, actions, errors, stuck };
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
  [K in keyof ControllerState]-?: Record<string, NonNullable<ControllerState[K]>[string]>;
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
  if (result.jump !== undefined) {
    next.jumps[id] = result.jump;
  }
  if (result.keep !== undefined) {
    next.keeps[id] = result.keep;
  }
}
