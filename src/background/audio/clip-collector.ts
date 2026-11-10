import { decodePcm } from "../../audio/pcm.ts";
import type { Clip } from "../../audio/ring.ts";
import type { AudioClip, PlayerCommand } from "../../lib/messages.ts";

export interface CollectedClips {
  key: string;
  reference: string;
  clips: Record<string, Clip>;
}

interface Pending extends CollectedClips {
  request: number;
  ids: string[];
  asked: number;
}

/** Asks a group's players for their last seconds of audio and gathers the answers. */
export function createClipCollector(
  send: (id: string, command: PlayerCommand) => void,
  now: () => number,
) {
  let pending: Pending | undefined;
  let nextRequest = 1;

  function ask(request: { key: string; ids: string[]; reference: string; seconds: number }) {
    const { key, ids, reference, seconds } = request;
    const id = nextRequest++;
    pending = { request: id, key, ids, reference, clips: {}, asked: now() };
    ids.forEach((player) => send(player, { type: "clip", request: id, seconds }));
  }

  /** Stores a clip; returns all of them once every player has answered. */
  function receive(id: string, clip: AudioClip): CollectedClips | undefined {
    if (!pending || clip.request !== pending.request || !pending.ids.includes(id)) {
      return undefined;
    }
    pending.clips[id] = { start: clip.start, samples: decodePcm(clip.pcm) };
    const complete = pending.ids.every((player) => pending?.clips[player]);
    return complete ? pending : undefined;
  }

  /** Seconds since this group's request went out, if one is out. */
  function waitingFor(key: string): number | undefined {
    return pending?.key === key ? now() - pending.asked : undefined;
  }

  return { ask, receive, waitingFor, clear: () => (pending = undefined) };
}
