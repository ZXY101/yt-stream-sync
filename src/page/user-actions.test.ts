import { createUserActionTracker } from "./user-actions.ts";

describe("user action tracker", () => {
  it("counts media events the user caused", () => {
    const tracker = createUserActionTracker(() => 0);

    expect(tracker.observe("seeked")).toBe(true);
    expect(tracker.observe("pause")).toBe(true);
    expect(tracker.count()).toBe(2);
  });

  it("leaves out the event each of our own commands causes, once, even when it comes late", () => {
    let clock = 0;
    const tracker = createUserActionTracker(() => clock);
    tracker.expectFrom({ type: "seek", position: 10 });

    // A seek on a slow connection reports `seeked` only once it has buffered.
    clock = 2.5;
    expect(tracker.observe("seeked")).toBe(false);
    expect(tracker.observe("seeked")).toBe(true);
  });

  it("forgets an expected event that never came", () => {
    let clock = 0;
    const tracker = createUserActionTracker(() => clock);
    tracker.expectFrom({ type: "play" });
    clock = 10;

    expect(tracker.observe("play")).toBe(true);
  });

  it("ignores pauses and plays shortly after one of our own commands", () => {
    let clock = 0;
    const tracker = createUserActionTracker(() => clock);
    tracker.expectFrom({ type: "seek", position: 30 });

    // Real YouTube can fire more than the one event a command causes, e.g. a pause/play
    // around a seek.
    clock = 0.4;
    expect(tracker.observe("seeked")).toBe(false);
    expect(tracker.observe("pause")).toBe(false);
    clock = 1;
    expect(tracker.observe("play")).toBe(false);
    // A seek of the user's still counts, even this soon.
    expect(tracker.observe("seeked")).toBe(true);

    clock = 2;
    expect(tracker.observe("pause")).toBe(true);
  });
});
