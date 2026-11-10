import type { PlayerReport } from "../lib/messages.ts";
import { createFakePlayer } from "../test/fake-youtube.ts";
import type { YouTubePlayer } from "./youtube.ts";
import { createPageAgent } from "./agent.ts";

function setup(player: YouTubePlayer | null) {
  const posted: (PlayerReport | null)[] = [];
  let clock = 0;
  const agent = createPageAgent({
    findPlayer: () => player,
    post: (report) => posted.push(report),
    now: () => clock,
  });
  function advance(seconds: number) {
    clock += seconds;
  }
  return { agent, posted, advance };
}

describe("page agent", () => {
  it("reports a live player", () => {
    const { element, video } = createFakePlayer();
    video.playbackRate = 0.92;
    const { agent, posted } = setup(element);

    agent.tick();

    expect(posted).toEqual([
      {
        kind: "live",
        latency: 4.2,
        bufferAhead: 3,
        state: "playing",
        playbackRate: 0.92,
        title: "Collab stream",
        channel: "Someone",
        videoId: "abc123",
      },
    ]);
  });

  it("says once that there's no stream player, e.g. on a normal upload", () => {
    const fakePlayer = createFakePlayer({ isLive: false, isLiveContent: false });
    const { agent, posted } = setup(fakePlayer.element);

    agent.tick();
    agent.tick();

    expect(posted).toEqual([null]);
  });

  it("says again when a live player goes away after reporting", () => {
    const player = createFakePlayer();
    const { agent, posted } = setup(player.element);
    agent.tick();
    player.fake.isLive = false;
    player.fake.isLiveContent = false;

    agent.tick();

    expect(posted.at(-1)).toBeNull();
    expect(posted).toHaveLength(2);
  });

  it("skips a second when the latency can't be read", () => {
    const { agent, posted } = setup(createFakePlayer({ latencyShown: false }).element);

    agent.tick();

    expect(posted).toEqual([]);
  });

  it("reports a growing latency while paused", () => {
    const player = createFakePlayer();
    const { agent, posted, advance } = setup(player.element);
    agent.tick();
    agent.run({ type: "pause" });
    player.fake.latencyText = "0.00s";
    advance(2);

    agent.tick();

    expect(posted.at(-1)).toMatchObject({ state: "paused", latency: 6.2 });
  });

  it("carries out commands", () => {
    const { element, video } = createFakePlayer();
    const { agent } = setup(element);

    agent.run({ type: "setRate", rate: 0.92 });
    agent.run({ type: "pause" });
    agent.run({ type: "play" });

    expect(video.playbackRate).toBe(0.92);
    expect(element.pauseVideo).toHaveBeenCalledOnce();
    expect(element.playVideo).toHaveBeenCalledOnce();
  });

  it("ignores commands when there's no player", () => {
    const { agent, posted } = setup(null);

    expect(() => agent.run({ type: "pause" })).not.toThrow();
    agent.tick();
    expect(posted).toEqual([null]);
  });

  it("reports an archive with its position and broadcast start", () => {
    const { element, video } = createFakePlayer({
      isLive: false,
      startTimestamp: "2026-11-10T12:59:40+00:00",
    });
    video.currentTime = 120;
    const { agent, posted } = setup(element);

    agent.tick();

    expect(posted).toEqual([
      expect.objectContaining({
        kind: "archive",
        position: 120,
        duration: 12_000,
        startTime: Date.parse("2026-11-10T12:59:40Z") / 1000,
        userActions: 0,
      }),
    ]);
  });

  it("has no start time for an archive in an embed", () => {
    const { agent, posted } = setup(createFakePlayer({ isLive: false }).element);

    agent.tick();

    expect(posted[0]).toMatchObject({ kind: "archive", startTime: undefined });
  });

  it("reports the user's seeks right away but not its own", () => {
    const { element, video } = createFakePlayer({ isLive: false });
    const { agent, posted } = setup(element);
    agent.tick();

    agent.run({ type: "seek", position: 300 });
    expect(element.seekTo).toHaveBeenCalledWith(300, true);
    expect(posted).toHaveLength(1);

    video.currentTime = 900;
    video.dispatchEvent(new Event("seeked"));

    expect(posted).toHaveLength(2);
    expect(posted[1]).toMatchObject({ position: 900, userActions: 1 });
  });

  it("listens to a new video element when YouTube swaps it", () => {
    const player = createFakePlayer({ isLive: false });
    const { agent, posted } = setup(player.element);
    agent.tick();
    const replacement = document.createElement("video");
    player.video.replaceWith(replacement);
    agent.tick();

    player.video.dispatchEvent(new Event("pause"));
    replacement.dispatchEvent(new Event("pause"));

    expect(posted.at(-1)).toMatchObject({ userActions: 1 });
  });
});
