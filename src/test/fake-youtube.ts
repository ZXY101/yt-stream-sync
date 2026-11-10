import type { YouTubePlayer } from "../page/youtube.ts";

export interface FakePlayerState {
  stateCode: number;
  isLive: boolean;
  latencyText: string;
  latencyShown: boolean;
  bufferText: string;
  title: string;
  author: string;
}

/** A `#movie_player` element with the YouTube methods the page script uses, plus a video. */
export function createFakePlayer(initial: Partial<FakePlayerState> = {}) {
  const fake: FakePlayerState = {
    stateCode: 1,
    isLive: true,
    latencyText: "4.20s",
    latencyShown: true,
    bufferText: "3.00 s",
    title: "Collab stream",
    author: "Someone",
    ...initial,
  };
  const element = document.createElement("div") as unknown as YouTubePlayer;
  element.id = "movie_player";
  const video = document.createElement("video");
  element.append(video);
  Object.assign(element, {
    getStatsForNerds: () => ({
      live_latency_style: fake.latencyShown ? "" : "display:none",
      live_latency_secs: fake.latencyText,
      buffer_health_seconds: fake.bufferText,
    }),
    getPlayerState: () => fake.stateCode,
    getVideoData: () => ({ isLive: fake.isLive, title: fake.title, author: fake.author }),
    playVideo: vi.fn(() => (fake.stateCode = 1)),
    pauseVideo: vi.fn(() => (fake.stateCode = 2)),
  });
  return { element, video, fake };
}
