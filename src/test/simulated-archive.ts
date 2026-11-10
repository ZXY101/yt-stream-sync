import type { ArchiveSample } from "../controller/archive/types.ts";
import type { Action, PlayerState } from "../controller/types.ts";

export interface SimulatedArchiveOptions {
  id: string;
  position: number;
  duration?: number;
  startTime?: number;
  /** Seconds a seek leaves the player buffering. */
  seekDelay?: number;
}

/** An archived stream's player: plays at its rate, seeks with a short re-buffer. */
export class SimulatedArchive {
  readonly id: string;
  position: number;
  playbackRate = 1;
  state: PlayerState = "playing";
  userActions = 0;
  private readonly duration: number;
  private readonly startTime: number | undefined;
  private readonly seekDelay: number;
  private bufferingFor = 0;
  private resumeAs: PlayerState = "playing";

  constructor(options: SimulatedArchiveOptions) {
    this.id = options.id;
    this.position = options.position;
    this.duration = options.duration ?? 10_000;
    this.startTime = options.startTime;
    this.seekDelay = options.seekDelay ?? 0.5;
  }

  sample(): ArchiveSample {
    const { id, position, duration, startTime, state, playbackRate, userActions } = this;
    return { id, position, duration, startTime, state, playbackRate, userActions };
  }

  apply(action: Action): void {
    if (action.type === "setRate") {
      this.playbackRate = action.rate;
    } else if (action.type === "seek") {
      this.seek(action.position);
    } else if (action.type === "pause") {
      this.setPlaying(false);
    } else {
      this.setPlaying(true);
    }
  }

  /** What the user does on the player itself. */
  user(action: Action): void {
    this.apply(action);
    this.userActions += 1;
  }

  advance(seconds: number): void {
    if (this.state === "buffering") {
      this.bufferingFor -= seconds;
      if (this.bufferingFor <= 0) {
        this.state = this.resumeAs;
      }
      return;
    }
    if (this.state === "playing") {
      this.position = Math.min(this.duration, this.position + seconds * this.playbackRate);
    }
  }

  private seek(position: number): void {
    this.position = position;
    this.resumeAs = this.state === "paused" ? "paused" : "playing";
    this.state = "buffering";
    this.bufferingFor = this.seekDelay;
  }

  private setPlaying(playing: boolean): void {
    if (this.state === "buffering") {
      this.resumeAs = playing ? "playing" : "paused";
    } else {
      this.state = playing ? "playing" : "paused";
    }
  }
}
