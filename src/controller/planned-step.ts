import { chooseAim } from "./aim.ts";
import { stepPinned } from "./pinned-step.ts";
import { actionsFor, nextMode } from "./player-step.ts";
import { type Range, learnReach, probeRoom, reachRange } from "./reach.ts";
import type {
  Action,
  ControllerState,
  Mode,
  PlayerSample,
  Reach,
  SyncSettings,
  Tuning,
} from "./types.ts";

export interface PlannedInput {
  state: ControllerState;
  synced: readonly PlayerSample[];
  settings: SyncSettings;
  tuning: Tuning;
  /** Pinned players' lowest latencies (their live edge), already updated for this step. */
  floors: Readonly<Record<string, number>>;
}

interface PlayerPlan {
  mode: Mode;
  cooldown: number;
  actions: Action[];
  held?: number;
  ceiling?: number;
  stuck?: boolean;
  /** No-rewind: the latency a jump this step should leave it at. */
  jumpedTo?: number;
}

function offsetOf(sample: PlayerSample, settings: SyncSettings): number {
  return settings.offsets[sample.id] ?? 0;
}

function pinnedRange(sample: PlayerSample, input: PlannedInput): Range {
  const { state, tuning, floors } = input;
  const ceiling = state.ceilings?.[sample.id] ?? tuning.pinnedMaxLatency;
  const held = state.held?.[sample.id] !== undefined;
  const low = held ? (floors[sample.id] ?? sample.latency) : sample.latency;
  return { low, high: Math.max(low, ceiling, sample.latency) };
}

/** Rewindable: can be held back as far as needed, moved ahead as its buffer allows. */
function rewindableRange(sample: PlayerSample, tuning: Tuning): Range {
  const buffer = sample.bufferLow ?? sample.bufferAhead;
  return { low: sample.latency - buffer + tuning.minBuffer, high: Infinity };
}

/** Where a player can sit, as lags (latency plus the user's offset). */
function rangeOf(sample: PlayerSample, input: PlannedInput, reach: Reach | undefined): Range {
  const offset = offsetOf(sample, input.settings);
  let range: Range;
  if (sample.pinned === true) {
    range = pinnedRange(sample, input);
  } else if (sample.noRewind === true && reach) {
    range = reachRange(sample, reach, input.tuning);
  } else {
    range = rewindableRange(sample, input.tuning);
  }
  return { low: range.low + offset, high: range.high + offset };
}

interface Move {
  sample: PlayerSample;
  previous: Mode;
  cooldown: number;
  /** Seconds ahead of its spot (negative: behind). */
  error: number;
}

/** Slowing only: pausing a no-rewind stream sends it back to the live edge. */
function stepNoRewind(move: Move, tuning: Tuning): PlayerPlan {
  const { sample, previous, cooldown, error } = move;
  if (error < -tuning.noRewindJumpError && cooldown === 0 && sample.state === "playing") {
    const actions = actionsFor(sample, "normal", tuning);
    actions.push({ type: "skip", id: sample.id, seconds: -error });
    return {
      mode: "normal",
      cooldown: tuning.jumpCooldown,
      actions,
      jumpedTo: sample.latency + error,
    };
  }
  const noPause = { ...tuning, pauseError: Infinity };
  const mode = nextMode(previous === "paused" ? "normal" : previous, error, noPause);
  return { mode, cooldown, actions: actionsFor(sample, mode, tuning) };
}

function stepRewindable(move: Move, tuning: Tuning): PlayerPlan {
  const { sample, previous, cooldown, error } = move;
  if (error < -tuning.jumpError && cooldown === 0 && sample.state === "playing") {
    const actions = actionsFor(sample, "normal", tuning);
    actions.push({ type: "skip", id: sample.id, seconds: -error });
    return { mode: "normal", cooldown: tuning.jumpCooldown, actions };
  }
  const mode = nextMode(previous, error, tuning);
  return { mode, cooldown, actions: actionsFor(sample, mode, tuning) };
}

