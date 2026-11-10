import { decimate, decodePcm, encodePcm, envelope } from "./pcm.ts";

describe("pcm", () => {
  it("averages blocks when decimating", () => {
    expect([...decimate(Float32Array.of(1, 3, 2, 4, 9), 2)]).toEqual([2, 3]);
  });

  it("measures loudness per block", () => {
    const values = envelope(Float32Array.of(0.5, -0.5, 0, 0, 2, 2), 2);

    expect(values).toEqual([0.5, 0, 1]);
  });

  it("round-trips samples through base64 16-bit PCM", () => {
    const samples = Float32Array.of(0, 0.5, -0.25, 1, -1, 3);
    const decoded = decodePcm(encodePcm(samples));

    expect([...decoded].map((value) => Number(value.toFixed(3)))).toEqual([
      0, 0.5, -0.25, 1, -1, 1,
    ]);
  });

  it("encodes long clips without overflowing the call stack", () => {
    const long = new Float32Array(200_000).fill(0.1);

    expect(decodePcm(encodePcm(long))).toHaveLength(200_000);
  });
});
