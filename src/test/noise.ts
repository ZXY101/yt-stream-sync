/**
 * Deterministic noise (mulberry32), so audio tests don't depend on Math.random. A plain LCG
 * won't do: different seeds give shifted copies of one sequence, which really do correlate.
 */
export function noise(length: number, seed: number): Float32Array {
  let state = seed >>> 0;
  return Float32Array.from({ length }, () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4_294_967_296) * 2 - 1;
  });
}
