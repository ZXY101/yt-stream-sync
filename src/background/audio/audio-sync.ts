import { matchClips, type MatchResult } from "../../audio/match-clips.ts";
import type { AudioClip, AudioStatus, PlayerCommand } from "../../lib/messages.ts";
import { createClipCollector } from "./clip-collector.ts";
import { decide, type Situation } from "./decide.ts";
import { createListenSet } from "./listen-set.ts";
import { createMatchBook } from "./match-book.ts";
import { createKnownGaps } from "./known-gaps.ts";
import { describeAsk, describeMatch } from "./match-log.ts";
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
  /** Writes a line to the debug log: what was asked for and how each comparison went. */
  log?: (line: string) => void;
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
function readinessOf(seconds: Map<string, number>, book: MatchBook) {
  const eligible = [...seconds].filter(([, s]) => s >= CLIP_SECONDS).map(([id]) => id);
  const sorted = [...seconds.values()].toSorted((a, b) => b - a);
  // Matching needs two players, so progress follows the second most settled one, and a player
  // that still needs matching: the matched ones alone would show a full bar that leads nowhere.
  const open = [...seconds].filter(([id]) => !book.isDone(id)).map(([, s]) => s);
  const needed = Math.min(sorted[1] ?? 0, Math.max(0, ...open));
  return { eligible, progress: Math.min(1, needed / CLIP_SECONDS) };
}

/** Some members are matched, and none of the others plays steadily yet. */
function partialOf(members: readonly AudioMember[], book: MatchBook): AudioStatus | undefined {
  const open = members.filter((member) => !book.isDone(member.id));
  const idle = open.length > 0 && open.every((member) => !member.settled);
  const anyMatched = members.some((member) => book.isMatched(member.id));
  return idle && anyMatched ? book.partial(members.map((member) => member.id)) : undefined;
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
    partial: partialOf(members, book),
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

interface SettleParts {
  collector: ReturnType<typeof createClipCollector>;
  readiness: ReturnType<typeof createReadiness>;
  book: MatchBook;
  tries: ReturnType<typeof createTries>;
  log: (line: string) => void;
  adjust: AudioSyncOptions["adjust"];
}

/** A try is over: logs how it went, applies what matched, and says what comes next. */
function settle(
  parts: SettleParts,
  outcome: { reference: string; result: MatchResult; members: string[] },
): AudioStatus {
  const { collector, readiness, book, tries, log, adjust } = parts;
  collector.clear();
  readiness.reset(); // The next match must hear audio played after this one took effect.
  describeMatch(outcome.result).forEach(log);
  const status = applyMatch({ ...outcome, book, adjust });
  tries.after(status, outcome.result);
  return tries.mark(status);
}

/**
 * Tries since a fresh start that left someone unmatched, so the popup can say it's another go.
 * Only a try where someone was compared and didn't match counts; a player that simply hasn't
 * started playing isn't a failure.
 */
function createTries() {
  let tries = 0;
  return {
    mark: (next: AudioStatus): AudioStatus =>
      next.state === "listening" && tries > 0 ? { ...next, tries } : next,
    after(next: AudioStatus, result: MatchResult) {
      if (next.state !== "listening") {
        tries = 0;
      } else if (result.unmatched.length > 0) {
        tries += 1;
      }
    },
    reset() {
      tries = 0;
    },
  };
}

type Pending = ReturnType<ReturnType<typeof createClipCollector>["pending"]>;

/** Not every player answered in time: a failed try for all of them. */
function gaveUp(asked: Pending, log: (line: string) => void): [string, MatchResult] {
  const missing = asked?.ids.filter((id) => !asked.clips[id]).join(", ") || "a player";
  log(`audio: no clip from ${missing} in time; trying again later`);
  return [asked?.reference ?? "", { lags: {}, unmatched: asked?.ids ?? [], tooShort: true }];
}

/** Matched players stay the reference when they can, so new players join them. */
function pickReference(eligible: string[], book: MatchBook): string {
  return eligible.find((id) => book.isDone(id)) ?? (eligible[0] as string);
}

interface AskParts {
  log: (line: string) => void;
  collector: ReturnType<typeof createClipCollector>;
  knownGaps: ReturnType<typeof createKnownGaps>;
  eligible: string[];
  book: MatchBook;
}

/** Asks the eligible players for their last seconds of audio. */
function askForClips({ log, collector, knownGaps, eligible, book }: AskParts): AudioStatus {
  const reference = pickReference(eligible, book);
  log(describeAsk(eligible, reference, CLIP_SECONDS));
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
  const tries = createTries();
  const knownGaps = createKnownGaps();
  const log = options.log ?? (() => undefined);

  const parts = { collector, readiness, book, tries, log, adjust: options.adjust };

  function finish(reference: string, result: MatchResult) {
    status = settle(parts, { reference, result, members: memberIds });
  }

  /** Call after every sync step with the group's members. */
  function update(members: readonly AudioMember[]) {
    memberIds = members.map((member) => member.id);
    knownGaps.update(members);
    listenSet.set(enabled ? memberIds : []);
    const { eligible, progress } = readinessOf(readiness.update(members), book);
    const facts = { enabled, pendingFor: collector.waitingFor(), progress };
    const decision = decide(situation(members, eligible, book, facts));
    if (decision.do === "show") {
      status = tries.mark(decision.status);
    } else if (decision.do === "ask") {
      status = askForClips({ log, collector, knownGaps, eligible, book });
    } else if (decision.do === "give-up") {
      finish(...gaveUp(collector.pending(), log));
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
    tries.reset();
    book.clear();
    collector.clear();
    readiness.reset();
    status = enabled ? next : { state: "off" };
  }

  function setEnabled(on: boolean) {
    enabled = on;
    rematch({ state: "waiting" });
  }

  return { update, receiveClip, setEnabled, rematch, readiness, status: () => status };
}
