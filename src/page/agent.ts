import type { PlayerCommand, PlayerReport } from "../lib/messages.ts";
import { createLatencyTracker } from "./latency.ts";
import { readBuffer, readLatency, readState, type YouTubePlayer } from "./youtube.ts";

export interface PageAgentOptions {
  findPlayer: () => YouTubePlayer | null;
  post: (report: PlayerReport | null) => void;
  /** Seconds on a monotonic clock. */
  now: () => number;
}

function findVideo(player: YouTubePlayer): HTMLVideoElement | null {
  return player.querySelector("video");
}

/** Reads the frame's player once a second and carries out commands for it. */
export function createPageAgent(options: PageAgentOptions) {
  const tracker = createLatencyTracker();
  let reportedNone = false;

  function postNone() {
    // One "no live player" message is enough; repeating it every second would be noise.
    if (!reportedNone) {
      options.post(null);
      reportedNone = true;
    }
  }

  function tick() {
    const player = options.findPlayer();
    const video = player && findVideo(player);
    const data = player?.getVideoData();
    if (!player || !video || !data?.isLive) {
      postNone();
      return;
    }
    const stats = player.getStatsForNerds();
    const state = readState(player);
    const latency = tracker.update(readLatency(stats), state, options.now());
    if (latency === undefined) {
      return;
    }
    reportedNone = false;
    const bufferAhead = readBuffer(stats);
    const title = data.title ?? "";
    const channel = data.author ?? "";
    options.post({ latency, bufferAhead, state, playbackRate: video.playbackRate, title, channel });
  }

  function run(command: PlayerCommand) {
    const player = options.findPlayer();
    const video = player && findVideo(player);
    if (!player || !video) {
      return;
    }
    if (command.type === "setRate") {
      // Set on the video element: the player's setPlaybackRate() rounds 0.92 to 0.9.
      video.playbackRate = command.rate;
    } else if (command.type === "pause") {
      player.pauseVideo();
    } else {
      player.playVideo();
    }
  }

  return { tick, run };
}
