import { SCENARIOS, type Scores, runScenario } from "../../test/live-bench.ts";
import baseline from "./bench-baseline.json";

// The baseline holds the scores v0.1.2's live sync got, the version that synced real collabs
// best so far. A change may beat them but must not do worse. `npm run bench` shows both;
// after a deliberate improvement, `npm run bench -- --update` and say why in the commit.

// Room for tiny differences (rounding, a step earlier or later).
const SLACK: Scores = { spread: 0.1, worstSpread: 0.2, settleTime: 5, moves: 2, stalls: 2 };
const BEFORE: Record<string, Scores> = baseline;

describe("live sync bench (no worse than the baseline)", () => {
  it.each(SCENARIOS)("$name", (scenario) => {
    const now = runScenario(scenario);
    const before = BEFORE[scenario.name];
    expect(before, "no baseline: run `npm run bench -- --update`").toBeDefined();
    for (const key of Object.keys(SLACK) as (keyof Scores)[]) {
      const limit = (before as Scores)[key] + SLACK[key];
      expect(now[key], `${key} (baseline ${(before as Scores)[key]})`).toBeLessThanOrEqual(limit);
    }
  });
});
