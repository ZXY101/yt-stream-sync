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
});
