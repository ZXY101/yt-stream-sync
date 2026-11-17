import { encodePcm } from "../audio/pcm.ts";
import { AUDIO_RATE } from "../audio/ring.ts";
import type { AudioClip, AudioReport } from "../lib/messages.ts";
import { canTap, createAudioTap } from "./audio-tap.ts";

const RETRY_STEPS = 5;

type Tap = Pick<ReturnType<typeof createAudioTap>, "ring" | "state" | "stop" | "video"> & {
  note?: string;
};

export interface ListenerOptions {
  /** Sends a clip the background asked for. */
  post: (clip: AudioClip) => void;
  createTap?: (video: HTMLVideoElement) => Tap;
}

/** Starts listening to `video`, or returns undefined when it can't be heard (yet). */
function tryTap(createTap: (video: HTMLVideoElement) => Tap, video: HTMLVideoElement) {
  try {
    return canTap(video) ? createTap(video) : undefined;
  } catch (error) {
    console.warn("yt-stream-sync: can't listen to this player yet", error);
    return undefined;
  }
}

/**
 * Listens to the player's audio while the background wants it (the player is in the sync
 * group and audio sync is on). Follows YouTube when it swaps the video element.
 */
export function createListener(options: ListenerOptions) {
  const createTap = options.createTap ?? createAudioTap;
  let wanted = false;
  let tap: Tap | undefined;
  // Steps until listening is tried again after it failed (e.g. a player that hasn't started
  // has no audio track yet). Syncing carries on regardless.
  let retryIn = 0;
  let failed = false;

  function stop() {
    tap?.stop();
    tap = undefined;
  }

  /** Call every tick with the player's current video element. */
  function follow(video: HTMLVideoElement | null) {
    if (tap && (!wanted || tap.video !== video)) {
      stop();
    }
    if (!wanted || tap || !video) {
      return;
    }
    if (retryIn > 0) {
      retryIn -= 1;
      return;
    }
    tap = tryTap(createTap, video);
    failed = tap === undefined;
    retryIn = failed ? RETRY_STEPS : 0;
  }

  function setWanted(on: boolean, video: HTMLVideoElement | null) {
    wanted = on;
    follow(video);
  }

  function audioReport(): AudioReport | undefined {
    if (!tap) {
      return wanted && failed ? { state: "unavailable", envelope: [], end: 0 } : undefined;
    }
    const { end, values } = tap.ring.takeEnvelope();
    // The note goes out once, with the first report after listening started.
    const note = tap.note;
    tap.note = undefined;
    return { state: tap.state(), envelope: values, end, ...(note ? { note } : {}) };
  }

  function sendClip(request: number, seconds: number) {
    if (tap) {
      const { start, samples } = tap.ring.clip(seconds);
      options.post({ request, start, rate: AUDIO_RATE, pcm: encodePcm(samples) });
    }
  }

  return { follow, setWanted, audioReport, sendClip };
}
