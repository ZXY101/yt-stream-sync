import type { ArchiveSample, ArchiveSettings, ArchiveState } from "./types.ts";

/**
 * Did the user act on this player since the last step? Actions from before it joined the
 * group (a player paused before being added) don't count: it has no count to compare yet.
 */
export function wasTouched(state: ArchiveState, sample: ArchiveSample): boolean {
  return sample.userActions > (state.seen[sample.id] ?? sample.userActions);
}

/**
 * The member the others follow: whoever the user touched last, else the current one. A new
 * group follows a playing member, so a stream added while paused doesn't pause everyone.
 */
export function pickReference(state: ArchiveState, members: readonly ArchiveSample[]): string {
  const touched = members.find((sample) => wasTouched(state, sample));
  const current = members.find((sample) => sample.id === state.reference);
  const playing = members.find((sample) => sample.state === "playing");
  return (touched ?? current ?? playing ?? (members[0] as ArchiveSample)).id;
}

function offset(settings: ArchiveSettings, id: string): number {
  return settings.offsets[id] ?? 0;
}

/** The broadcast moment a player shows, with its nudge taken out. */
export function shownMoment(sample: ArchiveSample, base: number, settings: ArchiveSettings) {
  return base + sample.position - offset(settings, sample.id);
}

/** Where a player should be to show `moment`, nudge included. */
export function targetPosition(
  moment: number,
  sample: ArchiveSample,
  base: number,
  settings: ArchiveSettings,
): number {
  return moment - base + offset(settings, sample.id);
}

/**
 * Each member's broadcast time at position 0. Known start times are used as they are. A
 * player without one (an embed) keeps the alignment it had when it joined: its base is set
 * so that what it shows now counts as in sync with the reference.
 */
export function assignBases(
  state: ArchiveState,
  members: readonly ArchiveSample[],
  referenceId: string,
): Record<string, number> {
  const bases: Record<string, number> = {};
  for (const sample of members) {
    const known = sample.startTime ?? state.bases[sample.id];
    if (known !== undefined) {
      bases[sample.id] = known;
    }
  }
  const reference = members.find((sample) => sample.id === referenceId) as ArchiveSample;
  if (bases[referenceId] === undefined) {
    const anchor = members.find((sample) => bases[sample.id] !== undefined);
    const anchorMoment = anchor ? (bases[anchor.id] as number) + anchor.position : 0;
    bases[referenceId] = anchorMoment - reference.position;
  }
  const referenceMoment = (bases[referenceId] as number) + reference.position;
  for (const sample of members) {
    bases[sample.id] ??= referenceMoment - sample.position;
  }
  return bases;
}
