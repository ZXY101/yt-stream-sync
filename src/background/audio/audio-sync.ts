import { matchClips, type MatchResult } from "../../audio/match-clips.ts";
import type { AudioClip, AudioStatus, PlayerCommand } from "../../lib/messages.ts";
import { createClipCollector } from "./clip-collector.ts";
import { decide, type Situation } from "./decide.ts";
import { createListenSet } from "./listen-set.ts";
import { createMatchBook } from "./match-book.ts";
import { createReadiness } from "./readiness.ts";

/** Seconds of audio compared. Longer is more reliable; the page keeps 36. */
const CLIP_SECONDS = 30;
// Start times are off by a few seconds (each streamer's encoder delay) and users nudge, so
// lags up to 15 s are searched.
const LIMITS = { maxLag: 15, minSeconds: CLIP_SECONDS / 2 };
const CLIP_TIMEOUT = 5;

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
  /** Seconds ahead of its spot in the sync (negative: behind), from the last step. */
  error?: number;
}

type MatchBook = ReturnType<typeof createMatchBook>;

/** Players that have played in sync for a whole clip, and progress towards two of them. */
function readinessOf(seconds: Map<string, number>) {
  const eligible = [...seconds].filter(([, s]) => s >= CLIP_SECONDS).map(([id]) => id);
  const sorted = [...seconds.values()].toSorted((a, b) => b - a);
  // Matching needs two players, so progress follows the second most settled one.
  return { eligible, progress: Math.min(1, Math.max(0, sorted[1] ?? 0) / CLIP_SECONDS) };
}

function situation(
  members: readonly AudioMember[],
  eligible: string[],
  book: MatchBook,
  facts: Pick<Situation, "enabled" | "pendingFor" | "progress">,
): Situation {
  return {
    ...facts,
    members: members.length,
    blocked: members.some((member) => member.blocked),
    unavailable: members.some((member) => member.unavailable === true),
    ready: eligible.length >= 2 && eligible.some((id) => !book.isDone(id)),
    allMatched: members.every((member) => book.isDone(member.id)),
    clipTimeout: CLIP_TIMEOUT,
  };
}

interface Applied {
  reference: string;
  result: MatchResult;
  members: string[];
  book: MatchBook;
  adjust: AudioSyncOptions["adjust"];
}

/**
 * Moves each newly matched player by its lag, notes the outcome, and says what comes next.
 * Players matched before are left alone: moving them again on a re-measurement would jump
 * (and pause) the whole group every time an unmatched player is retried.
 */
function applyMatch({ reference, result, members, book, adjust }: Applied): AudioStatus {
  const fresh = Object.entries(result.lags).filter(([id]) => !book.isMatched(id));
  fresh.forEach(([id, lag]) => adjust(id, lag));
  book.record(reference, { ...result, lags: Object.fromEntries(fresh) });
  if (!members.every((id) => book.isDone(id))) {
    return { state: "listening", progress: 0 };
  }
  return book.status(members, result.tooShort === true);
}

/**
 * The audio lag includes any gap the sync already knows about and keeps on purpose (a
 * low-latency stream that can't be held back further). Only the rest is a wrong offset:
 * moving the offset by the whole lag would count that gap twice. Keeps the players' errors
 * from when the clips were asked for (the moment the clips end) to take that gap out.
 */
function createKnownGaps() {
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

/** Matched players stay the reference when they can, so new players join them. */
function pickReference(eligible: string[], book: MatchBook): string {
  return eligible.find((id) => book.isDone(id)) ?? (eligible[0] as string);
}

interface AskParts {
  collector: ReturnType<typeof createClipCollector>;
  knownGaps: ReturnType<typeof createKnownGaps>;
  eligible: string[];
  book: MatchBook;
}

/** Asks the eligible players for their last seconds of audio. */
function askForClips({ collector, knownGaps, eligible, book }: AskParts): AudioStatus {
  const reference = pickReference(eligible, book);
  collector.ask({ ids: eligible, reference, seconds: CLIP_SECONDS });
  knownGaps.remember();
  return { state: "matching" };
}

/**
 * Matches the added players by their audio: once two or more have played in sync for long
 * enough, asks them for their last seconds of audio, measures how far each lags behind a
 * reference and moves its offset by as much. Players that can't be matched yet are tried
 * again later; players that haven't started playing join once they do.
 */
export function createAudioSync(options: AudioSyncOptions) {
  const listenSet = createListenSet(options.send);
  const readiness = createReadiness(options.now);
  const collector = createClipCollector(options.send, options.now);
  const book = createMatchBook();
  let enabled = true;
  let status: AudioStatus = { state: "waiting" };
  let memberIds: string[] = [];
  const knownGaps = createKnownGaps();

  function finish(reference: string, result: MatchResult) {
    collector.clear();
    readiness.reset(); // The next match must hear audio played after this one took effect.
    status = applyMatch({ reference, result, members: memberIds, book, adjust: options.adjust });
  }

  /** Call after every sync step with the group's members. */
  function update(members: readonly AudioMember[]) {
    memberIds = members.map((member) => member.id);
    knownGaps.update(members);
    listenSet.set(enabled ? memberIds : []);
    const { eligible, progress } = readinessOf(readiness.update(members));
    const facts = { enabled, pendingFor: collector.waitingFor(), progress };
    const decision = decide(situation(members, eligible, book, facts));
    if (decision.do === "show") {
      status = decision.status;
    } else if (decision.do === "ask") {
      status = askForClips({ collector, knownGaps, eligible, book });
    } else if (decision.do === "give-up") {
      // Not every player answered in time: a failed try for all of them.
      const asked = collector.pending();
      finish(asked?.reference ?? "", { lags: {}, unmatched: asked?.ids ?? [], tooShort: true });
    }
  }

  function receiveClip(id: string, clip: AudioClip) {
    const collected = collector.receive(id, clip);
    if (collected) {
      const { clips, reference } = collected;
      finish(reference, knownGaps.remove(matchClips(clips, reference, LIMITS), reference));
    }
  }

  /** Forget all matches: match again with fresh audio. */
  function rematch(next: AudioStatus = { state: "listening", progress: 0 }) {
    book.clear();
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
