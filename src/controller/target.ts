import type { PlayerSample, SyncSettings } from "./types.ts";

/** How far behind live a player shows the broadcast, after its manual offset. */
function effectiveLag(sample: PlayerSample, settings: SyncSettings): number {
  return sample.latency + (settings.offsets[sample.id] ?? 0);
}

function bufferShortfall(sample: PlayerSample, minBuffer: number): number {
  return Math.max(0, minBuffer - sample.bufferAhead);
}

/**
 * Seconds each player is ahead of the common target, never negative.
 *
 * Streams can only be held back, so the target is the lag of the player furthest behind.
 * A player short on buffer counts as further behind by the shortfall: that holds back
 * everyone, itself included, until it has enough buffer, without breaking the sync.
 */
export function computeErrors(
  samples: readonly PlayerSample[],
  settings: SyncSettings,
  minBuffer: number,
): Record<string, number> {
  const neededLags = samples.map(
    (sample) => effectiveLag(sample, settings) + bufferShortfall(sample, minBuffer),
  );
  const target = Math.max(...neededLags);
  const errors: Record<string, number> = {};
  for (const sample of samples) {
    errors[sample.id] = target - effectiveLag(sample, settings);
  }
  return errors;
}
