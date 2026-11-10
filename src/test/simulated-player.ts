import type { Action, PlayerSample, PlayerState } from "../controller/types.ts";

export interface SimulatedPlayerOptions {
  id: string;
  /** Starting seconds behind live. Must be at least ingestDelay + segmentLength. */
  latency: number;
  /** HLS segment length: video arrives in steps this long. */
  segmentLength?: number;
  /** Seconds from a moment being broadcast to its segment being downloadable. */
  ingestDelay?: number;
  /** Seconds of buffer a stalled player waits for before it plays again. */
  rebuffer?: number;
}

/**
 * A YouTube live player, close enough for the controller: the live edge moves at 1 s/s,
 * video arrives a segment at a time, the playhead moves at the playback rate and stalls when
 * the buffer runs dry. Times are broadcast seconds; `clock` is the shared wall clock.
 */
export class SimulatedPlayer {
  readonly id: string;
  playbackRate = 1;
  state: PlayerState = "playing";
  private clock = 0;
  private position: number;
  private downloaded: number;
  private networkDownUntil = 0;
  private adUntil = 0;
  private readonly segmentLength: number;
  private readonly ingestDelay: number;
  private readonly rebuffer: number;

  constructor(options: SimulatedPlayerOptions) {
    this.id = options.id;
    this.segmentLength = options.segmentLength ?? 2;
    this.ingestDelay = options.ingestDelay ?? 1;
    this.rebuffer = options.rebuffer ?? 1;
    this.position = -options.latency;
    this.downloaded = this.availableUntil();
  }

  get latency(): number {
    return this.clock - this.position;
  }

  get bufferAhead(): number {
    return this.downloaded - this.position;
  }

  sample(): PlayerSample {
    const { id, latency, bufferAhead, state, playbackRate } = this;
    return { id, latency, bufferAhead, state, playbackRate };
  }

  apply(action: Action): void {
    if (action.type === "setRate") {
      this.playbackRate = action.rate;
    } else if (action.type === "pause") {
      this.state = "paused";
    } else if (this.state === "paused") {
      this.state = "playing";
    }
  }

  /** No new video for `seconds`, like a streamer's upload hiccup or a slow connection. */
  dropNetwork(seconds: number): void {
    this.networkDownUntil = this.clock + seconds;
  }

  /** A mid-roll ad: the stream itself stops for `seconds`. */
  showAd(seconds: number): void {
    this.state = "ad";
    this.adUntil = this.clock + seconds;
  }

  advance(seconds: number): void {
    this.clock += seconds;
    if (this.clock >= this.networkDownUntil) {
      this.downloaded = this.availableUntil();
    }
    if (this.state === "ad" && this.clock >= this.adUntil) {
      this.state = "playing";
    }
    if (this.state === "playing") {
      this.play(seconds);
    } else if (this.state === "buffering" && this.bufferAhead >= this.rebuffer) {
      this.state = "playing";
    }
  }

  private play(seconds: number): void {
    this.position += seconds * this.playbackRate;
    if (this.position >= this.downloaded) {
      this.position = this.downloaded;
      this.state = "buffering";
    }
  }

  private availableUntil(): number {
    const ready = this.clock - this.ingestDelay;
    return Math.floor(ready / this.segmentLength) * this.segmentLength;
  }
}
