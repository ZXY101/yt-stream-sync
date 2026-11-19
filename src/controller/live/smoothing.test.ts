import { ageHistory, smoothLatencies } from "./smoothing.ts";
import type { LiveSample } from "./types.ts";

function sample(latency: number, overrides: Partial<LiveSample> = {}): LiveSample {
  return { id: "a", latency, bufferAhead: 5, state: "playing", playbackRate: 1, ...overrides };
}

/** Feeds readings one control step apart and returns the latency used at each step. */
function filter(readings: number[], overrides: Partial<LiveSample> = {}): number[] {
  let history = {};
  return readings.map((reading) => {
    const current = sample(reading, overrides);
    const result = smoothLatencies(history, [current]);
    history = ageHistory(result.history, result.samples, []);
    return result.samples[0]?.latency ?? Number.NaN;
  });
}

describe("smoothLatencies", () => {
  it("takes the first reading as it is", () => {
    expect(filter([8])).toEqual([8]);
  });

  it("is only nudged by a reading that's off by a little", () => {
    const [, second] = filter([8, 10]);
    expect(second).toBeCloseTo(8.2);
  });

  it("ignores a single reading that's off by a lot", () => {
    expect(filter([8, 12, 8])).toEqual([8, 8, 8]);
  });

  it("follows a real jump once the next reading agrees", () => {
    expect(filter([10, 5, 5])).toEqual([10, 10, 5]);
  });

  it("doesn't count readings off in opposite ways as a jump", () => {
    expect(filter([8, 12, 4])).toEqual([8, 8, 8]);
  });

  it("keeps up with a slowed stream between readings", () => {
    const latencies = filter([8, 8.08, 8.16, 8.24], { playbackRate: 0.92 });
    expect(latencies.at(-1)).toBeCloseTo(8.24);
  });

  it("leaves pinned players as read", () => {
    const result = smoothLatencies({ a: [8, 0] }, [sample(3, { pinned: true })]);
    expect(result.samples[0]?.latency).toBe(3);
    expect(result.history).toEqual({});
  });
});

describe("ageHistory", () => {
  it("grows a stream's estimate by what the speed it was just given adds", () => {
    const next = ageHistory({ a: [8, 0] }, [sample(8)], [{ type: "setRate", id: "a", rate: 0.92 }]);
    expect(next.a?.[0]).toBeCloseTo(8.08);
  });

  it("grows a stream that isn't playing by a second", () => {
    expect(ageHistory({ a: [8, 0] }, [sample(8, { state: "buffering" })], [])).toEqual({
      a: [9, 0],
    });
  });

  it("forgets a stream that was skipped, paused or played", () => {
    const skipped = ageHistory({ a: [8, 0] }, [sample(8)], [{ type: "skip", id: "a", seconds: 2 }]);
    expect(skipped).toEqual({});
  });
});
