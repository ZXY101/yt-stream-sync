import type { ArchiveReport, LiveReport } from "../lib/messages.ts";
import type { createLatencyTracker } from "./latency.ts";
import {
  readBuffer,
  readLatency,
  readStartTime,
  readState,
  type YouTubePlayer,
} from "./youtube.ts";

function describe(player: YouTubePlayer, video: HTMLVideoElement) {
  const data = player.getVideoData();
  return {
    state: readState(player),
    playbackRate: video.playbackRate,
    title: data.title ?? "",
    channel: data.author ?? "",
    videoId: data.video_id ?? "",
  };
}

/** A live player's report, or undefined while its latency can't be read. */
export function liveReport(
  player: YouTubePlayer,
  video: HTMLVideoElement,
  latencyTracker: ReturnType<typeof createLatencyTracker>,
  now: number,
): LiveReport | undefined {
  const stats = player.getStatsForNerds();
  const base = describe(player, video);
  const latency = latencyTracker.update(readLatency(stats), base.state, now);
  if (latency === undefined) {
    return undefined;
  }
  return { kind: "live", latency, bufferAhead: readBuffer(stats), ...base };
}

export function archiveReport(
  player: YouTubePlayer,
  video: HTMLVideoElement,
  userActions: number,
): ArchiveReport {
  return {
    kind: "archive",
    position: video.currentTime,
    duration: player.getDuration(),
    startTime: readStartTime(player),
    userActions,
    ...describe(player, video),
  };
}
