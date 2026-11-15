import { initialState, step } from "./controller.ts";
import type { Action, PlayerSample, PlayerState, SyncSettings } from "./types.ts";

interface NoRewindOptions {
  id: string;
  /** Where YouTube keeps it, and puts it back to. */
  home: number;
  segmentLength: number;
  /** YouTube puts it back home once it's closer to live than this (a jump it won't keep). */
  minLatency?: number;
  /** YouTube pulls it back home once it's further behind than this (a low-latency stream). */
  maxLatency?: number;
}

const INGEST = 1;
const BUFFER_LOW_SECONDS = 15;

/**
 * A no-rewind live player as seen on 2026-11-15: video arrives a segment at a time, a skip
 * moves within the buffer, and YouTube puts the player back home when it's held too far back
 * (low latency) or jumped too close to live (normal latency).
 */
class NoRewindPlayer {
  playbackRate = 1;
  state: PlayerState = "playing";
  movedByYouTube = 0;
  private clock = 0;
  private position: number;
  private recentBuffers: number[] = [];

  readonly options: NoRewindOptions;

  constructor(options: NoRewindOptions) {
    this.options = options;
    this.position = -options.home;
  }

  get latency(): number {
    return this.clock - this.position;
  }

  private get downloaded(): number {
    const { segmentLength } = this.options;
    return Math.floor((this.clock - INGEST) / segmentLength) * segmentLength;
  }

  get bufferAhead(): number {
    return Math.max(0, this.downloaded - this.position);
  }

  sample(): PlayerSample {
    const { latency, bufferAhead, state, playbackRate } = this;
    const bufferLow = Math.min(bufferAhead, ...this.recentBuffers);
    return {
      id: this.options.id,
      latency,
      bufferAhead,
      bufferLow,
      state,
      playbackRate,
      noRewind: true,
    };
  }

  apply(action: Action): void {
    if (action.type === "setRate") {
      this.playbackRate = action.rate;
    } else if (action.type === "skip") {
      this.position = Math.min(this.downloaded, this.position + action.seconds);
    } else if (action.type === "pause") {
      this.goHome(); // What YouTube does with a paused no-rewind stream once it plays again.
    }
  }

  advance(seconds: number): void {
    this.clock += seconds;
    if (this.state === "buffering" && this.bufferAhead >= 1) {
      this.state = "playing";
    }
    if (this.state === "playing") {
      this.position += seconds * this.playbackRate;
      if (this.position >= this.downloaded) {
        this.position = this.downloaded;
        this.state = "buffering";
      }
    }
    const { minLatency = 0, maxLatency = Infinity } = this.options;
    if (this.latency < minLatency || this.latency > maxLatency) {
      this.goHome();
    }
  }

  endSecond(): void {
    this.recentBuffers = [...this.recentBuffers, this.bufferAhead].slice(-BUFFER_LOW_SECONDS);
  }

  private goHome(): void {
    this.position = this.clock - this.options.home;
    this.movedByYouTube += 1;
  }
}

function run(players: NoRewindPlayer[], seconds: number) {
  const settings: SyncSettings = {
    enabled: true,
    group: players.map((player) => player.options.id),
    offsets: {},
    safetyMargin: 0,
  };
  const byId = new Map(players.map((player) => [player.options.id, player]));
  let state = initialState();
  const spreads: number[] = [];
  const actions: Action[] = [];
  for (let second = 0; second < seconds; second += 1) {
    const result = step(
      state,
      players.map((player) => player.sample()),
      settings,
    );
    state = result.state;
    result.actions.forEach((action) => byId.get(action.id)?.apply(action));
    actions.push(...result.actions);
    for (let sub = 0; sub < 10; sub += 1) {
      players.forEach((player) => player.advance(0.1));
    }
    players.forEach((player) => player.endSecond());
    const latencies = players.map((player) => player.latency);
    spreads.push(Math.max(...latencies) - Math.min(...latencies));
  }
  return { spreads, actions };
}

describe("no-rewind streams against simulated YouTube players", () => {
  it("brings the real group of three together and keeps it there", () => {
    const su = new NoRewindPlayer({ id: "su", home: 8, segmentLength: 1, maxLatency: 11 });
    const pekora = new NoRewindPlayer({
      id: "pekora",
      home: 8.6,
      segmentLength: 1,
      maxLatency: 11.6,
    });
    const riona = new NoRewindPlayer({
      id: "riona",
      home: 18.4,
      segmentLength: 5,
      minLatency: 6.5,
    });

    const { spreads, actions } = run([su, pekora, riona], 240);

    expect(Math.max(...spreads.slice(120))).toBeLessThan(0.6);
    expect(actions.some((action) => action.type === "pause")).toBe(false);
    expect(su.movedByYouTube + pekora.movedByYouTube + riona.movedByYouTube).toBe(0);
  });

  it("learns where YouTube won't keep a stream, and settles close to it", () => {
    // Riona won't stay closer than 12 s; the low-latency ones won't go past 11 s.
    const su = new NoRewindPlayer({ id: "su", home: 8, segmentLength: 1, maxLatency: 11 });
    const pekora = new NoRewindPlayer({
      id: "pekora",
      home: 8.6,
      segmentLength: 1,
      maxLatency: 11.6,
    });
    const riona = new NoRewindPlayer({ id: "riona", home: 18.4, segmentLength: 5, minLatency: 12 });

    const { spreads, actions } = run([su, pekora, riona], 900);

    // Su and Pekora are probed back toward Riona until YouTube pulls them forward; Riona is
    // retried closer every few minutes. Most of the time the gap stays small.
    const late = spreads.slice(120);
    const close = late.filter((spread) => spread < 2.5).length / late.length;
    expect(close).toBeGreaterThan(0.85);
    expect(riona.movedByYouTube).toBeLessThanOrEqual(8);
    expect(actions.some((action) => action.type === "pause")).toBe(false);
  });
});
