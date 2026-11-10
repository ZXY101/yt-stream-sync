import type { PlayerState } from "../controller/types.ts";

/**
 * YouTube reports a live latency of 0 while a player is paused, which would make it look
 * far ahead of the group. While a player isn't playing, its playhead stands still and the
 * live edge moves on, so the latency is the last real reading plus the time since.
 */
export function createLatencyTracker() {
  let last: { latency: number; at: number } | undefined;

  function update(
    reading: number | undefined,
    state: PlayerState,
    now: number,
  ): number | undefined {
    const valid = reading !== undefined && reading > 0 && state !== "paused";
    if (valid) {
      last = { latency: reading, at: now };
      return reading;
    }
    if (!last || state === "playing") {
      return undefined;
    }
    return last.latency + (now - last.at);
  }

  return { update };
}
