import { gccPhat } from "./gcc-phat.ts";
import { AUDIO_RATE, type Clip } from "./ring.ts";

// Tuned on real collab audio (two POVs of one stream): the true lag scored 18–31 with the
// next-best peak well below, while single windows managed only 7–10.
const MIN_CONFIDENCE = 12;
const MIN_UNIQUENESS = 1.3;
const WINDOWS = { window: 15, hop: 2.5 };

export interface MatchResult {
  /** Seconds each matched player lags behind the reference (positive: it's behind). */
  lags: Record<string, number>;
  /** Players whose audio couldn't be matched to the reference's. */
  unmatched: string[];
  /** Set when nothing could be compared at all. */
  tooShort?: boolean;
}

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
 * the same time. Players are matched one by one, so one that can't be matched (no shared
 * sound right now) doesn't hold the others back.
 */
export function matchClips(
  clips: Record<string, Clip>,
  referenceId: string,
  options: { maxLag: number; minSeconds: number },
): MatchResult {
  const cut = commonStretch(clips);
  const reference = cut[referenceId] as Float32Array;
  const others = Object.keys(cut).filter((id) => id !== referenceId);
  if (reference.length < options.minSeconds * AUDIO_RATE) {
    return { lags: {}, unmatched: others, tooShort: true };
  }
  const lags: Record<string, number> = { [referenceId]: 0 };
  // Each pass matches what it can against everyone matched so far, so a player that shares
  // sound with a matched player but not with the reference still gets in (lags add up).
  let waiting = others;
  while (waiting.length > 0) {
    const stillWaiting = waiting.filter((id) => !matchToAny(id, cut, lags, options.maxLag));
    if (stillWaiting.length === waiting.length) {
      break;
    }
    waiting = stillWaiting;
  }
  delete lags[referenceId];
  return { lags, unmatched: waiting };
}

/** Tries `id` against each matched player; on a match, records its lag to the reference. */
function matchToAny(
  id: string,
  cut: Record<string, Float32Array>,
  lags: Record<string, number>,
  maxLag: number,
): boolean {
  for (const [anchor, anchorLag] of Object.entries(lags)) {
    const match = gccPhat(cut[anchor] as Float32Array, cut[id] as Float32Array, {
      sampleRate: AUDIO_RATE,
      maxLagSeconds: maxLag,
      windows: WINDOWS,
    });
    if (match.confidence >= MIN_CONFIDENCE && match.uniqueness >= MIN_UNIQUENESS) {
      lags[id] = anchorLag + match.lag;
      return true;
    }
  }
  return false;
}
