import type { PlayerState } from "../controller/types.ts";

/** The parts of YouTube's player element (`#movie_player`) we use. Not a public API. */
export interface YouTubePlayer extends HTMLElement {
  getStatsForNerds(): Record<string, unknown>;
  getPlayerState(): number;
  getVideoData(): { isLive?: boolean; title?: string; author?: string; video_id?: string };
  getPlayerResponse(): PlayerResponse | undefined;
  getDuration(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
}

/** The parts of the player response we read. Embeds have no `microformat`. */
export interface PlayerResponse {
  videoDetails?: { isLiveContent?: boolean; latencyClass?: string };
  microformat?: {
    playerMicroformatRenderer?: { liveBroadcastDetails?: { startTimestamp?: string } };
  };
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

/** A finished live stream (an archive), as opposed to a live one or a normal upload. */
export function isArchive(player: YouTubePlayer): boolean {
  const live = player.getVideoData().isLive === true;
  return !live && player.getPlayerResponse()?.videoDetails?.isLiveContent === true;
}

/** When the broadcast started, in Unix seconds. Only watch pages have it. */
export function readStartTime(player: YouTubePlayer): number | undefined {
  const details = player.getPlayerResponse()?.microformat?.playerMicroformatRenderer;
  const text = details?.liveBroadcastDetails?.startTimestamp;
  const milliseconds = text ? Date.parse(text) : Number.NaN;
  return Number.isFinite(milliseconds) ? milliseconds / 1000 : undefined;
}

/**
 * An ultra-low-latency live stream. YouTube keeps these at the live edge: a pause or a seek
 * back is undone within seconds (seen on real streams), so they can't be held back.
 */
export function isPinnedLive(player: YouTubePlayer): boolean {
  // Optional call: a player without the method (seen in test pages) counts as not pinned.
  const response =
    typeof player.getPlayerResponse === "function" ? player.getPlayerResponse() : undefined;
  const latencyClass = response?.videoDetails?.latencyClass ?? "";
  return latencyClass.endsWith("_ULTRA_LOW");
}
