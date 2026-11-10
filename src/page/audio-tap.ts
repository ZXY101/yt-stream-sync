import { decimate } from "../audio/pcm.ts";
import { AUDIO_RATE, createAudioRing } from "../audio/ring.ts";

type CapturableVideo = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

export type TapState = "listening" | "blocked";

/**
 * Listens to a video element's audio (its captured stream, which carries sound even when the
 * player is muted) into a ring buffer at 4 kHz. Not unit-tested: it is only browser wiring;
 * the buffer logic lives in `audio/ring.ts`.
 */
export function createAudioTap(video: CapturableVideo) {
  const ring = createAudioRing();
  const capture = video.captureStream ?? video.mozCaptureStream;
  const context = new AudioContext();
  const source = context.createMediaStreamSource((capture as () => MediaStream).call(video));
  // ScriptProcessorNode is deprecated but needs no module file, which YouTube's CSP would block.
  const processor = context.createScriptProcessor(4096, 1, 1);
  const factor = Math.round(context.sampleRate / AUDIO_RATE);

  /** Wall-clock ms at which `contextTime` (audio clock) plays. */
  function wallAt(contextTime: number): number {
    const stamp = context.getOutputTimestamp();
    const lead = (contextTime - (stamp.contextTime ?? 0)) * 1000;
    return performance.timeOrigin + (stamp.performanceTime ?? 0) + lead;
  }

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer;
    ring.push(
      decimate(input.getChannelData(0), factor),
      wallAt(event.playbackTime + input.duration),
    );
  };
  source.connect(processor);
  // The processor writes nothing, so this only keeps it running; the video plays as before.
  processor.connect(context.destination);
  void context.resume();

  function state(): TapState {
    return context.state === "running" ? "listening" : "blocked";
  }

  function stop() {
    processor.disconnect();
    source.disconnect();
    void context.close();
  }

  return { ring, state, stop, video };
}

export function canTap(video: HTMLVideoElement): boolean {
  const capturable = video as CapturableVideo;
  return typeof (capturable.captureStream ?? capturable.mozCaptureStream) === "function";
}
