import { chooseAim } from "./aim.ts";

describe("chooseAim", () => {
  it("aims where most streams already are, inside every range", () => {
    const ranges = [
      { low: 5.4, high: 10 },
      { low: 3.8, high: 10.6 },
      { low: 4.4, high: 20.4 },
    ];

    expect(chooseAim(ranges, [8, 8.6, 18.4])).toBeCloseTo(8.6, 5);
  });

  it("keeps clear of the limits where there's room", () => {
    const ranges = [
      { low: 5, high: 10 },
      { low: 5, high: 10 },
    ];

    expect(chooseAim(ranges, [10, 12])).toBeCloseTo(9.5, 5);
  });

  it("keeps the last aim while it is still inside as many ranges", () => {
    const ranges = [
      { low: 5, high: 10 },
      { low: 5, high: 10 },
    ];

    expect(chooseAim(ranges, [8, 8], 6)).toBe(6);
  });

  it("serves the most streams, leaning toward an outlier it leaves out", () => {
    const ranges = [
      { low: 5, high: 10 },
      { low: 4, high: 11 },
      { low: 16, high: 21 },
    ];

    const aim = chooseAim(ranges, [8, 8.6, 19]);

    // Inside the two that overlap, as close to the third as their limits allow (less 0.2 s).
    expect(aim).toBeCloseTo(9.8, 5);
  });

  it("picks the run of aims nearest the outliers when two runs serve as many", () => {
    const ranges = [
      { low: 2, high: 3 },
      { low: 10, high: 11 },
      { low: 12, high: 20 },
    ];

    // 10–11 and 12–20 each hold one stream; 10–11 is closest to the other two together.
    expect(chooseAim(ranges, [2.5, 10.5, 15])).toBeGreaterThanOrEqual(10);
  });

  // Real (2026-11-15): an ultra-low-latency stream (at most 4.5 s), one that won't come closer
  // than 6.3 s, and one that can sit with either. Both pairings leave one stream 1.8 s out.
  const eitherWay = [
    { low: 3.1, high: 4.5 },
    { low: 3.7, high: 8.8 },
    { low: 6.3, high: 9.4 },
  ];

  it("stays with the streams it already serves when another pairing is only a little better", () => {
    // It used to jump to the other pairing (4.3), yanking the middle stream back and forth.
    expect(chooseAim(eitherWay, [4.5, 6.8, 6.9], 6.85)).toBeCloseTo(6.5, 5);
  });

  it("doesn't move the aim for a gain smaller than the streams' jitter", () => {
    expect(chooseAim(eitherWay, [4.5, 6.5, 6.6], 6.6)).toBe(6.6);
  });
});