function stepOne(sample: PlayerSample, input: PlannedInput, error: number): PlayerPlan {
  const { state, tuning } = input;
  const previous = state.modes[sample.id] ?? "normal";
  const cooldown = Math.max(0, (state.cooldowns?.[sample.id] ?? 0) - 1);
  if (sample.pinned === true) {
    const ceiling = state.ceilings?.[sample.id] ?? tuning.pinnedMaxLatency;
    const held = state.held?.[sample.id];
    const pinned = stepPinned({
      sample,
      previousMode: previous,
      cooldown,
      error,
      tuning,
      held,
      ceiling,
    });
    return { mode: "normal", ...pinned };
  }
  const move = { sample, previous, cooldown, error };
  return sample.noRewind === true ? stepNoRewind(move, tuning) : stepRewindable(move, tuning);
}

export interface PlannedResult {
  state: ControllerState;
  actions: Action[];
  errors: Record<string, number>;
  stuck: string[];
}

function learnAll(input: PlannedInput): Record<string, Reach> {
  const reach: Record<string, Reach> = { ...input.state.reach };
  for (const sample of input.synced) {
    if (sample.noRewind === true && sample.pinned !== true) {
      reach[sample.id] = learnReach(input.state.reach?.[sample.id], sample, input.tuning);
    }
  }
  return reach;
}

/**
 * One step for a group with a stream that has rewind turned off. Such streams can't be paused
 * (YouTube sends them to the live edge) and won't keep every jump ahead, so each player gets
 * the range of lags it can sit at, the group lines up at the lag inside the most ranges
 * (`aim.ts`), and each player moves as close to it as its range allows: behind jumps ahead,
 * ahead is slowed (no-rewind) or held back as usual. A player that can't reach the aim is
 * `stuck` and its error is reported against the aim.
 */
export function stepPlanned(input: PlannedInput): PlannedResult {
  const { state, synced, settings, tuning } = input;
  const reach = learnAll(input);
  const ranges = synced.map((sample) => rangeOf(sample, input, reach[sample.id]));
  const lags = synced.map((sample) => sample.latency + offsetOf(sample, settings));
  const aim = chooseAim(ranges, lags, state.aim);
  const next = {
    modes: {} as Record<string, Mode>,
    cooldowns: {} as Record<string, number>,
    held: {} as Record<string, number>,
    ceilings: { ...state.ceilings },
    floors: input.floors,
    reach,
    aim,
  };
  const outlierBehind = ranges.some((range) => range.low > aim + tuning.holdError);
  const actions: Action[] = [];
  const errors: Record<string, number> = {};
  const stuck: string[] = [];
  synced.forEach((sample, index) => {
    const range = ranges[index] as Range;
    const goal = Math.min(range.high, Math.max(range.low, aim));
    const lag = lags[index] ?? 0;
    const plan = stepOne(sample, input, goal - lag);
    errors[sample.id] = aim - lag;
    next.modes[sample.id] = plan.mode;
    next.cooldowns[sample.id] = plan.cooldown;
    if (plan.held !== undefined) {
      next.held[sample.id] = plan.held;
    }
    if (plan.ceiling !== undefined) {
      next.ceilings[sample.id] = plan.ceiling;
    }
    const known = reach[sample.id];
    if (known) {
      // At its back limit, with a stream behind the group that can't come any closer.
      const atLimit =
        range.high - aim <= tuning.holdError && lag >= range.high - 2 * tuning.holdError;
      const pressed = atLimit && outlierBehind;
      const probed = probeRoom(known, pressed, tuning);
      reach[sample.id] = plan.jumpedTo === undefined ? probed : { ...probed, last: plan.jumpedTo };
    }
    if (Math.abs(goal - aim) > tuning.holdError || plan.stuck === true) {
      stuck.push(sample.id);
    }
    actions.push(...plan.actions);
  });
  return { state: next, actions, errors, stuck };
}
