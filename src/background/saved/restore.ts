import type { PlayerStatus } from "../../lib/messages.ts";
import { isSaveable } from "./snapshot.ts";
import type { SavedMember } from "./stored.ts";

// A tab that hasn't reported its player by then (closed, a removed video) is given up on.
const OPEN_TIMEOUT_MS = 120_000;

export interface RestoreOptions {
  setInGroup: (id: string, inGroup: boolean) => void;
  setOffset: (id: string, offset: number) => void;
  /** Wall-clock milliseconds. */
  now: () => number;
}

interface Wanted {
  offset: number;
  until: number;
}

/**
 * Puts a saved group's archives back in the sync group as their players turn up: each joins
 * with its saved offset once its watch page reports the video (and its start time).
 */
export function createRestore(options: RestoreOptions) {
  const pending = new Map<string, Wanted>();

  function expect(members: SavedMember[]) {
    pending.clear();
    const until = options.now() + OPEN_TIMEOUT_MS;
    for (const member of members) {
      pending.set(member.videoId, { offset: member.offset, until });
    }
  }

  function join(player: PlayerStatus, wanted: Wanted) {
    options.setInGroup(player.id, true);
    options.setOffset(player.id, wanted.offset);
    pending.delete(player.videoId);
  }

  function tick(players: PlayerStatus[]) {
    for (const player of players) {
      const wanted = pending.get(player.videoId);
      if (wanted && !player.inGroup && isSaveable(player)) {
        join(player, wanted);
      }
    }
    const now = options.now();
    for (const [videoId, wanted] of pending) {
      if (wanted.until < now) {
        pending.delete(videoId);
      }
    }
  }

  return { expect, tick, clear: () => pending.clear(), waiting: () => pending.size };
}
