import { createUserActionTracker } from "./user-actions.ts";

describe("user action tracker", () => {
  it("counts media events the user caused", () => {
    const tracker = createUserActionTracker(() => 0);

    expect(tracker.observe("seeked")).toBe(true);
    expect(tracker.observe("pause")).toBe(true);
    expect(tracker.count()).toBe(2);
  });

  it("leaves out the event each of our own commands causes, once", () => {
    const tracker = createUserActionTracker(() => 0);
    tracker.expectFrom({ type: "setRate", rate: 1.05 });

    expect(tracker.observe("ratechange")).toBe(false);
    expect(tracker.observe("ratechange")).toBe(true);
  });

  it("forgets an expected event that never came", () => {
    let clock = 0;
    const tracker = createUserActionTracker(() => clock);
    tracker.expectFrom({ type: "play" });
    clock = 10;

    expect(tracker.observe("play")).toBe(true);
  });
});
