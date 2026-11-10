import { noise } from "../test/noise.ts";
import { gccPhat } from "./gcc-phat.ts";

const RATE = 4000;
const plain = { sampleRate: RATE, maxLagSeconds: 5 };

/** The same sound, `delaySeconds` later, with its own extra noise mixed in. */
function delayed(source: Float32Array, delaySeconds: number, extra: Float32Array, share = 0.6) {
  const shift = Math.round(delaySeconds * RATE);
  return Float32Array.from(source, (_value, index) => {
    const original = source[index - shift] ?? 0;
    return share * original + (1 - share) * (extra[index] as number);
  });
}

describe("gccPhat", () => {
  const voices = noise(8 * RATE, 1);

  it.each([0.42, -1.3, 0, 3.25])("finds a %ss delay between two mixes", (delay) => {
    const own = noise(8 * RATE, 2);
    const match = gccPhat(voices, delayed(voices, delay, own), plain);

    expect(match.lag).toBeCloseTo(delay, 3);
    expect(match.confidence).toBeGreaterThan(20);
    expect(match.uniqueness).toBeGreaterThan(2);
  });

  it("has no confidence in recordings of different sounds", () => {
    const match = gccPhat(voices, noise(8 * RATE, 99), plain);

    expect(match.confidence).toBeLessThan(8);
    expect(match.uniqueness).toBeLessThan(1.3);
  });

  it("finds sub-sample delays", () => {
    const smooth = Float32Array.from(voices, (_v, i) => Math.sin(i / 3) * (voices[i] as number));
    const match = gccPhat(smooth, delayed(smooth, 0.5, noise(8 * RATE, 3)), plain);

    expect(Math.abs(match.lag - 0.5)).toBeLessThan(0.001);
  });

  it("finds the lag when shared sound only comes and goes, by combining windows", () => {
    const length = 30 * RATE;
    const event = noise(length, 4);
    // Only 3 s of every 10 s are shared; the rest is each streamer's own sound.
    function sharedNow(index: number): boolean {
      return index % (10 * RATE) < 3 * RATE;
    }
    const a = Float32Array.from(noise(length, 5), (own, i) =>
      sharedNow(i) ? (event[i] as number) : own,
    );
    const shift = Math.round(5.1 * RATE);
    const b = Float32Array.from(noise(length, 6), (own, i) => {
      const source = i - shift;
      return source >= 0 && sharedNow(source) ? 0.3 * (event[source] as number) + 0.7 * own : own;
    });

    const combined = gccPhat(a, b, {
      sampleRate: RATE,
      maxLagSeconds: 8,
      windows: { window: 15, hop: 2.5 },
    });

    expect(combined.lag).toBeCloseTo(5.1, 2);
    expect(combined.confidence).toBeGreaterThan(12);
    expect(combined.uniqueness).toBeGreaterThan(1.3);
  });
});
