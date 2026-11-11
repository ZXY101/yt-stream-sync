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
  return { modes: {}, cooldowns: {} };
}

interface PlayerStep {
  mode: Mode;
  cooldown: number;
  actions: Action[];
}

/**
 * One player's step. A pinned player is never held back: YouTube sends it back to the live
 * edge after a pause (even 3 s), a seek back, and sometimes after a few seconds at 0.92x
 * (all seen on a real stream), so it is only handed back as it was. A player well behind
 * the target (only with a pinned player in the group) jumps ahead, at most once per
 * cooldown. Anything else goes through the normal modes.
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
    return { mode: "normal", cooldown, actions: releaseActions(sample, previous) };
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
  return { state: initialState(), actions: release(state, samples), errors: {} };
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
  const errors = computeErrors(synced, settings, tuning.minBuffer + settings.safetyMargin);
  const modes: Record<string, Mode> = {};
  const cooldowns: Record<string, number> = {};
  const actions = release(state, others);
  for (const sample of synced) {
    const result = stepPlayer(sample, state, errors[sample.id] ?? 0, tuning);
    modes[sample.id] = result.mode;
    cooldowns[sample.id] = result.cooldown;
    actions.push(...result.actions);
  }
  return { state: { modes, cooldowns }, actions, errors };
}
