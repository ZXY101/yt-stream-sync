import type { ArchiveSample, ArchiveSettings, ArchiveState } from "./types.ts";

/** The member the others follow: whoever the user touched last, else the current one. */
export function pickReference(state: ArchiveState, members: readonly ArchiveSample[]): string {
  const touched = members.find((sample) => sample.userActions > (state.seen[sample.id] ?? 0));
  if (touched) {
    return touched.id;
  }
  const current = members.find((sample) => sample.id === state.reference);
  return (current ?? (members[0] as ArchiveSample)).id;
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
