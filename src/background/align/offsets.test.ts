import { describe, expect, it } from "vitest";

import { alignedOffsets, watchUrl, type AlignMember } from "./offsets.ts";

// The real pair this was built for: Tsuzuri went live 99 s before Kyoko, and yt-dlp-z found
// Kyoko's content 31.17 s later; the user had to set Kyoko about 2 minutes ahead by hand.
const tsuzuri: AlignMember = { id: "1:0", url: "u-tsuzuri", startTime: 1794227484, offset: 0 };
const kyoko: AlignMember = { id: "2:0", url: "u-kyoko", startTime: 1794227583, offset: 0 };

describe("alignedOffsets", () => {
  it("turns content lags into broadcast-time offsets", () => {
    const { targets, unmatched } = alignedOffsets([tsuzuri, kyoko], {
      "u-tsuzuri": 0,
      "u-kyoko": 31.17,
    });
    expect(targets["2:0"]).toBeCloseTo(130.17, 6);
    expect(targets).not.toHaveProperty("1:0");
    expect(unmatched).toEqual([]);
  });

  it("keeps the reference's own offset", () => {
    const reference = { ...tsuzuri, offset: 5 };
    const { targets } = alignedOffsets([reference, kyoko], { "u-kyoko": 31.17 });
    expect(targets["2:0"]).toBeCloseTo(135.17, 6);
  });

  it("works the other way round", () => {
    const { targets } = alignedOffsets([kyoko, tsuzuri], { "u-tsuzuri": -31.17 });
    expect(targets["1:0"]).toBeCloseTo(-130.17, 6);
  });

  it("lists members without an offset as unmatched", () => {
    const third: AlignMember = { id: "3:0", url: "u-third", startTime: 1794227000, offset: 0 };
    const { targets, unmatched } = alignedOffsets([tsuzuri, kyoko, third], {
      "u-kyoko": null,
    });
    expect(targets).toEqual({});
    expect(unmatched).toEqual(["2:0", "3:0"]);
  });

  it("has nothing to do without members", () => {
    expect(alignedOffsets([], {})).toEqual({ targets: {}, unmatched: [] });
  });
});

describe("watchUrl", () => {
  it("builds a watch page link and escapes the id", () => {
    expect(watchUrl("Vh-YGhqy_Mo")).toBe("https://www.youtube.com/watch?v=Vh-YGhqy_Mo");
    expect(watchUrl("a&b")).toBe("https://www.youtube.com/watch?v=a%26b");
  });
});
