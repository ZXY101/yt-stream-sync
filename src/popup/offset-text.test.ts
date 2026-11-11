import { offsetToText, textToOffset } from "./offset-text.ts";

describe("offsetToText", () => {
  it.each([
    [0, "+0.0"],
    [0.3, "+0.3"],
    [-4.06, "-4.1"],
    [59.96, "+1:00.0"],
    [-125.3, "-2:05.3"],
    [3723, "+62:03.0"],
  ])("%d → %s", (seconds, text) => {
    expect(offsetToText(seconds)).toBe(text);
  });
});

describe("textToOffset", () => {
  it.each([
    ["4", 4],
    ["+4 s", 4],
    ["-125.3", -125.3],
    ["−2:05.3", -125.3],
    ["2:05", 125],
    ["1:02:03", 3723],
    [".5", 0.5],
    ["", undefined],
    ["-", undefined],
    ["abc", undefined],
    ["1:2:3:4", undefined],
  ])("%j → %s", (text, seconds) => {
    expect(textToOffset(text)).toBe(seconds);
  });
});
