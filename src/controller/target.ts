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
 * With pinned (ultra-low-latency) players, which can't be held back, the others meet them
 * instead: the target is the lag of the pinned player furthest behind, and the players
 * behind it jump ahead. A player can only jump as far as its buffer allows (its lowest
 * buffer of late, keeping `minBuffer`); if that's not enough, the target waits for it.
 */
function pinnedTarget(
  pinned: readonly PlayerSample[],
  others: readonly PlayerSample[],
  settings: SyncSettings,
  minBuffer: number,
): number {
  const pinnedLags = pinned.map((sample) => effectiveLag(sample, settings));
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
export function computeErrors(
  samples: readonly PlayerSample[],
  settings: SyncSettings,
  minBuffer: number,
): Record<string, number> {
  const pinned = samples.filter((sample) => sample.pinned === true);
  const others = samples.filter((sample) => sample.pinned !== true);
  const target =
    pinned.length > 0
      ? pinnedTarget(pinned, others, settings, minBuffer)
      : holdBackTarget(samples, settings, minBuffer);
  const errors: Record<string, number> = {};
  for (const sample of samples) {
    errors[sample.id] = target - effectiveLag(sample, settings);
  }
  return errors;
}
