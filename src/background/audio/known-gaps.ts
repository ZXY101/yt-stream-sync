import type { MatchResult } from "../../audio/match-clips.ts";
import type { AudioMember } from "./audio-sync.ts";

/**
 * The audio lag includes any gap the sync already knows about and keeps on purpose (a
 * low-latency stream that can't be held back further). Only the rest is a wrong offset:
 * moving the offset by the whole lag would count that gap twice. Keeps the players' errors
 * from when the clips were asked for (the moment the clips end) to take that gap out.
 */
export function createKnownGaps() {
  let latest: Record<string, number> = {};
  let atAsk: Record<string, number> = {};

  function update(members: readonly AudioMember[]) {
    latest = Object.fromEntries(members.map((member) => [member.id, member.error ?? 0]));
  }

  function remove(result: MatchResult, reference: string): MatchResult {
    const referenceError = atAsk[reference] ?? 0;
    const lags = Object.fromEntries(
      Object.entries(result.lags).map(([id, lag]) => [id, lag + (atAsk[id] ?? 0) - referenceError]),
    );
    return { ...result, lags };
  }

  return {
    update,
    remember: () => {
      atAsk = latest;
    },
    remove,
  };
}
