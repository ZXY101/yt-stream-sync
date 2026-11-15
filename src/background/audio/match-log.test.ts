import { describeAsk, describeMatch } from "./match-log.ts";

describe("match log", () => {
  it("says who was asked for audio", () => {
    expect(describeAsk(["17:0", "22:0"], "17:0", 30)).toBe(
      "audio: asked 17:0, 22:0 for 30 s of audio (reference 17:0)",
    );
  });

  it("gives every comparison's scores against what they need, then the outcome", () => {
    const lines = describeMatch({
      lags: { "22:0": 0.31 },
      unmatched: ["21:0"],
      attempts: [
        { id: "22:0", anchor: "17:0", lag: 0.31, confidence: 24.2, uniqueness: 2.1, ok: true },
        { id: "21:0", anchor: "17:0", lag: -3.04, confidence: 7.5, uniqueness: 1.05, ok: false },
        { id: "21:0", anchor: "22:0", lag: 6.2, confidence: 6.1, uniqueness: 1.1, ok: false },
      ],
    });

    expect(lines).toEqual([
      "audio: 22:0 vs 17:0: lag 0.31 s, confidence 24.2 (needs 12), uniqueness 2.10 (needs 1.3) → match",
      "audio: 21:0 vs 17:0: lag -3.04 s, confidence 7.5 (needs 12), uniqueness 1.05 (needs 1.3) → no match",
      "audio: 21:0 vs 22:0: lag 6.20 s, confidence 6.1 (needs 12), uniqueness 1.10 (needs 1.3) → no match",
      "audio: matched 22:0; unmatched 21:0",
    ]);
  });

  it("says when there wasn't enough audio to compare", () => {
    expect(describeMatch({ lags: {}, unmatched: ["22:0"], tooShort: true })).toEqual([
      "audio: not enough audio to compare (22:0 unmatched)",
    ]);
  });
});
