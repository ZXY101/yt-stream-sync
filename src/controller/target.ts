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
  const { minBuffer, floors, held, keeps = {} } = options;
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
  const lowestLags = others.map((sample) => {
    const lag = effectiveLag(sample, settings);
    const reachable = lag - (sample.bufferLow ?? sample.bufferAhead) + minBuffer;
    if (sample.noRewind !== true) {
      return reachable;
    }
    // A stream without rewind can't be held back to grow its buffer: it only moves ahead, and
    // not past the latency it was put back to after a jump that didn't hold.
    const kept = keeps[sample.id];
    const limit = kept === undefined ? reachable : Math.max(reachable, kept + lag - sample.latency);
    return Math.min(lag, limit);
  });
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
  /** No-rewind players: the least latency each keeps (see `ControllerState.keeps`). */
  keeps?: Readonly<Record<string, number>>;
}

/**
 * Never aims ahead of the no-rewind stream furthest ahead: nothing could hold it back to the
 * target, so the others would only be pushed toward the live edge, buffers thinning, until they
 * stall (seen on a real group of three).
 */
function notAheadOfNoRewind(
  target: number,
  samples: readonly PlayerSample[],
  settings: SyncSettings,
): number {
  const lags = samples
    .filter((sample) => sample.noRewind === true && sample.pinned !== true)
    .map((sample) => effectiveLag(sample, settings));
  return lags.length > 0 ? Math.max(target, Math.min(...lags)) : target;
}

export function computeErrors(
  samples: readonly PlayerSample[],
  settings: SyncSettings,
  options: TargetOptions,
): Record<string, number> {
  const { minBuffer } = options;
  const pinned = samples.filter((sample) => sample.pinned === true);
  const others = samples.filter((sample) => sample.pinned !== true);
  // Streams that can't be held back (pinned, or without rewind) set the pace: the others jump
  // ahead to meet them instead of everyone waiting for the one furthest behind.
  const anchored = pinned.length > 0 || samples.some((sample) => sample.noRewind === true);
  const target = anchored
    ? pinnedTarget(pinned, others, settings, options)
    : holdBackTarget(samples, settings, minBuffer);
  const errors: Record<string, number> = {};
  const aim = notAheadOfNoRewind(target, samples, settings);
  for (const sample of samples) {
    errors[sample.id] = aim - effectiveLag(sample, settings);
  }
  return errors;
}
