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
        latency: 4.2,
        bufferAhead: 3,
        state: "playing",
        playbackRate: 0.92,
        title: "Collab stream",
        channel: "Someone",
      },
    ]);
  });

  it("says once that there's no live player", () => {
    const { agent, posted } = setup(createFakePlayer({ isLive: false }).element);

    agent.tick();
    agent.tick();

    expect(posted).toEqual([null]);
  });

  it("says again when a live player goes away after reporting", () => {
    const player = createFakePlayer();
    const { agent, posted } = setup(player.element);
    agent.tick();
    player.fake.isLive = false;

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
});
