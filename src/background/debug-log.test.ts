import { createDebugLog } from "./debug-log.ts";

describe("debug log", () => {
  it("keeps the newest 300 lines with their time", () => {
    let clock = Date.parse("2026-11-11T10:00:00.000Z");
    const log = createDebugLog(() => clock);

    for (let index = 0; index < 305; index += 1) {
      clock += 1;
      log.add(`line ${index}`);
    }

    const lines = log.text().split("\n");
    expect(lines).toHaveLength(300);
    expect(lines[0]).toBe("10:00:00.006 line 5");
    expect(lines.at(-1)).toBe("10:00:00.305 line 304");
  });
});
