interface Tables {
  /** cos and sin of −2πk/n for k < n/2. */
  cos: Float64Array;
  sin: Float64Array;
  /** Bit-reversed index of each position. */
  reversed: Uint32Array;
}

// Matching uses a handful of sizes over and over, so each size's tables are built once.
// Without them, the butterflies called Math.cos/sin millions of times per match.
const tables = new Map<number, Tables>();

function tablesFor(n: number): Tables {
  const cached = tables.get(n);
  if (cached) {
    return cached;
  }
  const half = n / 2;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let k = 0; k < half; k += 1) {
    cos[k] = Math.cos((-2 * Math.PI * k) / n);
    sin[k] = Math.sin((-2 * Math.PI * k) / n);
  }
  const reversed = new Uint32Array(n);
  const bits = Math.log2(n);
  for (let index = 0; index < n; index += 1) {
    let value = index;
    let result = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      result = (result << 1) | (value & 1);
      value >>= 1;
    }
    reversed[index] = result;
  }
  const made = { cos, sin, reversed };
  tables.set(n, made);
  return made;
}

/** Bit-reversal permutation. */
function reorder(re: Float64Array, im: Float64Array, reversed: Uint32Array): void {
  for (let index = 0; index < re.length; index += 1) {
    const swap = reversed[index] as number;
    if (index < swap) {
      const r = re[index] as number;
      re[index] = re[swap] as number;
      re[swap] = r;
      const i = im[index] as number;
      im[index] = im[swap] as number;
      im[swap] = i;
    }
  }
}

/** Twiddles for one transform: the size's tables, and the sign of sin (−1: inverse). */
interface Twiddles {
  table: Tables;
  sign: number;
}

/** One stage of butterflies over blocks of `size`; the twiddle for k is table entry k·n/size. */
function butterflies(re: Float64Array, im: Float64Array, size: number, twiddles: Twiddles) {
  const { table, sign } = twiddles;
  const n = re.length;
  const half = size / 2;
  const stride = n / size;
  for (let start = 0; start < n; start += size) {
    for (let k = 0; k < half; k += 1) {
      const wr = table.cos[k * stride] as number;
      const wi = sign * (table.sin[k * stride] as number);
      const a = start + k;
      const b = a + half;
      const reB = re[b] as number;
      const imB = im[b] as number;
      const br = reB * wr - imB * wi;
      const bi = reB * wi + imB * wr;
      const reA = re[a] as number;
      const imA = im[a] as number;
      re[b] = reA - br;
      im[b] = imA - bi;
      re[a] = reA + br;
      im[a] = imA + bi;
    }
  }
}

/**
 * In-place radix-2 FFT. `re` and `im` must have the same power-of-two length.
 * `inverse` computes the inverse transform, scaled by 1/n.
 */
export function fft(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n < 2) {
    return;
  }
  const table = tablesFor(n);
  reorder(re, im, table.reversed);
  // The table holds the forward twiddles (sin of −2πk/n); the inverse flips the sign.
  const twiddles = { table, sign: inverse ? -1 : 1 };
  for (let size = 2; size <= n; size *= 2) {
    butterflies(re, im, size, twiddles);
  }
  if (inverse) {
    for (let index = 0; index < n; index += 1) {
      re[index] = (re[index] as number) / n;
      im[index] = (im[index] as number) / n;
    }
  }
}

export function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(Math.max(2, value)));
}
