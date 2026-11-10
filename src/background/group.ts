/**
 * The players the user opted in. Opting in is per video: a frame that moves on to another
 * video is no longer a member.
 */
export function createGroup(currentVideo: (id: string) => string | undefined) {
  // Player id → the video id the user opted in.
  const members = new Map<string, string>();

  function set(id: string, inGroup: boolean) {
    const videoId = currentVideo(id);
    if (inGroup && videoId !== undefined) {
      members.set(id, videoId);
    } else {
      members.delete(id);
    }
  }

  function has(id: string): boolean {
    return members.get(id) === currentVideo(id);
  }

  /** Current members; drops those whose frame moved on. */
  function ids(): string[] {
    for (const id of members.keys()) {
      if (!has(id)) {
        members.delete(id);
      }
    }
    return [...members.keys()];
  }

  return { set, has, ids, remove: (id: string) => members.delete(id) };
}
