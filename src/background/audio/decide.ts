import type { AudioStatus } from "../../lib/messages.ts";

export interface Situation {
  enabled: boolean;
  members: number;
  blocked: boolean;
  unavailable: boolean;
  /** A clip request is out; seconds since it was sent. */
  pendingFor?: number;
  /** At least two players have played in sync long enough, and one isn't matched yet. */
  ready: boolean;
  /** Every member is matched (or was given up on). */
  allMatched: boolean;
  /** 0–1 towards `ready`, for the popup. */
  progress: number;
  clipTimeout: number;
}

export type Decision =
  { do: "show"; status: AudioStatus } | { do: "ask" } | { do: "give-up" } | { do: "wait" };

/** What audio matching should do this step. Pure. */
export function decide(situation: Situation): Decision {
  if (!situation.enabled) {
    return { do: "show", status: { state: "off" } };
  }
  if (situation.members < 2) {
    return { do: "show", status: { state: "waiting" } };
  }
  if (situation.unavailable) {
    return { do: "show", status: { state: "unavailable" } };
  }
  if (situation.blocked) {
    return { do: "show", status: { state: "blocked" } };
  }
  if (situation.pendingFor !== undefined) {
    return situation.pendingFor > situation.clipTimeout ? { do: "give-up" } : { do: "wait" };
  }
  if (situation.ready) {
    return { do: "ask" };
  }
  if (situation.allMatched) {
    return { do: "wait" };
  }
  return { do: "show", status: { state: "listening", progress: situation.progress } };
}
