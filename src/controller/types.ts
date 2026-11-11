export type PlayerState = "playing" | "paused" | "buffering" | "ad" | "ended";

/** One reading of a player, taken about once a second. */
export interface PlayerSample {
  id: string;
  /** Seconds behind the live edge, from the player's stats for nerds. */
  latency: number;
  /** Seconds of video buffered ahead of the playhead. */
  bufferAhead: number;
  state: PlayerState;
  playbackRate: number;
  /** Lowest buffer over the last 15 s; how far the player can jump ahead. */
  bufferLow?: number;
  /** Ultra-low latency: YouTube keeps it at the live edge, so it is never held back. */
  pinned?: boolean;
}

export interface SyncSettings {
  enabled: boolean;
  /** Ids of the players the user opted in. Nothing outside this list is ever touched. */
  group: readonly string[];
  /** Manual nudge per player id: positive shows that player ahead of the others (newer). */
  offsets: Readonly<Record<string, number>>;
  /** Extra seconds of buffer every player keeps, for shaky streams (0–3). */
  safetyMargin: number;
}

/** Controller constants. Defaults in `tuning.ts`; tests may override them. */
export interface Tuning {
  /** Playback rate for the stream that's ahead. Never above 1. */
  slowRate: number;
  /** Start slowing a player once it's this many seconds ahead. */
  startError: number;
  /** Stop slowing once it's less than this many seconds ahead. */
  stopError: number;
  /** Pause instead of slowing when a player is more than this many seconds ahead. */
  pauseError: number;
  /** Resume a paused player once it's at most this many seconds ahead. */
  resumeError: number;
  /** Every player should keep at least this many seconds buffered. */
  minBuffer: number;
  /** With a pinned player in the group: jump a player ahead once it's this far behind. */
  jumpError: number;
  /** Steps to wait after a jump before the next one (the latency reading catches up). */
  jumpCooldown: number;
}

/** What the controller is doing to a player. */
export type Mode = "normal" | "slowing" | "paused";

export interface ControllerState {
  modes: Readonly<Record<string, Mode>>;
  /** Steps left before each player may jump ahead again. */
  cooldowns?: Readonly<Record<string, number>>;
}

export type Action =
  | { type: "setRate"; id: string; rate: number }
  | { type: "seek"; id: string; position: number }
  | { type: "skip"; id: string; seconds: number }
  | { type: "pause"; id: string }
  | { type: "play"; id: string };

export interface StepResult {
  state: ControllerState;
  actions: Action[];
  /** Seconds each synced player is ahead of the target. Empty while syncing is on hold. */
  errors: Record<string, number>;
}
