import type { PlayerCommand, PlayerReport } from "../lib/messages.ts";
import { createLatencyTracker } from "./latency.ts";
import { archiveReport, liveReport } from "./reports.ts";
import { createMediaWatcher } from "./media-watcher.ts";
import { createUserActionTracker } from "./user-actions.ts";
import { isArchive, type YouTubePlayer } from "./youtube.ts";

export interface PageAgentOptions {
  findPlayer: () => YouTubePlayer | null;
  post: (report: PlayerReport | null) => void;
  /** Seconds on a monotonic clock. */
  now: () => number;
}

function findVideo(player: YouTubePlayer): HTMLVideoElement | null {
  return player.querySelector("video");
}

function carryOut(player: YouTubePlayer, video: HTMLVideoElement, command: PlayerCommand) {
  if (command.type === "setRate") {
    // Set on the video element: the player's setPlaybackRate() rounds 0.92 to 0.9.
    video.playbackRate = command.rate;
  } else if (command.type === "seek") {
    player.seekTo(command.position, true);
  } else if (command.type === "pause") {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

/**
 * Reads the frame's player once a second (live streams and archives) and carries out
 * commands for it. User actions on an archive are reported straight away, so the other
 * players follow without waiting for the next second.
 */
export function createPageAgent(options: PageAgentOptions) {
  const latencyTracker = createLatencyTracker();
  const userActions = createUserActionTracker(options.now);
  const media = createMediaWatcher((event) => {
    if (userActions.observe(event)) {
      tick();
    }
  });
  let reportedNone = false;

  function read(player: YouTubePlayer, video: HTMLVideoElement): PlayerReport | null | undefined {
    if (player.getVideoData().isLive) {
      return liveReport(player, video, latencyTracker, options.now());
    }
    return isArchive(player) ? archiveReport(player, video, userActions.count()) : null;
  }

  function tick() {
    const player = options.findPlayer();
    const video = player && findVideo(player);
    const report = player && video ? read(player, video) : null;
    if (video) {
      media.watch(video);
    }
    if (report === null) {
      // One "no stream player" message is enough; repeating it every second would be noise.
      if (!reportedNone) {
        options.post(null);
      }
      reportedNone = true;
    } else if (report) {
      reportedNone = false;
      options.post(report);
    }
  }

  function run(command: PlayerCommand) {
    const player = options.findPlayer();
    const video = player && findVideo(player);
    if (!player || !video) {
      return;
    }
    userActions.expectFrom(command);
    carryOut(player, video, command);
  }

  return { tick, run };
}
