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
};
