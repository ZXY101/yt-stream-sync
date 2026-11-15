import { fft, nextPowerOfTwo } from "./fft.ts";

export interface Match {
  /** Seconds `b` lags behind `a`: b(t) ≈ a(t − lag). Negative: `b` is ahead. */
  lag: number;
  /** How far the peak stands out from the rest (standard deviations). */
  confidence: number;
  /** Peak height over the best peak elsewhere (more than 50 ms away): above 1 is unique. */
  uniqueness: number;
}

/**
 * Cross-correlation of a and b, whitened (PHAT) so every frequency counts the same. Both are
 * real, so one complex FFT of a + i·b gives both spectra (A and B are its even and odd parts
 * under k ↔ n − k): two transforms per window instead of three.
 */
function whitenedCorrelation(a: Float32Array, b: Float32Array): Float64Array {
  const size = nextPowerOfTwo(a.length + b.length);
  const zr = new Float64Array(size);
  const zi = new Float64Array(size);
  zr.set(a);
  zi.set(b);
  fft(zr, zi);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let k = 0; k < size; k += 1) {
    const mirror = (size - k) % size;
    const zrk = zr[k] as number;
    const zik = zi[k] as number;
    const zrm = zr[mirror] as number;
    const zim = zi[mirror] as number;
    const ar = (zrk + zrm) / 2;
    const ai = (zik - zim) / 2;
    const br = (zik + zim) / 2;
    const bi = (zrm - zrk) / 2;
    // conj(A) · B: peaks at the lag by which b trails a.
    const r = ar * br + ai * bi;
    const i = ar * bi - ai * br;
    const magnitude = Math.sqrt(r * r + i * i) || 1;
    re[k] = r / magnitude;
    im[k] = i / magnitude;
  }
  fft(re, im, true);
  return re;
}

/**
 * Correlation for lags −maxLag…maxLag samples, standardised (mean 0, deviation 1). `b` may
 * start `offset` samples after `a` (negative: before); lags are relative to `a`'s start.
 */
function standardCurve(a: Float32Array, b: Float32Array, maxLag: number, offset = 0) {
  const correlation = whitenedCorrelation(a, b);
  const size = correlation.length;
  const curve = new Float64Array(2 * maxLag + 1);
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    curve[lag + maxLag] = correlation[(((lag - offset) % size) + size) % size] as number;
  }
  const mean = curve.reduce((sum, value) => sum + value, 0) / curve.length;
  const variance = curve.reduce((sum, value) => sum + (value - mean) ** 2, 0) / curve.length;
  const deviation = Math.sqrt(variance) || 1;
  return curve.map((value) => (value - mean) / deviation);
}

function peakIndex(values: Float64Array): number {
  let best = 0;
  for (let index = 1; index < values.length; index += 1) {
    if ((values[index] as number) > (values[best] as number)) {
      best = index;
    }
  }
  return best;
}

/** Sub-sample peak position from the two neighbours (parabolic fit). */
function refine(values: Float64Array, index: number): number {
  const left = values[index - 1];
  const right = values[index + 1];
  const centre = values[index] as number;
  if (left === undefined || right === undefined) {
    return index;
  }
  const curve = left - 2 * centre + right;
  return curve === 0 ? index : index + (0.5 * (left - right)) / curve;
}

function runnerUp(values: Float64Array, peak: number, guard: number): number {
  let best = Number.NEGATIVE_INFINITY;
  values.forEach((value, index) => {
    if (Math.abs(index - peak) > guard && value > best) {
      best = value;
    }
  });
  return best;
}

export interface Windows {
  /** Seconds per window. */
  window: number;
  /** Seconds between window starts. */
  hop: number;
}

/**
 * Where each window starts, spread evenly so the last one ends at the clip's end: a clip a
 * few milliseconds short of a whole number of hops must not lose its last window.
 */
function windowStarts(length: number, sampleRate: number, windows: Windows | undefined): number[] {
  const windowLength = Math.min(length, Math.round((windows?.window ?? Infinity) * sampleRate));
  const room = length - windowLength;
  const hop = (windows?.hop ?? 1) * sampleRate;
  const count = Math.ceil(room / hop) + 1;
  return Array.from({ length: count }, (_value, index) =>
    count === 1 ? 0 : Math.round((room * index) / (count - 1)),
  );
}

/**
 * Finds the delay between two recordings of the same event (GCC-PHAT), both starting at the
 * same moment. Shared sound in collab streams comes and goes (each streamer's own voice
 * dominates their mix), so the clip is cut into overlapping windows whose standardised
 * correlation curves are summed: the true lag lines up in all of them, chance peaks don't.
 */
export function gccPhat(
  a: Float32Array,
  b: Float32Array,
  options: { sampleRate: number; maxLagSeconds: number; windows?: Windows },
): Match {
  const { sampleRate, maxLagSeconds } = options;
  const starts = windowStarts(a.length, sampleRate, options.windows);
  const windowLength = a.length - (starts.at(-1) ?? 0);
  const maxLag = Math.min(Math.round(maxLagSeconds * sampleRate), b.length - 1);
  const sum = new Float64Array(2 * maxLag + 1);
  for (const start of starts) {
    // Each window of `a` is compared with `b` from maxLag earlier to maxLag later, so even a
    // lag longer than the window has the whole window to match on.
    const from = Math.max(0, start - maxLag);
    const to = Math.min(b.length, start + windowLength + maxLag);
    const window = a.subarray(start, start + windowLength);
    const curve = standardCurve(window, b.subarray(from, to), maxLag, from - start);
    for (let index = 0; index < sum.length; index += 1) {
      sum[index] = (sum[index] as number) + (curve[index] as number);
    }
  }
  const combined = sum.map((value) => value / Math.sqrt(starts.length));
  const index = peakIndex(combined);
  const peak = combined[index] as number;
  const second = runnerUp(combined, index, Math.round(0.05 * sampleRate));
  const lag = (refine(combined, index) - maxLag) / sampleRate;
  return {
    lag,
    confidence: peak,
    uniqueness: second > 0 ? peak / second : Number.POSITIVE_INFINITY,
  };
}
