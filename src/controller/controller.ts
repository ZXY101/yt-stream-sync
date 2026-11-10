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
  return { modes: {} };
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
  const actions = release(state, others);
  for (const sample of synced) {
    const mode = nextMode(state.modes[sample.id] ?? "normal", errors[sample.id] ?? 0, tuning);
    modes[sample.id] = mode;
    actions.push(...actionsFor(sample, mode, tuning));
  }
  return { state: { modes }, actions, errors };
}
