import type { Range } from "./reach.ts";

const STEP = 0.1;
const MAX_CANDIDATES = 3000;
const TIE = 0.05;
// Stay this far inside the limits where there's room: they're learned, so only roughly known.
const EDGE_MARGIN = 0.5;
const OUTLIER_MARGIN = 0.2;
// Readings jitter by about 0.1 s: the aim doesn't move for a gain this small.
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

/** The run of equally good aims around `index`, as the indexes [first, last]. */
function runAround(good: boolean[], index: number): [number, number] {
  let first = index;
  let last = index;
  while (first > 0 && good[first - 1]) {
    first -= 1;
  }
  while (last < good.length - 1 && good[last + 1]) {
    last += 1;
  }
  return [first, last];
}

function bestOf(scores: Score[]): number {
  let best = 0;
  scores.forEach((candidate, index) => {
    if (better(candidate, scores[best] as Score)) {
      best = index;
    }
  });
  return best;
}

/** The index of the cheapest aim from `first` to `last`. */
function cheapestIn(scores: Score[], first: number, last: number): number {
  let cheapest = first;
  for (let index = first + 1; index <= last; index += 1) {
    if ((scores[index] as Score).cost < (scores[cheapest] as Score).cost - TIE) {
      cheapest = index;
    }
  }
  return cheapest;
}

/** The index of the good aim nearest `value`, or `fallback` when the nearest isn't good. */
function nearestGood(aims: number[], good: boolean[], value: number, fallback: number): number {
  let nearest = 0;
  aims.forEach((aim, index) => {
    if (Math.abs(aim - value) < Math.abs((aims[nearest] ?? 0) - value)) {
      nearest = index;
    }
  });
  return good[nearest] ? nearest : fallback;
}

function median(values: readonly number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[middle] ?? 0)
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

interface Field {
  aims: number[];
  scores: Score[];
  lags: readonly number[];
  /** Every stream's range holds the aims of the run. */
  allIn: boolean;
}

/** Where to aim inside the run of aims from index `first` to `last`. */
function targetIn(field: Field, first: number, last: number): number {
  const { aims, scores, lags, allIn } = field;
  const wanted = allIn ? median(lags) : (aims[cheapestIn(scores, first, last)] ?? 0);
  // With an outlier only a little margin: the limits already keep `learnedMargin` from where
  // YouTube moved a stream.
  const low = aims[first] ?? 0;
  const high = aims[last] ?? 0;
  const margin = Math.min(allIn ? EDGE_MARGIN : OUTLIER_MARGIN, (high - low) / 2);
  return Math.min(high - margin, Math.max(low + margin, wanted));
}

/**
 * The lag to line a group up at: inside as many streams' ranges as possible, then as close as
 * possible to the rest (which picks the run of aims). With every stream inside, the aim
 * nearest where they already are (their median lag), kept `EDGE_MARGIN` inside the limits.
 * With an outlier, the cheapest aim of the run, so the group leans toward it.
 *
 * Moving the aim moves every stream, so `previous` is kept while every stream is inside, and
 * otherwise the aim stays in the run `previous` is in while that serves as many streams as
 * any. Switching runs for a slightly lower cost made a real group flap: the limits depend on
 * the buffers, which the move itself changes, so the other run looked better again.
 */
export function chooseAim(
  ranges: readonly Range[],
  lags: readonly number[],
  previous?: number,
): number {
  const aims = candidates(ranges);
  const scores = aims.map((aim) => score(ranges, aim));
  const bestIndex = bestOf(scores);
  const most = (scores[bestIndex] as Score).inside;
  const allIn = most === ranges.length;
  const kept = previous !== undefined && score(ranges, previous).inside === most;
  if (kept && allIn) {
    return previous;
  }
  const good = scores.map((candidate) => candidate.inside === most);
  const anchor = kept ? nearestGood(aims, good, previous, bestIndex) : bestIndex;
  const [first, last] = runAround(good, anchor);
  const target = targetIn({ aims, scores, lags, allIn }, first, last);
  return kept && Math.abs(target - previous) <= KEEP_SLACK ? previous : target;
}
