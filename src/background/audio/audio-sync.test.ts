import { encodePcm } from "../../audio/pcm.ts";
import { AUDIO_RATE } from "../../audio/ring.ts";
import type { PlayerCommand } from "../../lib/messages.ts";
import { noise } from "../../test/noise.ts";
import { createAudioSync, type AudioMember } from "./audio-sync.ts";

const voices = noise(80 * AUDIO_RATE, 1);

/** 30 s of what a player heard, `behind` seconds behind the shared sound. */
function clipFor(request: number, behind: number, seed: number) {
  const own = noise(30 * AUDIO_RATE, seed);
  const first = Math.round((20 - behind) * AUDIO_RATE);
  const samples = Float32Array.from(own, (v, i) => 0.6 * (voices[first + i] as number) + 0.4 * v);
  return { request, start: 1_000_000, rate: AUDIO_RATE, pcm: encodePcm(samples) };
}

function unrelatedClip(request: number) {
  return { ...clipFor(request, 0, 2), pcm: encodePcm(noise(30 * AUDIO_RATE, 9)) };
}

function member(id: string, overrides: Partial<AudioMember> = {}): AudioMember {
  return { id, settled: true, blocked: false, ...overrides };
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
      sync.update(members);
    }
  }
  /** The latest clip request: its number and who was asked. */
  function lastRequest() {
    const asked = sent.filter(([, command]) => command.type === "clip");
    const last = asked.at(-1)?.[1];
    const request = last?.type === "clip" ? last.request : -1;
    const ids = asked
      .filter(([, c]) => c.type === "clip" && c.request === request)
      .map(([id]) => id);
    return { request, ids };
  }
  return { sync, sent, adjust, run, lastRequest };
}

const pair = [member("a"), member("b")];

