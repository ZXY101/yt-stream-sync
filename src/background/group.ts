// Keeps nudges sane even if the user holds a button down for a while.
const MAX_OFFSET = 600;

// Keeps sums of ±0.1 nudges free of float dust (0.30000000000000004).
function roundToMillisecond(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * The players the user opted in, and their nudges. Opting in is per video: a frame that
 * moves on to another video is no longer a member. Leaving the group clears the nudge.
 */
export function createGroup(currentVideo: (id: string) => string | undefined) {
  // Player id → the video id the user opted in.
  const members = new Map<string, string>();
  const offsets = new Map<string, number>();

  function remove(id: string) {
    members.delete(id);
    offsets.delete(id);
  }

  function set(id: string, inGroup: boolean) {
    const videoId = currentVideo(id);
    if (inGroup && videoId !== undefined) {
      members.set(id, videoId);
    } else {
      remove(id);
    }
  }

  function has(id: string): boolean {
    return members.has(id) && members.get(id) === currentVideo(id);
  }

  /** Current members; drops those whose frame moved on. */
  function ids(): string[] {
    for (const id of members.keys()) {
      if (!has(id)) {
        remove(id);
      }
    }
    return [...members.keys()];
  }

  /** Moves a member's offset by `seconds` (the user's nudge, or an audio match). */
  function nudge(id: string, seconds: number) {
    if (has(id)) {
      const next = roundToMillisecond((offsets.get(id) ?? 0) + seconds);
      offsets.set(id, Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, next)));
    }
  }

  function offset(id: string): number {
    return offsets.get(id) ?? 0;
  }

  function clear() {
    [...members.keys()].forEach((id) => remove(id));
  }

  return {
    set,
    has,
    ids,
    remove,
    clear,
    nudge,
    offset,
    offsets: () => Object.fromEntries(offsets),
  };
}
