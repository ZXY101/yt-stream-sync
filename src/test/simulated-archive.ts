import type { ArchiveSample } from "../controller/archive/types.ts";
import type { Action, PlayerState } from "../controller/types.ts";

export interface SimulatedArchiveOptions {
  id: string;
  position: number;
  duration?: number;
  startTime?: number;
  /** Seconds of video downloaded per second. Different players finish buffering at
   * different times after a jump. */
  loadRate?: number;
}

// A player starts again after a stall once it has this much buffered, like YouTube.
const RESUME_BUFFER = 1;
const MAX_BUFFER = 30;

/** An archived stream's player: downloads ahead, plays at its rate, stalls when empty. */
export class SimulatedArchive {
  readonly id: string;
  position: number;
  bufferAhead = MAX_BUFFER;
  playbackRate = 1;
  state: PlayerState = "playing";
  userActions = 0;
  private readonly duration: number;
  private readonly startTime: number | undefined;
  private loadRate: number;
  /** What the player does once it has buffered after a stall or jump. */
  private wantsToPlay = true;

  constructor(options: SimulatedArchiveOptions) {
    this.id = options.id;
    this.position = options.position;
    this.duration = options.duration ?? 10_000;
    this.startTime = options.startTime;
    this.loadRate = options.loadRate ?? 4;
  }

  sample(): ArchiveSample {
    const { id, position, duration, bufferAhead, startTime, state, playbackRate, userActions } =
      this;
    return { id, position, duration, bufferAhead, startTime, state, playbackRate, userActions };
  }

  apply(action: Action): void {
    if (action.type === "setRate") {
      this.playbackRate = action.rate;
    } else if (action.type === "seek") {
      this.position = action.position;
      this.bufferAhead = 0;
      this.state = this.wantsToPlay ? "buffering" : "paused";
    } else {
      this.wantsToPlay = action.type === "play";
      this.state = this.wantsToPlay ? this.playingState() : "paused";
    }
  }

  /** A network that slows down (0: nothing arrives) or recovers. */
  setLoadRate(secondsPerSecond: number): void {
    this.loadRate = secondsPerSecond;
  }

  /** What the user does on the player itself. */
  user(action: Action): void {
    this.apply(action);
    this.userActions += 1;
  }

  advance(seconds: number): void {
    this.bufferAhead = Math.min(MAX_BUFFER, this.bufferAhead + seconds * this.loadRate);
    if (this.state === "buffering" && this.bufferAhead >= RESUME_BUFFER) {
      this.state = "playing";
    }
    if (this.state !== "playing") {
      return;
    }
    const step = Math.min(seconds * this.playbackRate, this.bufferAhead);
    this.position = Math.min(this.duration, this.position + step);
    this.bufferAhead -= step;
    if (this.bufferAhead <= 0) {
      this.state = "buffering";
    }
  }

  private playingState(): PlayerState {
    return this.bufferAhead >= RESUME_BUFFER ? "playing" : "buffering";
  }
}
