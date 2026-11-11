import type { ArchiveReport, LiveReport } from "../lib/messages.ts";
import type { createBufferLowTracker } from "./buffer-low.ts";
import type { createLatencyTracker } from "./latency.ts";
import {
  isPinnedLive,
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
  trackers: {
    latency: ReturnType<typeof createLatencyTracker>;
    bufferLow: ReturnType<typeof createBufferLowTracker>;
  },
  now: number,
): LiveReport | undefined {
  const stats = player.getStatsForNerds();
  const base = describe(player, video);
  const latency = trackers.latency.update(readLatency(stats), base.state, now);
  if (latency === undefined) {
    return undefined;
  }
  const bufferAhead = readBuffer(stats);
  const bufferLow = trackers.bufferLow.update(bufferAhead, now);
  return { kind: "live", latency, bufferAhead, bufferLow, pinned: isPinnedLive(player), ...base };
}

/** Seconds buffered ahead of the playhead, from the video element's buffered ranges. */
function bufferedAhead(video: HTMLVideoElement): number {
  const { buffered, currentTime } = video;
  for (let index = 0; index < buffered.length; index += 1) {
    if (buffered.start(index) <= currentTime && currentTime <= buffered.end(index)) {
      return buffered.end(index) - currentTime;
    }
  }
  return 0;
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
    bufferAhead: bufferedAhead(video),
    startTime: readStartTime(player),
    userActions,
    ...describe(player, video),
  };
}
