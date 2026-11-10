import type { ArchiveTuning } from "./types.ts";

export const ARCHIVE_TUNING: ArchiveTuning = {
  // A jump re-buffers, so small gaps are closed by speed instead. A 1 s nudge still jumps,
  // so nudging feels immediate.
  seekError: 0.8,
  startError: 0.15,
  stopError: 0.05,
  // 5% closes a 1 s gap in 20 s and is hard to notice.
  trim: 0.05,
};
