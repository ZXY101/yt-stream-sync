import type { Action, PlayerState } from "../types.ts";

/** One reading of an archived stream's player. */
export interface ArchiveSample {
  id: string;
  /** Seconds into the video. */
  position: number;
  duration: number;
  /** Seconds of video buffered ahead of the position. */
  bufferAhead: number;
  /** When the broadcast started, in Unix seconds. Watch pages have it; embeds don't. */
  startTime?: number;
  state: PlayerState;
  playbackRate: number;
  /** Goes up each time the user seeks, plays, pauses or changes speed on this player. */
  userActions: number;
}

export interface ArchiveSettings {
  enabled: boolean;
  group: readonly string[];
  /** Manual nudge per player id: positive shows that player ahead of the others (newer). */
  offsets: Readonly<Record<string, number>>;
}

export interface ArchiveTuning {
  /** Regroup (pause all, jump, wait for buffers, play all) past this many seconds off. */
  seekError: number;
  /** While regrouping, jump a player again if it's this many seconds off its spot. */
  alignError: number;
  /** While regrouping, every player needs this many seconds buffered before all play. */
  readyBuffer: number;
  /** Give up waiting for buffers after this many steps (about seconds) and play anyway. */
  regroupSteps: number;
  /** Start trimming the speed when a player is this many seconds off... */
  startError: number;
  /** ...and stop once it's within this. */
  stopError: number;
  /** How much faster or slower than the reference a trimmed player plays. */
  trim: number;
}

export interface ArchiveState {
  /** The player the others follow: the one the user last touched. */
  reference?: string;
  /** Last `userActions` count seen per player. */
  seen: Readonly<Record<string, number>>;
  /** Broadcast time (Unix seconds) at position 0, per player. */
  bases: Readonly<Record<string, number>>;
  /** Players whose speed is being trimmed. */
  trimming: Readonly<Record<string, boolean>>;
  /**
   * Set while regrouping: everyone is paused at their spot until all have buffered.
   * `play`: whether to play once ready. `steps`: how long it has waited.
   */
  regroup?: { play: boolean; steps: number };
  /** Players that never finished buffering in a regroup. The others carry on without them
   * until they play again. */
  stuck?: Readonly<Record<string, boolean>>;
}

export interface ArchiveStepResult {
  state: ArchiveState;
  actions: Action[];
  /** Seconds each follower is ahead of where it should be (negative: behind). */
  errors: Record<string, number>;
}
