/** An archive in the sync group, as alignment sees it. */
export interface AlignMember {
  id: string;
  /** The watch page link sent to yt-dlp-z. */
  url: string;
  /** Broadcast start, Unix seconds. */
  startTime: number;
  /** The member's current offset in the sync group (seconds). */
  offset: number;
}

export function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/**
 * The sync-group offsets that line the members up, from yt-dlp-z's lags (seconds each link's
 * content is later than the first link's). Archives sync by broadcast time, where a member
 * shows `moment − startTime + offset`, so a member whose content is `lag` seconds later than
 * the reference's needs `lag − (reference start − its start) + reference offset`.
 */
export function alignedOffsets(members: AlignMember[], lags: Record<string, number | null>) {
  const [reference, ...others] = members;
  const targets: Record<string, number> = {};
  const unmatched: string[] = [];
  if (!reference) {
    return { targets, unmatched };
  }
  for (const member of others) {
    const lag = lags[member.url];
    if (typeof lag !== "number") {
      unmatched.push(member.id);
      continue;
    }
    const startGap = reference.startTime - member.startTime;
    targets[member.id] = lag - startGap + reference.offset;
  }
  return { targets, unmatched };
}
