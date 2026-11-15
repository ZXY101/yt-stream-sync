import { encodePcm } from "../audio/pcm.ts";
import { AUDIO_RATE } from "../audio/ring.ts";
import type { AudioClip, AudioReport } from "../lib/messages.ts";
import { canTap, createAudioTap } from "./audio-tap.ts";

const RETRY_STEPS = 5;
// A tap that heard the player this many steps counts as working again.
const LASTED_STEPS = 30;

type Tap = Pick<ReturnType<typeof createAudioTap>, "ring" | "state" | "stop" | "video"> & {
  note?: string;
  /** Missing means always alive (test taps). */
  alive?: () => boolean;
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
 * When to try listening again. After a failed try (e.g. no audio track yet): in a few steps.
 * After a tap stopped hearing the player (see `alive`): at once the first time, then only now
 * and then until one lasts a while.
 */
function createRetries() {
  let retryIn = 0;
  let deaths = 0;
  let heardFor = 0;
  return {
    /** True while waiting; counts the step. */
    waiting(): boolean {
      retryIn = Math.max(0, retryIn - 1);
      return retryIn > 0;
    },
    tried(ok: boolean) {
      heardFor = 0;
      retryIn = ok ? 0 : RETRY_STEPS + 1;
    },
    died() {
      retryIn = deaths++ > 0 ? RETRY_STEPS + 1 : 0;
    },
    heard() {
      heardFor += 1;
      if (heardFor >= LASTED_STEPS) {
        deaths = 0;
      }
    },
  };
}

/** Loudness since the last report; the note goes out once, with the first report. */
function tapReport(tap: Tap): AudioReport {
  const { end, values } = tap.ring.takeEnvelope();
  const note = tap.note;
  tap.note = undefined;
  return { state: tap.state(), envelope: values, end, ...(note ? { note } : {}) };
}

/**
 * Listens to the player's audio while the background wants it (the player is in the sync
 * group and audio sync is on). Follows YouTube when it swaps the video element, or reloads
 * the media in it.
 */
export function createListener(options: ListenerOptions) {
  const createTap = options.createTap ?? createAudioTap;
  let wanted = false;
  let tap: Tap | undefined;
  let failed = false;
  const retries = createRetries();

  /** Drops a tap that's no longer wanted, on an old element, or deaf. */
  function check(video: HTMLVideoElement | null) {
    const dead = tap?.alive?.() === false;
    if (tap && (!wanted || tap.video !== video || dead)) {
      tap.stop();
      tap = undefined;
      if (dead) {
        retries.died();
      }
    } else if (tap) {
      retries.heard();
    }
  }

  /** Call every tick with the player's current video element. */
  function follow(video: HTMLVideoElement | null) {
    check(video);
    if (!wanted || tap || !video || retries.waiting()) {
      return;
    }
    tap = tryTap(createTap, video);
    failed = tap === undefined;
    retries.tried(!failed);
  }

  function setWanted(on: boolean, video: HTMLVideoElement | null) {
    wanted = on;
    follow(video);
  }

  function audioReport(): AudioReport | undefined {
    if (!tap) {
      return wanted && failed ? { state: "unavailable", envelope: [], end: 0 } : undefined;
    }
    return tapReport(tap);
  }

  function sendClip(request: number, seconds: number) {
    if (tap) {
      const { start, samples } = tap.ring.clip(seconds);
      options.post({ request, start, rate: AUDIO_RATE, pcm: encodePcm(samples) });
    }
  }

  return { follow, setWanted, audioReport, sendClip };
}
