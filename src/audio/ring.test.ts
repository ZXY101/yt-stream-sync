import { AUDIO_RATE, createAudioRing } from "./ring.ts";

function ramp(length: number, from = 0): Float32Array {
  return Float32Array.from({ length }, (_value, index) => (from + index) / 100_000);
}

describe("audio ring", () => {
  it("returns the newest audio with the wall time of its first sample", () => {
    const ring = createAudioRing(2);
    ring.push(ramp(AUDIO_RATE), 10_000);
    ring.push(ramp(AUDIO_RATE, AUDIO_RATE), 11_000);

    const clip = ring.clip(0.5);

    expect(clip.start).toBe(10_500);
    expect(clip.samples).toHaveLength(AUDIO_RATE / 2);
    expect(clip.samples[0]).toBeCloseTo((AUDIO_RATE * 1.5) / 100_000);
  });

  it("keeps only the last seconds and wraps around", () => {
    const ring = createAudioRing(1);
    ring.push(ramp(AUDIO_RATE * 3), 3000);

    const clip = ring.clip(5);

    expect(clip.samples).toHaveLength(AUDIO_RATE);
    expect(clip.start).toBe(2000);
    expect(clip.samples.at(-1)).toBeCloseTo((AUDIO_RATE * 3 - 1) / 100_000);
    expect(ring.heardSeconds()).toBe(3);
  });

  it("hands out loudness for whole 50 ms blocks and keeps the rest for next time", () => {
    const ring = createAudioRing(5);
    ring.push(new Float32Array(300).fill(0.5), 1000);

    const first = ring.takeEnvelope();
    ring.push(new Float32Array(100).fill(0.5), 1025);
    const second = ring.takeEnvelope();

    expect(first.values).toEqual([0.5]);
    expect(first.end).toBe(975);
    expect(second.values).toEqual([0.5]);
    expect(second.end).toBe(1025);
  });
});
