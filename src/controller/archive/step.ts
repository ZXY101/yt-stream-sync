import type { Action } from "../types.ts";
import { assignBases, pickReference, shownMoment, targetPosition } from "./clock.ts";
import { follow } from "./follow.ts";
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

/**
 * One step of archive sync: every opted-in player shows the same broadcast moment as the
 * reference (the player the user touched last). Plays, pauses and speed follow the
 * reference too. Pure, like the live controller.
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
  const referenceId = pickReference(state, members);
  const reference = members.find((sample) => sample.id === referenceId) as ArchiveSample;
  const bases = assignBases(state, members, referenceId);
  const moment = shownMoment(reference, bases[referenceId] as number, settings);
  const actions: Action[] = [];
  const errors: Record<string, number> = { [referenceId]: 0 };
  const trimming: Record<string, boolean> = {};
  for (const follower of members.filter((sample) => sample !== reference)) {
    const target = targetPosition(moment, follower, bases[follower.id] as number, settings);
    const wasTrimming = state.trimming[follower.id] ?? false;
    const result = follow({ follower, reference, target, trimming: wasTrimming, tuning });
    actions.push(...result.actions);
    trimming[follower.id] = result.trimming;
    errors[follower.id] = follower.position - target;
  }
  const next: ArchiveState = { reference: referenceId, seen: seenCounts(samples), bases, trimming };
  return { state: next, actions, errors };
}
