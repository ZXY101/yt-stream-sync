import { MATCH_THRESHOLDS, type MatchResult } from "../../audio/match-clips.ts";

/** "audio: asked 17:0, 22:0 for 30 s of audio (reference 17:0)" */
export function describeAsk(ids: readonly string[], reference: string, seconds: number): string {
  return `audio: asked ${ids.join(", ")} for ${seconds} s of audio (reference ${reference})`;
}

/**
 * Lines for the debug log: one per comparison, with the scores and what they needed, then the outcome. A match
 * that keeps failing shows why: quiet audio scores low confidence, no shared sound low both.
 */
export function describeMatch(result: MatchResult): string[] {
  if (result.tooShort === true) {
    return [
      `audio: not enough audio to compare (${result.unmatched.join(", ") || "nobody"} unmatched)`,
    ];
  }
  const { confidence, uniqueness } = MATCH_THRESHOLDS;
  const lines = (result.attempts ?? []).map(
    (attempt) =>
      `audio: ${attempt.id} vs ${attempt.anchor}: lag ${attempt.lag.toFixed(2)} s, ` +
      `confidence ${attempt.confidence.toFixed(1)} (needs ${confidence}), ` +
      `uniqueness ${attempt.uniqueness.toFixed(2)} (needs ${uniqueness}) → ` +
      (attempt.ok ? "match" : "no match"),
  );
  const matched = Object.keys(result.lags);
  const outcome =
    `audio: matched ${matched.length > 0 ? matched.join(", ") : "nobody"}` +
    (result.unmatched.length > 0 ? `; unmatched ${result.unmatched.join(", ")}` : "");
  return [...lines, outcome];
}
