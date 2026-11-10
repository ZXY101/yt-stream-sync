import { noise } from "../test/noise.ts";
import { gccPhat } from "./gcc-phat.ts";

const RATE = 4000;

/** The same sound, `delaySeconds` later, with its own extra noise mixed in. */
function delayed(source: Float32Array, delaySeconds: number, extra: Float32Array): Float32Array {
  const shift = Math.round(delaySeconds * RATE);
  return Float32Array.from(source, (_value, index) => {
    const original = source[index - shift] ?? 0;
    return 0.6 * original + 0.4 * (extra[index] as number);
  });
}

describe("gccPhat", () => {
  const voices = noise(8 * RATE, 1);

  it.each([0.42, -1.3, 0, 3.25])("finds a %ss delay between two mixes", (delay) => {
    const own = noise(8 * RATE, 2);
    const match = gccPhat(voices, delayed(voices, delay, own), RATE, 5);

    expect(match.lag).toBeCloseTo(delay, 3);
    expect(match.confidence).toBeGreaterThan(20);
  });

  it("has no confidence in recordings of different sounds", () => {
    const match = gccPhat(voices, noise(8 * RATE, 99), RATE, 5);

    expect(match.confidence).toBeLessThan(8);
  });

  it("finds sub-sample delays", () => {
    const smooth = Float32Array.from(voices, (_v, i) => Math.sin(i / 3) * (voices[i] as number));
    const match = gccPhat(smooth, delayed(smooth, 0.5, noise(8 * RATE, 3)), RATE, 2);

    expect(Math.abs(match.lag - 0.5)).toBeLessThan(0.001);
  });
});
