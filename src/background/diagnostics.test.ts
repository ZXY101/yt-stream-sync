import type { LiveReport } from "../lib/messages.ts";
import { createDebugLog } from "./debug-log.ts";
import { createDiagnostics } from "./diagnostics.ts";

function live(overrides: Partial<LiveReport> = {}): LiveReport {
  return {
    kind: "live",
    latency: 8.6,
    bufferAhead: 2,
    state: "playing",
    playbackRate: 1,
    title: "Stream",
    channel: "Channel",
    videoId: "k-fiYPedgwA",
    ...overrides,
  };
}

function setup() {
  const log = createDebugLog(() => 0);
  return { log, diagnostics: createDiagnostics(() => 0, log) };
}

describe("diagnostics", () => {
  it("logs a stream joining the group with its link, latency class and rewind", () => {
    const { log, diagnostics } = setup();
    const report = live({
      latencyClass: "MDE_STREAM_OPTIMIZATIONS_RENDERER_LATENCY_LOW",
      noRewind: true,
    });

    diagnostics.afterTick({ state: "waiting" }, [["1:0", report]], ["1:0"]);

    expect(log.text()).toContain(
      'joined group: 1:0 live https://www.youtube.com/watch?v=k-fiYPedgwA "Stream" by Channel (latency class LOW, rewind off)',
    );
  });

  it("logs each join once, and a stream leaving", () => {
    const { log, diagnostics } = setup();
    const reports: [string, LiveReport][] = [["1:0", live()]];

    diagnostics.afterTick({ state: "waiting" }, reports, ["1:0"]);
    diagnostics.afterTick({ state: "waiting" }, reports, ["1:0"]);
    diagnostics.afterTick({ state: "waiting" }, reports, []);

    expect(log.text().match(/joined group/g)).toHaveLength(1);
    expect(log.text()).toContain("left group: 1:0");
  });

  it("waits for a report before logging a join", () => {
    const { log, diagnostics } = setup();

    diagnostics.afterTick({ state: "waiting" }, [], ["1:0"]);
    diagnostics.afterTick({ state: "waiting" }, [["1:0", live()]], ["1:0"]);

    expect(log.text().match(/joined group/g)).toHaveLength(1);
  });

  it("logs how far each grouped stream is from the group's spot, and how long it's been steady", () => {
    // The players line is written every 5 s, so this clock is past the first one.
    const log = createDebugLog(() => 0);
    const diagnostics = createDiagnostics(() => 10, log);
    const reports: [string, LiveReport][] = [
      ["1:0", live()],
      ["2:0", live({ latency: 4.5 })],
      ["3:0", live()],
    ];

    diagnostics.afterTick({ state: "waiting" }, reports, ["1:0", "2:0"], {
      errors: { "1:0": -0.04, "2:0": 2.04 },
      stuck: ["2:0"],
      steady: { "1:0": 31, "2:0": 0 },
    });

    const line = log
      .text()
      .split("\n")
      .find((text) => text.includes("players:"));
    expect(line).toContain(
      "1:0 playing latency 8.6 buffer 2.0 x1.00 loudest 0.000 in sync steady 31 s",
    );
    expect(line).toContain(
      "2:0 playing latency 4.5 buffer 2.0 x1.00 loudest 0.000 2.0 s ahead stuck steady 0 s",
    );
    // A stream outside the group has no place in it.
    expect(line).toMatch(/3:0 playing latency 8\.6 buffer 2\.0 x1\.00 loudest 0\.000$/);
  });
});
