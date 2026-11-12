import { ExternalLink, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { ThumbnailStack } from "@/components/saved/thumbnail-stack.tsx";

import { savedAt } from "@/components/saved/describe.ts";

import type { SavedGroupSummary, SavedStreamSummary } from "../lib/messages.ts";
import { formatPosition } from "../popup/format.ts";
import { OffsetField } from "../popup/nudge-buttons.tsx";
import type { SavedGroupActions } from "./saved-groups-page.tsx";

/** A saved group is for syncing, so it keeps at least two archives (as the background does). */
const MIN_STREAMS = 2;

interface GroupDetailsProps {
  group: SavedGroupSummary;
  isOpen: boolean;
  actions: SavedGroupActions;
  addable: number;
}

const VIDEO_ID = /^[\w-]{11}$/;

interface StreamRowProps {
  stream: SavedStreamSummary;
  canRemove: boolean;
  onSetOffset: (offset: number) => void;
  onRemove: () => void;
}

/** The video on YouTube at the place the group would open it. */
function watchUrl(stream: SavedStreamSummary): string | undefined {
  if (!VIDEO_ID.test(stream.videoId)) {
    return undefined;
  }
  return `https://www.youtube.com/watch?v=${stream.videoId}&t=${Math.floor(stream.position)}s`;
}

function StreamTitle({ stream }: { stream: SavedStreamSummary }) {
  const title = stream.title || stream.videoId;
  const url = watchUrl(stream);
  if (!url) {
    return <p className="truncate text-sm">{title}</p>;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="group/link flex min-w-0 items-center gap-1 text-sm hover:underline"
      title={`${title}\nOpen on YouTube at ${formatPosition(stream.position)}`}
    >
      <span className="truncate">{title}</span>
      <ExternalLink className="size-3 shrink-0 opacity-0 group-hover/link:opacity-60" />
    </a>
  );
}

/** One archive of a saved group: linked title, place, editable offset. */
function StreamRow({ stream, canRemove, onSetOffset, onRemove }: StreamRowProps) {
  const title = stream.title || stream.videoId;
  return (
    <li className="flex items-center gap-3 py-2">
      <ThumbnailStack videoIds={[stream.videoId]} />
      <div className="min-w-0 flex-1">
        <StreamTitle stream={stream} />
        <p className="truncate text-xs text-muted-foreground">
          {stream.channel} · at {formatPosition(stream.position)}
        </p>
      </div>
      <OffsetField title={title} offset={stream.offset} onSet={onSetOffset} />
      {canRemove && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${title} from the group`}
          onClick={onRemove}
        >
          <X />
        </Button>
      )}
    </li>
  );
}

/** An opened group: its streams, and adding the sync group's new ones. */
export function GroupDetails({ group, isOpen, actions, addable }: GroupDetailsProps) {
  const canRemove = group.streams.length > MIN_STREAMS;
  const streams = addable === 1 ? "1 stream" : `${addable} streams`;
  return (
    <div className="flex flex-col gap-2 border-t pt-1">
      <ul className="divide-y" aria-label={`Streams in ${group.name}`}>
        {group.streams.map((stream) => (
          <StreamRow
            key={stream.videoId}
            stream={stream}
            canRemove={canRemove}
            onSetOffset={(offset) => actions.onSetOffset(group.id, stream.videoId, offset)}
            onRemove={() => actions.onRemoveStream(group.id, stream.videoId)}
          />
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="flex-1">
          Offsets line each stream up on top of its broadcast start. Saved{" "}
          {savedAt(group.updatedAt)}.{!canRemove && " A group keeps at least two streams."}
        </span>
        {isOpen && addable > 0 && (
          <Button variant="outline" size="xs" onClick={() => actions.onAddStreams(group.id)}>
            <Plus data-icon="inline-start" />
            Add {streams} to the saved group
          </Button>
        )}
      </div>
    </div>
  );
}
