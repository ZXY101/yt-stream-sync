import { learnReach, probeRoom, reachRange } from "./reach.ts";
import { DEFAULT_TUNING } from "./tuning.ts";
import type { PlayerSample, Reach } from "./types.ts";

function sample(overrides: Partial<PlayerSample> = {}): PlayerSample {
  const base = { id: "a", latency: 8, bufferAhead: 5, state: "playing" as const, playbackRate: 1 };
  return { ...base, noRewind: true, ...overrides };
}

describe("learnReach", () => {
  it("starts where the stream is", () => {
    expect(learnReach(undefined, sample(), DEFAULT_TUNING)).toEqual({ home: 8, last: 8 });
  });

  it("learns a floor when YouTube puts the stream further back (real: 6.8 → 19.1 s)", () => {
    const reach = learnReach({ home: 18.4, last: 6.8 }, sample({ latency: 19.1 }), DEFAULT_TUNING);

    expect(reach).toEqual({ home: 19.1, last: 19.1, floor: 7.3, forgetIn: 300, pressedFor: 0 });
  });

  it("learns a ceiling when YouTube pulls a playing stream toward live (real: 15 → 9 s)", () => {
    const reach = learnReach({ home: 8.6, last: 15 }, sample({ latency: 9 }), DEFAULT_TUNING);

    expect(reach).toEqual({ home: 9, last: 9, ceiling: 14.5, forgetIn: 300, pressedFor: 0 });
  });

  it("ignores small drift, and eases what it learned after a while", () => {
    let reach: Reach = { home: 19.1, last: 19.1, floor: 7.8, forgetIn: 2 };
    reach = learnReach(reach, sample({ latency: 19.2 }), DEFAULT_TUNING);
    expect(reach).toMatchObject({ floor: 7.8, forgetIn: 1, last: 19.2 });

    reach = learnReach(reach, sample({ latency: 19.3 }), DEFAULT_TUNING);
    expect(reach).toEqual({ home: 19.1, last: 19.3, floor: 7.3, forgetIn: 300 });
  });
});

describe("judging a jump ahead", () => {
  // Real: Riona at 9.9 s was jumped 0.66 s ahead and drifted back to 9.6 s within seconds.
  const jumped = { home: 18.4, last: 9.24, jump: { from: 9.9, to: 9.24, judgeIn: 2 } };

  it("learns a floor just past the aim when the stream drifts back", () => {
    let reach = learnReach(jumped, sample({ latency: 9.5 }), DEFAULT_TUNING);
    expect(reach.jump?.judgeIn).toBe(1);

    reach = learnReach(reach, sample({ latency: 9.6 }), DEFAULT_TUNING);

    expect(reach.jump).toBeUndefined();
    expect(reach.floor).toBeCloseTo(9.74, 5);
    expect(reach.forgetIn).toBe(300);
  });

  it("learns nothing when the jump held", () => {
    let reach = learnReach(jumped, sample({ latency: 9.3 }), DEFAULT_TUNING);
    reach = learnReach(reach, sample({ latency: 9.3 }), DEFAULT_TUNING);

    expect(reach).toEqual({ home: 18.4, last: 9.3 });
  });
});

describe("reachRange", () => {
  it("reaches ahead as its buffer allows and back a little past home", () => {
    const range = reachRange(
      sample({ latency: 18.4, bufferAhead: 17 }),
      { home: 18.4, last: 18.4 },
      DEFAULT_TUNING,
    );

    expect(range.low).toBeCloseTo(4.4, 5);
    expect(range.high).toBeCloseTo(20.4, 5);
  });

  it("stays inside learned limits, and never has a range below its low end", () => {
    const reach = { home: 8.6, last: 8.6, floor: 6, ceiling: 5 };

    expect(reachRange(sample({ latency: 8.6, bufferAhead: 7.8 }), reach, DEFAULT_TUNING)).toEqual({
      low: 6,
      high: 6,
    });
  });
});

describe("probeRoom", () => {
  it("gives a stream held at its back limit a second more room after a while", () => {
    let reach: Reach = { home: 8, last: 10 };
    for (let steps = 0; steps < 29; steps++) {
      reach = probeRoom(reach, true, DEFAULT_TUNING);
    }
    expect(reach).toEqual({ home: 8, last: 10, pressedFor: 29 });

    expect(probeRoom(reach, true, DEFAULT_TUNING)).toEqual({ home: 9, last: 10, pressedFor: 0 });
  });

  it("starts over when it's no longer pressed, and never probes past a ceiling YouTube showed", () => {
    expect(probeRoom({ home: 8, last: 10, pressedFor: 12 }, false, DEFAULT_TUNING)).toEqual({
      home: 8,
      last: 10,
      pressedFor: 0,
    });
    const capped = { home: 8, last: 9.5, ceiling: 9.5, pressedFor: 29 };
    expect(probeRoom(capped, true, DEFAULT_TUNING)).toEqual({ ...capped, pressedFor: 0 });
  });
});
