import type { PlayerResponse, YouTubePlayer } from "../page/youtube.ts";

export interface FakePlayerState {
  stateCode: number;
  isLive: boolean;
  latencyText: string;
  latencyShown: boolean;
  bufferText: string;
  title: string;
  author: string;
  videoId: string;
  /** A finished live stream. Set `isLive: false` too. */
  isLiveContent: boolean;
  /** ISO time like "2026-11-10T12:59:40+00:00"; embeds have none. */
  startTimestamp?: string;
  duration: number;
}

function playerResponse(fake: FakePlayerState): PlayerResponse {
  const startTimestamp = fake.startTimestamp;
  const broadcast = { playerMicroformatRenderer: { liveBroadcastDetails: { startTimestamp } } };
  return {
    videoDetails: { isLiveContent: fake.isLiveContent },
    microformat: startTimestamp ? broadcast : undefined,
  };
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
    videoId: "abc123",
    isLiveContent: true,
    duration: 12_000,
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
    getVideoData: () => ({
      isLive: fake.isLive,
      title: fake.title,
      author: fake.author,
      video_id: fake.videoId,
    }),
    getPlayerResponse: () => playerResponse(fake),
    getDuration: () => fake.duration,
    seekTo: vi.fn((seconds: number) => {
      video.currentTime = seconds;
      video.dispatchEvent(new Event("seeked"));
    }),
    playVideo: vi.fn(() => (fake.stateCode = 1)),
    pauseVideo: vi.fn(() => (fake.stateCode = 2)),
  });
  return { element, video, fake };
}
