import { encodePcm } from "../../audio/pcm.ts";
import { AUDIO_RATE } from "../../audio/ring.ts";
import type { PlayerCommand } from "../../lib/messages.ts";
import { noise } from "../../test/noise.ts";
import { createAudioSync, type AudioMember } from "./audio-sync.ts";

const voices = noise(40 * AUDIO_RATE, 1);

/** 20 s of what a player heard, `behind` seconds behind the shared sound. */
function clipFor(request: number, behind: number, seed: number) {
  const own = noise(20 * AUDIO_RATE, seed);
  const first = Math.round((10 - behind) * AUDIO_RATE);
  const samples = Float32Array.from(own, (v, i) => 0.6 * (voices[first + i] as number) + 0.4 * v);
  return { request, start: 1_000_000, rate: AUDIO_RATE, pcm: encodePcm(samples) };
}

function setup() {
  let clock = 0;
  const sent: [string, PlayerCommand][] = [];
  const adjust = vi.fn<(id: string, seconds: number) => void>();
  const sync = createAudioSync({
    send: (id, command) => sent.push([id, command]),
    adjust,
    now: () => clock,
  });
  function run(seconds: number, members: AudioMember[]) {
    for (let index = 0; index < seconds; index += 1) {
      clock += 1;
      sync.update(members, "a");
    }
  }
  return { sync, sent, adjust, run };
}

const playing: AudioMember[] = [
  { id: "a", settled: true, blocked: false },
  { id: "b", settled: true, blocked: false },
];

function clipRequest(sent: [string, PlayerCommand][]) {
  const found = sent.find(([, command]) => command.type === "clip");
  return found?.[1].type === "clip" ? found[1].request : -1;
}

describe("audio sync", () => {
  it("listens, waits for 20 s of settled audio, then matches and adjusts once", () => {
    const { sync, sent, adjust, run } = setup();

    run(5, playing);
    expect(sent.slice(0, 2)).toEqual([
      ["a", { type: "listen", on: true }],
      ["b", { type: "listen", on: true }],
    ]);
    expect(sync.status()).toEqual({ state: "listening", progress: 0.2 });

    run(16, playing);
    expect(sync.status()).toEqual({ state: "matching" });
    const request = clipRequest(sent);
    sync.receiveClip("a", clipFor(request, 0, 2));
    sync.receiveClip("b", clipFor(request, 0.35, 3));

    expect(adjust).toHaveBeenCalledOnce();
    expect(adjust.mock.calls[0]?.[0]).toBe("b");
    expect(adjust.mock.calls[0]?.[1]).toBeCloseTo(0.35, 2);
    expect(sync.status()).toMatchObject({ state: "matched" });
    run(30, playing);
    expect(sent.filter(([, command]) => command.type === "clip")).toHaveLength(2);
  });

  it("says when the streams share no sound, and changes nothing", () => {
    const { sync, sent, adjust, run } = setup();
    run(21, playing);
    const request = clipRequest(sent);
    const unrelated = { ...clipFor(request, 0, 2), pcm: encodePcm(noise(20 * AUDIO_RATE, 9)) };

    sync.receiveClip("a", clipFor(request, 0, 2));
    sync.receiveClip("b", unrelated);

    expect(adjust).not.toHaveBeenCalled();
    expect(sync.status()).toEqual({ state: "failed", reason: "no-shared-sound" });
  });

  it("gives up on clips that never arrive", () => {
    const { sync, run } = setup();
    run(21, playing);

    run(6, playing);

    expect(sync.status()).toEqual({ state: "failed", reason: "too-short" });
  });

  it("ignores clips it didn't ask for", () => {
    const { sync, adjust, run } = setup();
    run(21, playing);

    sync.receiveClip("a", clipFor(999, 0, 2));
    sync.receiveClip("z", clipFor(1, 0, 2));

    expect(adjust).not.toHaveBeenCalled();
  });

  it("starts the 20 s again whenever a player stops playing in sync", () => {
    const { sync, run } = setup();
    run(15, playing);
    run(1, [playing[0] as AudioMember, { id: "b", settled: false, blocked: false }]);

    run(10, playing);

    expect(sync.status()).toMatchObject({ state: "listening" });
  });

  it("says when the browser won't let a page be heard yet", () => {
    const { sync, run } = setup();

    run(1, [playing[0] as AudioMember, { id: "b", settled: true, blocked: true }]);

    expect(sync.status()).toEqual({ state: "blocked" });
  });

  it("stops listening when turned off or when a player leaves", () => {
    const { sync, sent, run } = setup();
    run(1, playing);

    run(1, [playing[0] as AudioMember]);
    expect(sync.status()).toEqual({ state: "waiting" });
    sync.setEnabled(false);
    run(1, [playing[0] as AudioMember]);

    expect(sent.slice(2)).toEqual([
      ["b", { type: "listen", on: false }],
      ["a", { type: "listen", on: false }],
    ]);
    expect(sync.status()).toEqual({ state: "off" });
  });

  it("matches again on request, with fresh audio", () => {
    const { sync, sent, run } = setup();
    run(21, playing);
    const first = clipRequest(sent);
    sync.receiveClip("a", clipFor(first, 0, 2));
    sync.receiveClip("b", clipFor(first, 0, 3));

    sync.rematch();
    run(5, playing);
    expect(sync.status()).toMatchObject({ state: "listening" });
    run(16, playing);

    expect(sync.status()).toEqual({ state: "matching" });
  });

  it("says when a player in the group can't be listened to", () => {
    const { sync, run } = setup();

    run(1, [
      playing[0] as AudioMember,
      { id: "b", settled: true, blocked: false, unavailable: true },
    ]);

    expect(sync.status()).toEqual({ state: "unavailable" });
  });
});
