import { actionsFor, nextMode } from "./player-step.ts";
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

/** Hands every player back at normal speed and playing. Used when syncing is off or on hold. */
function release(
  state: ControllerState,
  samples: readonly PlayerSample[],
  tuning: Tuning,
): StepResult {
  const actions: Action[] = [];
  for (const sample of samples) {
    const mode = state.modes[sample.id];
    if (mode && mode !== "normal") {
      actions.push(...actionsFor(sample, "normal", tuning));
    }
  }
  return { state: initialState(), actions, errors: {} };
}

/**
 * One control step, run about once a second: player readings in, commands out.
 * Pure: no clock, no browser APIs. The caller applies the actions and keeps the new state.
 */
export function step(
  state: ControllerState,
  samples: readonly PlayerSample[],
  settings: SyncSettings,
  tuning: Tuning = DEFAULT_TUNING,
): StepResult {
  // During an ad the gap can't be measured; it is fixed once the ad ends.
  const onHold = samples.some((sample) => sample.state === "ad");
  if (!settings.enabled || onHold) {
    return release(state, samples, tuning);
  }
  const synced = samples.filter((sample) => isSynced(sample, state.modes[sample.id] ?? "normal"));
  if (synced.length === 0) {
    return { state: initialState(), actions: [], errors: {} };
  }
  const errors = computeErrors(synced, settings, tuning.minBuffer + settings.safetyMargin);
  const modes: Record<string, Mode> = {};
  const actions: Action[] = [];
  for (const sample of synced) {
    const mode = nextMode(state.modes[sample.id] ?? "normal", errors[sample.id] ?? 0, tuning);
    modes[sample.id] = mode;
    actions.push(...actionsFor(sample, mode, tuning));
  }
  return { state: { modes }, actions, errors };
}
