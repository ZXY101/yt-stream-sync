import type { PlayerSample, SyncSettings } from "./types.ts";

/** How far behind live a player shows the broadcast, after its manual offset. */
function effectiveLag(sample: PlayerSample, settings: SyncSettings): number {
  return sample.latency + (settings.offsets[sample.id] ?? 0);
}

function bufferShortfall(sample: PlayerSample, minBuffer: number): number {
  return Math.max(0, minBuffer - sample.bufferAhead);
}

/**
 * Without pinned players, streams can only be held back, so the target is the lag of the player furthest behind.
 * A player short on buffer counts as further behind by the shortfall: that holds back
 * everyone, itself included, until it has enough buffer, without breaking the sync.
 */
function holdBackTarget(
  samples: readonly PlayerSample[],
  settings: SyncSettings,
  minBuffer: number,
): number {
  const neededLags = samples.map(
    (sample) => effectiveLag(sample, settings) + bufferShortfall(sample, minBuffer),
  );
  return Math.max(...neededLags);
}

/**
 * With pinned (ultra-low-latency) players, which can only be held back a little, the others
 * meet them instead: the target is the lag of the pinned player furthest behind, and the
 * players behind it jump ahead. A player can only jump as far as its buffer allows (its lowest
 * buffer of late, keeping `minBuffer`); if that's not enough, the target waits for it.
 */
function pinnedTarget(
  pinned: readonly PlayerSample[],
  others: readonly PlayerSample[],
  settings: SyncSettings,
  options: TargetOptions,
): number {
  const { minBuffer, floors, held } = options;
  // Only a pinned player the sync held back can jump ahead again: as far as its buffer
  // allows, but never past its own live edge (the lowest latency it has shown). Counting
  // the others' tiny headroom too would set the target just below them all, and their
  // latency jitter would never let the group count as settled (seen on a real pair).
  const pinnedLags = pinned.map((sample) => {
    const reachable =
      sample.latency - Math.max(0, (sample.bufferLow ?? sample.bufferAhead) - minBuffer);
    const edge = floors[sample.id] ?? sample.latency;
    const lowest = held.has(sample.id)
      ? Math.min(sample.latency, Math.max(edge, reachable))
      : sample.latency;
    return lowest + (settings.offsets[sample.id] ?? 0);
  });
  const lowestLags = others.map(
    (sample) =>
      effectiveLag(sample, settings) - (sample.bufferLow ?? sample.bufferAhead) + minBuffer,
  );
  return Math.max(...pinnedLags, ...lowestLags);
}

/**
 * Seconds each player is ahead of the common target. Negative (behind) only when a pinned
 * player is in the group: those players are meant to jump ahead.
 */
export interface TargetOptions {
  /** Every player should keep at least this many seconds buffered. */
  minBuffer: number;
  /** Pinned players: the lowest latency each has shown, i.e. its live edge. */
  floors: Readonly<Record<string, number>>;
  /** Pinned players the sync has held back. */
  held: ReadonlySet<string>;
}

export function computeErrors(
  samples: readonly PlayerSample[],
  settings: SyncSettings,
  options: TargetOptions,
): Record<string, number> {
  const { minBuffer } = options;
  const pinned = samples.filter((sample) => sample.pinned === true);
  const others = samples.filter((sample) => sample.pinned !== true);
  const target =
    pinned.length > 0
      ? pinnedTarget(pinned, others, settings, options)
      : holdBackTarget(samples, settings, minBuffer);
  const errors: Record<string, number> = {};
  for (const sample of samples) {
    errors[sample.id] = target - effectiveLag(sample, settings);
  }
  return errors;
}
