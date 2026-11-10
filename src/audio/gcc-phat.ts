import { fft, nextPowerOfTwo } from "./fft.ts";

export interface Match {
  /** Seconds `b` lags behind `a`: b(t) ≈ a(t − lag). Negative: `b` is ahead. */
  lag: number;
  /** How far the peak stands out from the rest (standard deviations). */
  confidence: number;
}

function spectrum(signal: Float32Array, size: number) {
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  re.set(signal);
  fft(re, im);
  return { re, im };
}

/** Cross-spectrum of a and b, whitened (PHAT) so every frequency counts the same. */
function whitenedCorrelation(a: Float32Array, b: Float32Array): Float64Array {
  const size = nextPowerOfTwo(a.length + b.length);
  const fa = spectrum(a, size);
  const fb = spectrum(b, size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  for (let k = 0; k < size; k += 1) {
    // conj(A) · B: peaks at the lag by which b trails a.
    const r =
      (fa.re[k] as number) * (fb.re[k] as number) + (fa.im[k] as number) * (fb.im[k] as number);
    const i =
      (fa.re[k] as number) * (fb.im[k] as number) - (fa.im[k] as number) * (fb.re[k] as number);
    const magnitude = Math.hypot(r, i) || 1;
    re[k] = r / magnitude;
    im[k] = i / magnitude;
  }
  fft(re, im, true);
  return re;
}

/** Correlation values for lags −maxLag…maxLag samples, in that order. */
function lagWindow(correlation: Float64Array, maxLag: number): Float64Array {
  const size = correlation.length;
  const window = new Float64Array(2 * maxLag + 1);
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    window[lag + maxLag] = correlation[(lag + size) % size] as number;
  }
  return window;
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

function standardScore(values: Float64Array, index: number): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return ((values[index] as number) - mean) / (Math.sqrt(variance) || 1);
}

/**
 * Finds the delay between two recordings of the same sound (GCC-PHAT). Both must start at
 * the same moment and have the same sample rate. Only lags up to `maxLagSeconds` are tried.
 */
export function gccPhat(
  a: Float32Array,
  b: Float32Array,
  sampleRate: number,
  maxLagSeconds: number,
): Match {
  const maxLag = Math.min(Math.round(maxLagSeconds * sampleRate), a.length - 1);
  const window = lagWindow(whitenedCorrelation(a, b), maxLag);
  const index = peakIndex(window);
  const lag = (refine(window, index) - maxLag) / sampleRate;
  return { lag, confidence: standardScore(window, index) };
}
