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
  /**
   * Ultra-low latency: YouTube keeps it near the live edge, so it is never paused or slowed,
   * only held back a little by seeking (see `pinned-step.ts`).
   */
  pinned?: boolean;
  /**
   * Rewind (DVR) is off: YouTube sends it back to the live edge after a pause or a seek back
   * (seen on real streams), so it is never paused or slowed. It may still jump ahead.
   */
  noRewind?: boolean;
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
  /** Pinned players: hold back or jump ahead once this many seconds off the target. */
  holdError: number;
  /** Pinned players: the most latency to hold one back to (YouTube snaps it back past it). */
  pinnedMaxLatency: number;
  /** Pinned players: the most seconds to seek back in one go. */
  maxHoldStep: number;
  /** Pinned players: a latency this far below where a hold-back left it means a snap-back. */
  snapDrop: number;
  /** After a snap-back, the player's ceiling goes this far below where it snapped. */
  snapMargin: number;
  /** No-rewind players keep this much buffer after a jump ahead (5 s segments stall below). */
  noRewindMinBuffer: number;
  /** A no-rewind player this many seconds behind its spot jumps ahead (nothing else moves it ahead). */
  noRewindJumpError: number;
  /** A no-rewind player may be slowed to this many seconds behind where YouTube keeps it. */
  slowRoom: number;
  /** A no-rewind player's latency changing this much in one step means YouTube moved it. */
  moveJump: number;
  /** Steps a learned floor or ceiling is kept before it eases a little. */
  learnedSteps: number;
  /** A learned floor or ceiling sits this far inside where YouTube moved the stream. */
  learnedMargin: number;
  /** Steps held at its back limit before a no-rewind stream gets a second more room. */
  probeSteps: number;
  /** Steps after a jump ahead before judging whether YouTube let it stay. */
  jumpJudgeSteps: number;
}

/** What the controller is doing to a player. */
export type Mode = "normal" | "slowing" | "paused";

export interface ControllerState {
  modes: Readonly<Record<string, Mode>>;
  /** Steps left before each player may jump ahead again. */
  cooldowns?: Readonly<Record<string, number>>;
  /** Pinned players held back: the latency the hold-back should have left them at. */
  held?: Readonly<Record<string, number>>;
  /** Pinned players that snapped back: the most latency each holds at. */
  ceilings?: Readonly<Record<string, number>>;
  /** Pinned players: the lowest latency each has shown, i.e. its live edge. */
  floors?: Readonly<Record<string, number>>;
  /** No-rewind players: where each one stays without YouTube moving it (see `reach.ts`). */
  reach?: Readonly<Record<string, Reach>>;
  /** The lag a group with a no-rewind player lines up at (see `aim.ts`). */
  aim?: number;
}

/** What the sync has learned about where a no-rewind stream stays. Latencies in seconds. */
export interface Reach {
  /** Where YouTube keeps it when left alone: its first latency, or where YouTube last moved it. */
  home: number;
  /** Its latency at the last step (or where a jump that step should leave it). */
  last: number;
  /** YouTube put it further back from here: it won't stay closer to live than this, for now. */
  floor?: number;
  /** YouTube pulled it toward live from here: it won't stay further back than this, for now. */
  ceiling?: number;
  /** Steps until `floor` and `ceiling` ease a little, so they're tried again now and then. */
  forgetIn?: number;
  /** Steps it has been held at its back limit while the group wanted it further back. */
  pressedFor?: number;
  /** A jump ahead the sync made, judged once the latency reading has caught up. */
  jump?: { from: number; to: number; judgeIn: number };
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
  /** Synced players the controller can't move any closer to the target. */
  stuck: string[];
}
