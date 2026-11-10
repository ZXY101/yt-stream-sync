import { createLatencyTracker } from "./latency.ts";

describe("latency tracker", () => {
  it("passes real readings through while playing", () => {
    const tracker = createLatencyTracker();

    expect(tracker.update(4.2, "playing", 10)).toBe(4.2);
  });

  it("counts up from the last reading while paused, ignoring YouTube's 0", () => {
    const tracker = createLatencyTracker();
    tracker.update(4.2, "playing", 10);

    expect(tracker.update(0, "paused", 13)).toBeCloseTo(7.2);
    expect(tracker.update(5, "paused", 14)).toBeCloseTo(8.2);
  });

  it("counts up while buffering when the reading is missing", () => {
    const tracker = createLatencyTracker();
    tracker.update(5, "playing", 0);

    expect(tracker.update(undefined, "buffering", 2)).toBe(7);
    expect(tracker.update(7.5, "buffering", 3)).toBe(7.5);
  });

  it("has nothing to say before the first reading or for a playing player without one", () => {
    const tracker = createLatencyTracker();

    expect(tracker.update(0, "paused", 1)).toBeUndefined();
    tracker.update(4, "playing", 2);
    expect(tracker.update(undefined, "playing", 3)).toBeUndefined();
  });
});
