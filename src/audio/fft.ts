/**
 * In-place radix-2 FFT. `re` and `im` must have the same power-of-two length.
 * `inverse` computes the inverse transform, scaled by 1/n.
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  reorder(re, im);
  for (let size = 2; size <= n; size *= 2) {
    const angle = ((inverse ? 2 : -2) * Math.PI) / size;
    butterflies(re, im, size, angle);
  }
  if (inverse) {
    for (let index = 0; index < n; index += 1) {
      re[index] = (re[index] as number) / n;
      im[index] = (im[index] as number) / n;
    }
  }
}

/** Bit-reversal permutation. */
function reorder(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let index = 1, swap = 0; index < n; index += 1) {
    let bit = n >> 1;
    for (; swap & bit; bit >>= 1) {
      swap ^= bit;
    }
    swap ^= bit;
    if (index < swap) {
      [re[index], re[swap]] = [re[swap] as number, re[index] as number];
      [im[index], im[swap]] = [im[swap] as number, im[index] as number];
    }
  }
}

function butterflies(re: Float64Array, im: Float64Array, size: number, angle: number): void {
  const half = size / 2;
  for (let start = 0; start < re.length; start += size) {
    for (let k = 0; k < half; k += 1) {
      const wr = Math.cos(angle * k);
      const wi = Math.sin(angle * k);
      const a = start + k;
      const b = a + half;
      const br = (re[b] as number) * wr - (im[b] as number) * wi;
      const bi = (re[b] as number) * wi + (im[b] as number) * wr;
      re[b] = (re[a] as number) - br;
      im[b] = (im[a] as number) - bi;
      re[a] = (re[a] as number) + br;
      im[a] = (im[a] as number) + bi;
    }
  }
}

export function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}
