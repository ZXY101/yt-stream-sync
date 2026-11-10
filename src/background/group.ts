// Keeps nudges sane even if the user holds a button down for a while.
const MAX_OFFSET = 600;

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
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

  function nudge(id: string, seconds: number) {
    if (has(id)) {
      const next = roundToTenth((offsets.get(id) ?? 0) + seconds);
      offsets.set(id, Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, next)));
    }
  }

  function offset(id: string): number {
    return offsets.get(id) ?? 0;
  }

  return { set, has, ids, remove, nudge, offset, offsets: () => Object.fromEntries(offsets) };
}
