import type { Range } from "./reach.ts";

const STEP = 0.1;
const MAX_CANDIDATES = 3000;
const TIE = 0.05;
// Stay this far inside the limits where there's room: they're learned, so only roughly known.
const EDGE_MARGIN = 0.5;
const OUTLIER_MARGIN = 0.2;
const KEEP_SLACK = 0.25;

interface Score {
  inside: number;
  cost: number;
}

function score(ranges: readonly Range[], aim: number): Score {
  let inside = 0;
  let cost = 0;
  for (const { low, high } of ranges) {
    const off = Math.max(0, low - aim, aim - high);
    inside += off === 0 ? 1 : 0;
    cost += off;
  }
  return { inside, cost };
}

function better(a: Score, b: Score): boolean {
  return a.inside > b.inside || (a.inside === b.inside && a.cost < b.cost - TIE);
}

function candidates(ranges: readonly Range[]): number[] {
  const bottom = Math.min(...ranges.map((range) => range.low));
  const tops = ranges.map((range) => (Number.isFinite(range.high) ? range.high : range.low));
  const top = Math.max(bottom, ...tops);
  const count = Math.min(MAX_CANDIDATES, Math.floor((top - bottom) / STEP) + 1);
  return Array.from({ length: count }, (_, index) => bottom + index * STEP);
}

/** The run of equally good aims around `index`, as [first, last]. */
function runAround(aims: number[], good: boolean[], index: number): [number, number] {
  let first = index;
  let last = index;
  while (first > 0 && good[first - 1]) {
    first -= 1;
  }
  while (last < aims.length - 1 && good[last + 1]) {
    last += 1;
  }
  return [aims[first] ?? 0, aims[last] ?? 0];
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

/**
 * The lag to line a group up at: inside as many streams' ranges as possible, then as close as
 * possible to the rest (which picks the run of aims). Inside that run, the aim nearest where the
 * streams already are (their median lag), kept `EDGE_MARGIN` inside the limits where there's
 * room, so the fewest streams move. Keeps `previous` while it's inside as many ranges: moving
 * the aim moves every stream.
 */
export function chooseAim(
  ranges: readonly Range[],
  lags: readonly number[],
  previous?: number,
): number {
  const aims = candidates(ranges);
  const scores = aims.map((aim) => score(ranges, aim));
  let bestIndex = 0;
  scores.forEach((candidate, index) => {
    if (better(candidate, scores[bestIndex] as Score)) {
      bestIndex = index;
    }
  });
  const best = scores[bestIndex] as Score;
  if (previous !== undefined) {
    const kept = score(ranges, previous);
    // With an outlier the aim follows the cheapest spot, so it leans toward it as limits move.
    const allIn = best.inside === ranges.length;
    if (kept.inside === best.inside && (allIn || kept.cost <= best.cost + KEEP_SLACK)) {
      return previous;
    }
  }
  // The outliers' cost only picks which run: inside it, closeness to the streams decides.
  const good = scores.map((s) => s.inside === best.inside);
  const [first, last] = runAround(aims, good, bestIndex);
  // With an outlier, lean toward it (the cheapest aim): only a little margin, the limits
  // already keep `learnedMargin` from where YouTube moved a stream.
  const outlier = best.inside < ranges.length;
  const margin = Math.min(outlier ? OUTLIER_MARGIN : EDGE_MARGIN, (last - first) / 2);
  const wanted = outlier ? (aims[bestIndex] ?? 0) : median(lags);
  return Math.min(last - margin, Math.max(first + margin, wanted));
}
