import { encodePcm } from "../audio/pcm.ts";
import { AUDIO_RATE } from "../audio/ring.ts";
import type { AudioClip, AudioReport } from "../lib/messages.ts";
import { canTap, createAudioTap } from "./audio-tap.ts";

type Tap = Pick<ReturnType<typeof createAudioTap>, "ring" | "state" | "stop" | "video">;

export interface ListenerOptions {
  /** Sends a clip the background asked for. */
  post: (clip: AudioClip) => void;
  createTap?: (video: HTMLVideoElement) => Tap;
}

/**
 * Listens to the player's audio while the background wants it (the player is in the sync
 * group and audio sync is on). Follows YouTube when it swaps the video element.
 */
export function createListener(options: ListenerOptions) {
  const createTap = options.createTap ?? createAudioTap;
  let wanted = false;
  let tap: Tap | undefined;

  function stop() {
    tap?.stop();
    tap = undefined;
  }

  /** Call every tick with the player's current video element. */
  function follow(video: HTMLVideoElement | null) {
    if (tap && (!wanted || tap.video !== video)) {
      stop();
    }
    if (wanted && !tap && video && canTap(video)) {
      tap = createTap(video);
    }
  }

  function setWanted(on: boolean, video: HTMLVideoElement | null) {
    wanted = on;
    follow(video);
  }

  function audioReport(): AudioReport | undefined {
    if (!tap) {
      return undefined;
    }
    const { end, values } = tap.ring.takeEnvelope();
    return { state: tap.state(), envelope: values, end };
  }

  function sendClip(request: number, seconds: number) {
    if (tap) {
      const { start, samples } = tap.ring.clip(seconds);
      options.post({ request, start, rate: AUDIO_RATE, pcm: encodePcm(samples) });
    }
  }

  return { follow, setWanted, audioReport, sendClip };
}
