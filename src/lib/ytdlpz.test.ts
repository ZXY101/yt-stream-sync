import { describe, expect, it } from "vitest";

import { normalizeAddress, originPattern, readYtdlpzSettings } from "./ytdlpz.ts";

describe("readYtdlpzSettings", () => {
  it("reads settings in the stored shape", () => {
    const stored = { enabled: true, address: "https://server.test", token: "fake-token" };
    expect(readYtdlpzSettings(stored)).toEqual(stored);
  });

  it.each([undefined, null, "text", { enabled: "yes", address: "a", token: "b" }, {}])(
    "ignores anything else (%j)",
    (value) => {
      expect(readYtdlpzSettings(value)).toBeUndefined();
    },
  );

  it("ignores absurdly long values", () => {
    expect(readYtdlpzSettings({ enabled: true, address: "a".repeat(3000), token: "b" })).toBe(
      undefined,
    );
  });
});

describe("normalizeAddress", () => {
  it.each([
    ["server.test:9742", "http://server.test:9742"],
    ["  https://server.test/ ", "https://server.test"],
    ["https://proxy.test/ytdlpz//", "https://proxy.test/ytdlpz"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeAddress(input)).toBe(expected);
  });

  it("rejects what isn't an address", () => {
    expect(() => normalizeAddress("http://")).toThrow("Invalid URL");
  });
});

describe("originPattern", () => {
  it("asks for this host only, any port", () => {
    expect(originPattern("https://server.test:9744/sub")).toBe("https://server.test/*");
  });
});
