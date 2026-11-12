import type { SavedGroupSummary } from "../../lib/messages.ts";
import { formatPosition } from "../../popup/format.ts";

export function streamCount(group: Pick<SavedGroupSummary, "streams">): string {
  const count = group.streams.length;
  return count === 1 ? "1 stream" : `${count} streams`;
}

export function savedAt(time: number): string {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  return new Date(time).toLocaleString(undefined, options);
}

/** "2 streams · at 1:15:21 · Nov 12, 14:03" */
export function describeGroup(group: SavedGroupSummary): string {
  return `${streamCount(group)} · at ${formatPosition(group.position)} · ${savedAt(group.updatedAt)}`;
}
