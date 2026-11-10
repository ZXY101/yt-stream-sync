import { noise } from "../test/noise.ts";
import { matchClips } from "./match-clips.ts";
import { AUDIO_RATE } from "./ring.ts";

// The shared sound (the collab's voices).
const voices = noise(60 * AUDIO_RATE, 1);

/** What one player heard from wall time `startMs`, `behind` seconds behind the event. */
function heard(startMs: number, seconds: number, behind: number, seed: number) {
  const own = noise(seconds * AUDIO_RATE, seed);
  const first = Math.round((15 + startMs / 1000 - behind) * AUDIO_RATE);
  const samples = Float32Array.from(own, (value, index) => {
    return 0.6 * (voices[first + index] as number) + 0.4 * value;
  });
  return { start: startMs, samples };
}

const options = { maxLag: 4, minSeconds: 15 };

describe("matchClips", () => {
  it("measures each player's lag against the reference, from clips that start apart", () => {
    const clips = {
      a: heard(0, 30, 0, 2),
      b: heard(250, 30, 0.42, 3),
      c: heard(-500, 30, -1.1, 4),
    };

    const result = matchClips(clips, "a", options);

    expect(result).toEqual({
      lags: { b: expect.closeTo(0.42, 2) as number, c: expect.closeTo(-1.1, 2) as number },
      unmatched: [],
    });
  });

  it("matches each player on its own, so one without shared sound doesn't stop the rest", () => {
    const clips = {
      a: heard(0, 30, 0, 2),
      b: heard(0, 30, 9.5, 3),
      c: { start: 0, samples: noise(30 * AUDIO_RATE, 77) },
    };

    const result = matchClips(clips, "a", { maxLag: 15, minSeconds: 15 });

    expect(result).toEqual({ lags: { b: expect.closeTo(9.5, 2) as number }, unmatched: ["c"] });
  });

  it("refuses when the clips share no sound", () => {
    const clips = { a: heard(0, 30, 0, 2), b: { start: 0, samples: noise(30 * AUDIO_RATE, 77) } };

    expect(matchClips(clips, "a", options)).toEqual({ lags: {}, unmatched: ["b"] });
  });

  it("refuses when the clips overlap too little", () => {
    const clips = { a: heard(0, 20, 0, 2), b: heard(10_000, 20, 0, 3) };

    expect(matchClips(clips, "a", options)).toEqual({ lags: {}, unmatched: ["b"], tooShort: true });
  });
});
