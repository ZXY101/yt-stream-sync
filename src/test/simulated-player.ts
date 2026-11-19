import type { LiveSample } from "../controller/live/types.ts";
import type { Action, PlayerState } from "../controller/types.ts";
import { noise } from "./noise.ts";

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
  /**
   * Rewind (DVR) turned off: like YouTube, a pause or a skip back sends the player back to
   * its starting latency (seen on real streams).
   */
  rewind?: boolean;
  /**
   * The latency YouTube's stats show is off by up to this many seconds each reading, while the
   * stream itself plays smoothly (seen on a real collab: one stream read 7.3, 11.7, 10.2 s
   * within seconds).
   */
  readingNoise?: number;
}

const NOISE_READINGS = 4096;

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
  private readonly rewind: boolean;
  private readonly home: number;
  private readonly readingNoise: number;
  private readonly noise: Float32Array;
  private readings = 0;

  constructor(options: SimulatedPlayerOptions) {
    this.id = options.id;
    this.segmentLength = options.segmentLength ?? 2;
    this.ingestDelay = options.ingestDelay ?? 1;
    this.rebuffer = options.rebuffer ?? 1;
    this.rewind = options.rewind ?? true;
    this.home = options.latency;
    this.readingNoise = options.readingNoise ?? 0;
    this.noise = noise(NOISE_READINGS, options.latency * 1000);
    this.position = -options.latency;
    this.downloaded = this.availableUntil();
  }

  get latency(): number {
    return this.clock - this.position;
  }

  get bufferAhead(): number {
    return this.downloaded - this.position;
  }

  sample(): LiveSample {
    const { id, bufferAhead, state, playbackRate } = this;
    const latency = this.latency + this.readingError();
    return { id, latency, bufferAhead, state, playbackRate, noRewind: !this.rewind };
  }

  private readingError(): number {
    const index = this.readings % NOISE_READINGS;
    this.readings += 1;
    return (this.noise[index] ?? 0) * this.readingNoise;
  }

  apply(action: Action): void {
    if (action.type === "setRate") {
      this.playbackRate = action.rate;
    } else if (action.type === "pause") {
      this.state = "paused";
    } else if (action.type === "skip") {
      this.skip(action.seconds);
    } else if (this.state === "paused") {
      this.state = "playing";
      this.snapIfNoRewind();
    }
  }

  private skip(seconds: number): void {
    if (seconds < 0 && !this.rewind) {
      this.snapIfNoRewind();
      return;
    }
    this.position = Math.min(this.position + seconds, this.downloaded);
    if (this.position >= this.downloaded && this.state === "playing") {
      this.state = "buffering";
    }
  }

  private snapIfNoRewind(): void {
    if (!this.rewind) {
      this.position = Math.min(this.clock - this.home, this.downloaded);
    }
  }

  /** No new video for `seconds`, like a streamer's upload hiccup or a slow connection. */
  dropNetwork(seconds: number): void {
    this.networkDownUntil = this.clock + seconds;
  }

  /** YouTube moves the stream this many seconds closer to live by itself (seen on real streams). */
  movedByYouTube(seconds: number): void {
    this.position = Math.min(this.position + seconds, this.downloaded);
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