describe("audio sync", () => {
  it("listens, waits for 30 s of settled audio, then matches and adjusts once", () => {
    const { sync, sent, adjust, run, lastRequest } = setup();

    run(5, pair);
    expect(sent.slice(0, 2)).toEqual([
      ["a", { type: "listen", on: true }],
      ["b", { type: "listen", on: true }],
    ]);
    expect(sync.status()).toEqual({ state: "listening", progress: 4 / 30 });

    run(26, pair);
    expect(sync.status()).toEqual({ state: "matching" });
    const { request } = lastRequest();
    sync.receiveClip("a", clipFor(request, 0, 2));
    sync.receiveClip("b", clipFor(request, 0.35, 3));

    expect(adjust).toHaveBeenCalledOnce();
    expect(adjust.mock.calls[0]?.[0]).toBe("b");
    expect(adjust.mock.calls[0]?.[1]).toBeCloseTo(0.35, 2);
    expect(sync.status()).toMatchObject({ state: "matched" });
    run(40, pair);
    expect(sent.filter(([, command]) => command.type === "clip")).toHaveLength(2);
  });

  it("finds lags of more than ten seconds", () => {
    const { sync, adjust, run, lastRequest } = setup();
    run(31, pair);
    const { request } = lastRequest();

    sync.receiveClip("a", clipFor(request, 0, 2));
    sync.receiveClip("b", clipFor(request, -11, 3));

    expect(adjust.mock.calls[0]?.[1]).toBeCloseTo(-11, 2);
  });

  it("applies the players it could match and keeps trying the rest", () => {
    const { sync, adjust, run, lastRequest } = setup();
    const three = [member("a"), member("b"), member("c")];
    run(31, three);
    const first = lastRequest().request;

    sync.receiveClip("a", clipFor(first, 0, 2));
    sync.receiveClip("b", clipFor(first, 4, 3));
    sync.receiveClip("c", unrelatedClip(first));

    expect(adjust).toHaveBeenCalledOnce();
    expect(sync.status()).toEqual({ state: "listening", progress: 0 });
    run(31, three);
    const second = lastRequest();
    expect(second.ids).toEqual(["a", "b", "c"]);
    sync.receiveClip("a", clipFor(second.request, 0, 2));
    sync.receiveClip("b", clipFor(second.request, 0, 3));
    sync.receiveClip("c", clipFor(second.request, -5, 4));

    expect(adjust.mock.calls.at(-1)).toEqual(["c", expect.closeTo(-5, 2)]);
    expect(sync.status()).toMatchObject({ state: "matched" });
    // Two real three-player matches; slow under coverage instrumentation.
  }, 30_000);

  it("gives up on a player after 4 tries without shared sound, and says so", () => {
    const { sync, adjust, run, lastRequest } = setup();
    for (let attempt = 0; attempt < 4; attempt += 1) {
      run(31, pair);
      const { request } = lastRequest();
      sync.receiveClip("a", clipFor(request, 0, 2));
      sync.receiveClip("b", unrelatedClip(request));
    }

    expect(adjust).not.toHaveBeenCalled();
    expect(sync.status()).toEqual({ state: "failed", reason: "no-shared-sound" });
    // Four real 30 s matches; slow under coverage instrumentation.
  }, 30_000);

  it("reports which player stayed unmatched when the others matched", () => {
    const { sync, run, lastRequest } = setup();
    const three = [member("a"), member("b"), member("c")];
    for (let attempt = 0; attempt < 4; attempt += 1) {
      run(31, three);
      const { request } = lastRequest();
      sync.receiveClip("a", clipFor(request, 0, 2));
      sync.receiveClip("b", clipFor(request, attempt === 0 ? 2 : 0, 3));
      sync.receiveClip("c", unrelatedClip(request));
    }

    expect(sync.status()).toMatchObject({ state: "matched", unmatched: ["c"] });
  }, 30_000);

  it("matches the players that play, and picks up one that starts later", () => {
    const { sync, run, lastRequest } = setup();
    const waiting = [member("a"), member("b"), member("c", { settled: false })];
    run(31, waiting);
    expect(lastRequest().ids).toEqual(["a", "b"]);
    const first = lastRequest().request;
    sync.receiveClip("a", clipFor(first, 0, 2));
    sync.receiveClip("b", clipFor(first, 1, 3));
    expect(sync.status()).toEqual({ state: "listening", progress: 0 });

    run(31, [member("a"), member("b"), member("c")]);

    expect(lastRequest().ids).toEqual(["a", "b", "c"]);
  });

  it("tries again when clips never arrive, and gives up after 4 tries", () => {
    const { sync, run } = setup();
    run(31, pair);
    run(6, pair);
    expect(sync.status()).toMatchObject({ state: "listening" });

    for (let attempt = 1; attempt < 4; attempt += 1) {
      run(37, pair);
    }

    expect(sync.status()).toEqual({ state: "failed", reason: "too-short" });
  });

  it("ignores clips it didn't ask for", () => {
    const { sync, adjust, run } = setup();
    run(31, pair);

    sync.receiveClip("a", clipFor(999, 0, 2));
    sync.receiveClip("z", clipFor(1, 0, 2));

    expect(adjust).not.toHaveBeenCalled();
  });

  it("starts the 30 s again whenever a player stops playing in sync", () => {
    const { sync, run } = setup();
    run(15, pair);
    run(1, [member("a"), member("b", { settled: false })]);

    run(10, pair);

    expect(sync.status()).toMatchObject({ state: "listening" });
  });

  it("says when the browser won't let a page be heard yet, or can't hear one at all", () => {
    const { sync, run } = setup();

    run(1, [member("a"), member("b", { blocked: true })]);
    expect(sync.status()).toEqual({ state: "blocked" });
    run(1, [member("a"), member("b", { unavailable: true })]);
    expect(sync.status()).toEqual({ state: "unavailable" });
  });

  it("stops listening when turned off or when a player leaves", () => {
    const { sync, sent, run } = setup();
    run(1, pair);

    run(1, [member("a")]);
    expect(sync.status()).toEqual({ state: "waiting" });
    sync.setEnabled(false);
    run(1, [member("a")]);

    expect(sent.slice(2)).toEqual([
      ["b", { type: "listen", on: false }],
      ["a", { type: "listen", on: false }],
    ]);
    expect(sync.status()).toEqual({ state: "off" });
  });

  it("matches again on request, with fresh audio", () => {
    const { sync, run, lastRequest } = setup();
    run(31, pair);
    const first = lastRequest().request;
    sync.receiveClip("a", clipFor(first, 0, 2));
    sync.receiveClip("b", clipFor(first, 0, 3));

    sync.rematch();
    expect(sync.status()).toEqual({ state: "listening", progress: 0 });
    run(5, pair);
    expect(sync.status()).toMatchObject({ state: "listening" });
    run(26, pair);

    expect(sync.status()).toEqual({ state: "matching" });
  });
});
