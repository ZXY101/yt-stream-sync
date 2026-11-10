import { decodePcm } from "../audio/pcm.ts";
import { createAudioRing } from "../audio/ring.ts";
import type { AudioClip } from "../lib/messages.ts";
import { createListener } from "./listener.ts";

type CapturableVideo = HTMLVideoElement & { captureStream?: () => MediaStream };

function capturable(): HTMLVideoElement {
  const video = document.createElement("video") as CapturableVideo;
  video.captureStream = () => ({}) as MediaStream;
  return video;
}

function setup() {
  const clips: AudioClip[] = [];
  const taps: { video: HTMLVideoElement; stop: () => void }[] = [];
  const listener = createListener({
    post: (clip) => clips.push(clip),
    createTap: (video) => {
      const tap = {
        ring: createAudioRing(),
        state: () => "listening" as const,
        stop: vi.fn<() => void>(),
        video,
      };
      tap.ring.push(new Float32Array(400).fill(0.25), 5000);
      taps.push(tap);
      return tap;
    },
  });
  return { listener, clips, taps };
}

describe("listener", () => {
  it("listens only while wanted", () => {
    const { listener, taps } = setup();
    const video = capturable();

    listener.follow(video);
    expect(taps).toHaveLength(0);
    listener.setWanted(true, video);
    listener.follow(video);
    listener.setWanted(false, video);

    expect(taps).toHaveLength(1);
    expect(taps[0]?.stop).toHaveBeenCalledOnce();
    expect(listener.audioReport()).toBeUndefined();
  });

  it("moves to a new video element when YouTube swaps it", () => {
    const { listener, taps } = setup();
    listener.setWanted(true, capturable());

    listener.follow(capturable());

    expect(taps).toHaveLength(2);
    expect(taps[0]?.stop).toHaveBeenCalledOnce();
  });

  it("can't listen to a video without captureStream", () => {
    const { listener, taps } = setup();

    listener.setWanted(true, document.createElement("video"));

    expect(taps).toHaveLength(0);
  });

  it("reports loudness and sends clips that were asked for", () => {
    const { listener, clips } = setup();
    listener.setWanted(true, capturable());

    const report = listener.audioReport();
    listener.sendClip(7, 1);

    expect(report).toEqual({ state: "listening", envelope: [0.25, 0.25], end: 5000 });
    expect(clips[0]).toMatchObject({ request: 7, rate: 4000, start: 4900 });
    expect(decodePcm(clips[0]?.pcm ?? "")).toHaveLength(400);
  });

  it("ignores clip requests while not listening", () => {
    const { listener, clips } = setup();

    listener.sendClip(1, 5);

    expect(clips).toEqual([]);
  });

  it("carries on without audio when listening fails, says so, and tries again later", () => {
    let attempts = 0;
    const listener = createListener({
      post: vi.fn<(clip: AudioClip) => void>(),
      createTap: (video) => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("no audio track yet");
        }
        return {
          ring: createAudioRing(),
          state: () => "listening" as const,
          stop: vi.fn<() => void>(),
          video,
        };
      },
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const video = capturable();

    listener.setWanted(true, video);
    listener.follow(video);

    expect(listener.audioReport()).toEqual({ state: "unavailable", envelope: [], end: 0 });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    for (let step = 0; step < 6; step += 1) {
      listener.follow(video);
    }
    expect(attempts).toBe(2);
    expect(listener.audioReport()?.state).toBe("listening");
  });
});
