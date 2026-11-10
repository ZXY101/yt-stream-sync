import { matchClips, type MatchResult } from "../../audio/match-clips.ts";
import type { AudioClip, AudioStatus, PlayerCommand } from "../../lib/messages.ts";
import { createClipCollector } from "./clip-collector.ts";
import { decide, type Situation } from "./decide.ts";
import { createListenSet } from "./listen-set.ts";
import { createReadiness } from "./readiness.ts";

/** Seconds of audio compared. Longer is more reliable; the page keeps 36. */
const CLIP_SECONDS = 30;
const LIMITS = { maxLag: 8, minSeconds: CLIP_SECONDS / 2 };
// Shared sound comes and goes in collabs, so a stretch without it is retried with fresh
// audio this many times before giving up.
const ATTEMPTS = 4;
const TIMING = { clipSeconds: CLIP_SECONDS, clipTimeout: 5 };

export interface AudioSyncOptions {
  send: (id: string, command: PlayerCommand) => void;
  /** Moves a player's offset by `seconds` (positive: ahead). */
  adjust: (id: string, seconds: number) => void;
  /** Seconds on a monotonic clock. */
  now: () => number;
}

export interface AudioMember {
  id: string;
  /** Playing in sync with the group right now (not paused, buffering or catching up). */
  settled: boolean;
  /** The page can't hear its player yet (the browser wants a click in the page first). */
  blocked: boolean;
  /** The page can't hear its player at all. */
  unavailable?: boolean;
}

/** Applies a match (a lagging player moves ahead by its lag) and says how it went. */
function applyMatch(result: MatchResult, adjust: AudioSyncOptions["adjust"]): AudioStatus {
  if (!result.matched) {
    return { state: "failed", reason: result.reason };
  }
  Object.entries(result.lags).forEach(([id, lag]) => adjust(id, lag));
  return { state: "matched", lags: result.lags };
}

function situation(
  members: readonly AudioMember[],
  state: Pick<Situation, "enabled" | "done" | "settled" | "pendingFor">,
): Situation {
  const blocked = members.some((member) => member.blocked);
  const unavailable = members.some((member) => member.unavailable === true);
  return { ...TIMING, ...state, members: members.length, blocked, unavailable };
}

/** After a match attempt: try again with fresh audio, or apply the result and stop. */
function settle(result: MatchResult, attempts: number, adjust: AudioSyncOptions["adjust"]) {
  const retry = !result.matched && result.reason === "no-shared-sound" && attempts < ATTEMPTS;
  if (retry) {
    return { status: { state: "listening", progress: 0 } as AudioStatus, done: false };
  }
  return { status: applyMatch(result, adjust), done: true };
}

function pickReference(reference: string | undefined, ids: string[]): string {
  return reference && ids.includes(reference) ? reference : (ids[0] as string);
}

/**
 * Matches the added players by their audio: once they've played in sync for long enough,
 * asks each for its last seconds of audio, measures how far each lags behind the reference
 * and moves its offset by as much. Once per group, or again when asked.
 */
export function createAudioSync(options: AudioSyncOptions) {
  const listenSet = createListenSet(options.send);
  const readiness = createReadiness(options.now);
  const collector = createClipCollector(options.send, options.now);
  let enabled = true;
  let status: AudioStatus = { state: "waiting" };
  let doneFor: string | undefined;
  let attempts = 0;

  function finish(key: string | undefined, result: MatchResult) {
    collector.clear();
    readiness.reset(); // A later match must hear audio played after this one.
    const outcome = settle(result, attempts + 1, options.adjust);
    status = outcome.status;
    doneFor = outcome.done ? key : undefined;
    attempts = outcome.done ? 0 : attempts + 1;
  }

  /** Call after every sync step with the group's members and its reference player. */
  function update(members: readonly AudioMember[], reference: string | undefined) {
    const ids = members.map((member) => member.id);
    listenSet.set(enabled ? ids : []);
    const key = ids.toSorted().join(" ");
    const progress = { settled: readiness.update(members), pendingFor: collector.waitingFor(key) };
    const decision = decide(situation(members, { enabled, done: doneFor === key, ...progress }));
    if (decision.do === "show") {
      status = decision.status;
    } else if (decision.do === "ask") {
      collector.ask({ key, ids, reference: pickReference(reference, ids), seconds: CLIP_SECONDS });
      status = { state: "matching" };
    } else if (decision.do === "give-up") {
      finish(key, { matched: false, reason: "too-short" });
    }
  }

  function receiveClip(id: string, clip: AudioClip) {
    const collected = collector.receive(id, clip);
    if (collected) {
      finish(collected.key, matchClips(collected.clips, collected.reference, LIMITS));
    }
  }

  /** Forget the last match: match again with fresh audio. */
  function rematch(next: AudioStatus = { state: "listening", progress: 0 }) {
    doneFor = undefined;
    attempts = 0;
    collector.clear();
    readiness.reset();
    status = enabled ? next : { state: "off" };
  }

  function setEnabled(on: boolean) {
    enabled = on;
    rematch({ state: "waiting" });
  }

  return { update, receiveClip, setEnabled, rematch, status: () => status };
}
