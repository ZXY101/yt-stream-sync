import type { AudioStatus } from "../../lib/messages.ts";

export interface Situation {
  enabled: boolean;
  members: number;
  blocked: boolean;
  unavailable: boolean;
  /** A clip request for this group is out; seconds since it was sent. */
  pendingFor?: number;
  /** This group was matched (or failed) already. */
  done: boolean;
  /** Seconds the whole group has been playing in sync. */
  settled: number;
  clipSeconds: number;
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
  if (situation.done) {
    return { do: "wait" };
  }
  if (situation.settled >= situation.clipSeconds) {
    return { do: "ask" };
  }
  const progress = Math.max(0, situation.settled) / situation.clipSeconds;
  return { do: "show", status: { state: "listening", progress } };
}
