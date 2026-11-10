import type { PlayerState } from "../controller/types.ts";

/** The parts of YouTube's player element (`#movie_player`) we use. Not a public API. */
export interface YouTubePlayer extends HTMLElement {
  getStatsForNerds(): Record<string, unknown>;
  getPlayerState(): number;
  getVideoData(): { isLive?: boolean; title?: string; author?: string };
  playVideo(): void;
  pauseVideo(): void;
}

// getPlayerState(): -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued.
// Unstarted and cued players count as paused, so they stay out of the sync group.
const STATE_BY_CODE: Record<number, PlayerState> = {
  0: "ended",
  1: "playing",
  2: "paused",
  3: "buffering",
};

export function findPlayer(root: Document): YouTubePlayer | null {
  const element = root.getElementById("movie_player") as Partial<YouTubePlayer> | null;
  if (typeof element?.getStatsForNerds !== "function") {
    return null;
  }
  return element as YouTubePlayer;
}

export function readState(player: YouTubePlayer): PlayerState {
  const classes = player.classList;
  if (classes.contains("ad-showing") || classes.contains("ad-interrupting")) {
    return "ad";
  }
  return STATE_BY_CODE[player.getPlayerState()] ?? "paused";
}

/** Stats values are text like "17.66s" or "16.02 s". */
function parseSeconds(text: unknown): number | undefined {
  const value = typeof text === "string" ? Number.parseFloat(text) : Number.NaN;
  return Number.isFinite(value) ? value : undefined;
}

/** Live latency from stats for nerds; YouTube hides the row when it has no value. */
export function readLatency(stats: Record<string, unknown>): number | undefined {
  if (stats.live_latency_style !== "") {
    return undefined;
  }
  return parseSeconds(stats.live_latency_secs);
}

export function readBuffer(stats: Record<string, unknown>): number {
  return parseSeconds(stats.buffer_health_seconds) ?? 0;
}
