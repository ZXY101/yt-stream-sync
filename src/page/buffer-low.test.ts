import { createBufferLowTracker } from "./buffer-low.ts";

describe("lowest buffer of late", () => {
  it("keeps the lowest reading of the last 15 s", () => {
    const tracker = createBufferLowTracker();

    expect(tracker.update(4, 0)).toBe(4);
    expect(tracker.update(9, 5)).toBe(4);
    expect(tracker.update(8, 16)).toBe(8);
  });

  it("starts over after a reset", () => {
    const tracker = createBufferLowTracker();
    tracker.update(1, 0);
    tracker.reset();

    expect(tracker.update(6, 1)).toBe(6);
  });
});
