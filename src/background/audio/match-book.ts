import type { MatchResult } from "../../audio/match-clips.ts";
import type { AudioStatus } from "../../lib/messages.ts";

// Shared sound comes and goes in collabs, so a player that can't be matched is tried again
// with fresh audio this many times before giving up on it.
const ATTEMPTS = 4;

/** Which players are matched, which keep failing, and the latest lags, for one group. */
export function createMatchBook() {
  const matched = new Set<string>();
  const failures = new Map<string, number>();
  let lags: Record<string, number> = {};

  function isDone(id: string): boolean {
    return matched.has(id) || (failures.get(id) ?? 0) >= ATTEMPTS;
  }

  function fail(id: string) {
    failures.set(id, (failures.get(id) ?? 0) + 1);
  }

  function record(reference: string, result: MatchResult) {
    const anyMatched = Object.keys(result.lags).length > 0;
    // A reference nothing matched to failed too, or it would wait for a partner forever.
    if (anyMatched) {
      matched.add(reference);
    } else if (reference && !result.unmatched.includes(reference)) {
      fail(reference);
    }
    Object.keys(result.lags).forEach((id) => matched.add(id));
    result.unmatched.forEach((id) => fail(id));
    lags = { ...lags, ...result.lags };
  }

  /** The popup's view once every member is done. */
  function status(members: readonly string[], tooShort: boolean): AudioStatus {
    const givenUp = members.filter((id) => !matched.has(id));
    if (Object.keys(lags).length === 0 && givenUp.length > 0) {
      return { state: "failed", reason: tooShort ? "too-short" : "no-shared-sound" };
    }
    return givenUp.length > 0
      ? { state: "matched", lags, unmatched: givenUp }
      : { state: "matched", lags };
  }

  function clear() {
    matched.clear();
    failures.clear();
    lags = {};
  }

  return { isDone, isMatched: (id: string) => matched.has(id), record, status, clear };
}
