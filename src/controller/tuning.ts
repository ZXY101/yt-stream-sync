import type { Tuning } from "./types.ts";

export const DEFAULT_TUNING: Tuning = {
  // Browsers keep the pitch at this rate, and the buffer grows by 8% of real time.
  slowRate: 0.92,
  // The gap between start and stop is the deadband that keeps rates from flapping.
  startError: 0.3,
  stopError: 0.1,
  // At 0.92x an 8 s gap takes 100 s to close; past that, pausing is quicker.
  pauseError: 8,
  resumeError: 1,
  // Below about 1.5 s of buffer, live streams stall on the next slow segment.
  minBuffer: 1.5,
  jumpError: 1,
  jumpCooldown: 10,
  // Pinned players, from probes of two real ultra-low-latency streams: a 1 s seek back held
  // at 4.8 s latency; the stats show 0 latency past about 5 s, and one slow-down snapped
  // back at 4.0 s (the ceiling then comes down by itself).
  holdError: 0.3,
  pinnedMaxLatency: 4.5,
  maxHoldStep: 2,
  snapDrop: 1,
  snapMargin: 0.5,
};
