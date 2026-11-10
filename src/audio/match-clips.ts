import { gccPhat } from "./gcc-phat.ts";
import { AUDIO_RATE, type Clip } from "./ring.ts";

// Tuned on real collab audio (two POVs of one stream): the true lag scored 18–23 with the
// next-best peak at 10–13, while single windows managed only 7–10.
const MIN_CONFIDENCE = 12;
const MIN_UNIQUENESS = 1.3;
const WINDOWS = { window: 15, hop: 2.5 };

export type MatchResult =
  | { matched: true; lags: Record<string, number> }
  | { matched: false; reason: "too-short" | "no-shared-sound" };

/** Cuts every clip to the stretch of wall-clock time they all cover. */
function commonStretch(clips: Record<string, Clip>): Record<string, Float32Array> {
  const all = Object.values(clips);
  const start = Math.max(...all.map((clip) => clip.start));
  const ends = all.map((clip) => clip.start + (clip.samples.length / AUDIO_RATE) * 1000);
  const length = Math.floor(((Math.min(...ends) - start) / 1000) * AUDIO_RATE);
  const cut: Record<string, Float32Array> = {};
  for (const [id, clip] of Object.entries(clips)) {
    const from = Math.round(((start - clip.start) / 1000) * AUDIO_RATE);
    cut[id] = clip.samples.subarray(from, from + Math.max(0, length));
  }
  return cut;
}

/**
 * How many seconds each player's audio lags behind the reference's, from clips recorded at
 * the same time. Positive: the player plays the same sound later, so it's behind.
 */
export function matchClips(
  clips: Record<string, Clip>,
  referenceId: string,
  options: { maxLag: number; minSeconds: number },
): MatchResult {
  const cut = commonStretch(clips);
  const reference = cut[referenceId] as Float32Array;
  if (reference.length < options.minSeconds * AUDIO_RATE) {
    return { matched: false, reason: "too-short" };
  }
  const lags: Record<string, number> = {};
  for (const [id, samples] of Object.entries(cut)) {
    if (id === referenceId) {
      continue;
    }
    const match = gccPhat(reference, samples, {
      sampleRate: AUDIO_RATE,
      maxLagSeconds: options.maxLag,
      windows: WINDOWS,
    });
    if (match.confidence < MIN_CONFIDENCE || match.uniqueness < MIN_UNIQUENESS) {
      return { matched: false, reason: "no-shared-sound" };
    }
    lags[id] = match.lag;
  }
  return { matched: true, lags };
}
