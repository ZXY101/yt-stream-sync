import type { ArchiveTuning } from "./types.ts";

export const ARCHIVE_TUNING: ArchiveTuning = {
  // Past this a player is regrouped (a jump); below it the speed is trimmed instead, which
  // is invisible. A 1 s nudge still jumps, so nudging feels immediate.
  seekError: 0.8,
  alignError: 0.15,
  // A second and a half buffered rides out the usual segment fetches after a jump; waiting
  // longer than 8 s feels broken, so then everyone plays anyway.
  readyBuffer: 1.5,
  regroupSteps: 8,
  startError: 0.15,
  stopError: 0.05,
  // 5% closes a 1 s gap in 20 s and is hard to notice.
  trim: 0.05,
};
