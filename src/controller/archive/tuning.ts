import type { ArchiveTuning } from "./types.ts";

export const ARCHIVE_TUNING: ArchiveTuning = {
  // Past this a player is regrouped (a jump); below it the speed is trimmed instead, which
  // is invisible. A 1 s nudge still jumps, so nudging feels immediate.
  seekError: 0.8,
  alignError: 0.15,
  // Two seconds buffered rides out the usual segment fetches after a jump.
  readyBuffer: 2,
  regroupSteps: 15,
  startError: 0.15,
  stopError: 0.05,
  // 5% closes a 1 s gap in 20 s and is hard to notice.
  trim: 0.05,
};
