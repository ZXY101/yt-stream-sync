// Scores the live sync on the bench scenarios (src/test/live-bench.ts) and prints them next
// to the baseline. `--update` writes the new scores as the baseline: do that only for a
// deliberate improvement, and say why in the commit.
import { readFileSync, writeFileSync } from "node:fs";

import { SCENARIOS, runScenario } from "../src/test/live-bench.ts";

const BASELINE = new URL("../src/controller/live/bench-baseline.json", import.meta.url);

function round(scores) {
  return Object.fromEntries(
    Object.entries(scores).map(([key, value]) => [key, Math.round(value * 100) / 100]),
  );
}

const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
const results = Object.fromEntries(SCENARIOS.map((s) => [s.name, round(runScenario(s))]));
const keys = Object.keys(Object.values(results)[0] ?? {});
const width = Math.max(...Object.keys(results).map((name) => name.length));
const lines = [
  "now (baseline), lower is better",
  ["scenario".padEnd(width), ...keys.map((key) => key.padEnd(Math.max(key.length, 13)))].join("  "),
];
for (const [name, now] of Object.entries(results)) {
  const before = baseline[name] ?? {};
  const cells = keys.map((key) =>
    `${now[key]} (${before[key] ?? "-"})`.padEnd(Math.max(key.length, 13)),
  );
  lines.push([name.padEnd(width), ...cells].join("  "));
}
if (process.argv.includes("--update")) {
  writeFileSync(BASELINE, `${JSON.stringify(results, null, 2)}\n`);
  lines.push("baseline updated");
}
process.stdout.write(`${lines.join("\n")}\n`);
