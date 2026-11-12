import { Pencil, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { describeGroup } from "@/components/saved/describe.ts";
import { RenameForm } from "@/components/saved/rename-form.tsx";
import { ThumbnailStack } from "@/components/saved/thumbnail-stack.tsx";

import type { SavedGroupSummary, SavedStatus } from "../lib/messages.ts";
import { formatPosition } from "../popup/format.ts";

/** A saved group is for syncing, so it keeps at least two archives (as the background does). */
const MIN_STREAMS = 2;

export interface SavedGroupActions {
  onOpen: (groupId: string) => void;
  onDelete: (groupId: string) => void;
  onRename: (groupId: string, name: string) => void;
  onRemoveStream: (groupId: string, videoId: string) => void;
}

type Stream = SavedGroupSummary["streams"][number];

function StreamRow({
  stream,
  canRemove,
  onRemove,
}: {
  stream: Stream;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const title = stream.title || stream.videoId;
  return (
    <li className="flex items-center gap-3 py-1.5">
      <ThumbnailStack videoIds={[stream.videoId]} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm" title={title}>
          {title}
        </p>
        <p className="truncate text-xs text-muted-foreground">{stream.channel}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${title} from the group`}
        title={canRemove ? undefined : "A saved group keeps at least two streams"}
        disabled={!canRemove}
        onClick={onRemove}
      >
        <X />
      </Button>
    </li>
  );
}

interface HeaderProps {
  group: SavedGroupSummary;
  isOpen: boolean;
  actions: SavedGroupActions;
}

type HeaderMode = "view" | "rename" | "confirm";

function ConfirmDelete({ group, actions, onKeep }: HeaderProps & { onKeep: () => void }) {
  return (
    <div className="flex flex-1 items-center gap-2">
      <p className="min-w-0 flex-1 truncate text-sm">Delete {group.name}?</p>
      <Button variant="destructive" size="sm" onClick={() => actions.onDelete(group.id)}>
        Delete
      </Button>
      <Button variant="ghost" size="sm" onClick={onKeep}>
        Keep
      </Button>
    </div>
  );
}

function HeaderView({
  group,
  isOpen,
  actions,
  setMode,
}: HeaderProps & { setMode: (mode: HeaderMode) => void }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium" title={group.name}>
            {group.name}
          </p>
          {isOpen && <Badge className="bg-emerald-600 text-white">Playing</Badge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">{describeGroup(group)}</p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Rename ${group.name}`}
        onClick={() => setMode("rename")}
      >
        <Pencil />
      </Button>
      {!isOpen && (
        <Button
          variant="outline"
          size="sm"
          aria-label={`Open ${group.name}`}
          onClick={() => actions.onOpen(group.id)}
        >
          Open
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Delete ${group.name}`}
        onClick={() => setMode("confirm")}
      >
        <X />
      </Button>
    </div>
  );
}

function GroupHeader(props: HeaderProps) {
  const [mode, setMode] = useState<HeaderMode>("view");
  const { group, actions } = props;
  if (mode === "rename") {
    return (
      <RenameForm
        name={group.name}
        onRename={(name) => actions.onRename(group.id, name)}
        onDone={() => setMode("view")}
      />
    );
  }
  if (mode === "confirm") {
    return <ConfirmDelete {...props} onKeep={() => setMode("view")} />;
  }
  return <HeaderView {...props} setMode={setMode} />;
}

function GroupCard({
  group,
  isOpen,
  actions,
}: {
  group: SavedGroupSummary;
  isOpen: boolean;
  actions: SavedGroupActions;
}) {
  const border = isOpen ? "border-2 border-emerald-500/70" : "border";
  return (
    <li className={`flex flex-col gap-2 rounded-xl ${border} bg-card p-3`} aria-label={group.name}>
      <div className="flex items-center gap-3">
        <ThumbnailStack videoIds={group.streams.map((stream) => stream.videoId)} size="md" />
        <GroupHeader group={group} isOpen={isOpen} actions={actions} />
      </div>
      <ul className="divide-y border-t pl-1" aria-label={`Streams in ${group.name}`}>
        {group.streams.map((stream) => (
          <StreamRow
            key={stream.videoId}
            stream={stream}
            canRemove={group.streams.length > MIN_STREAMS}
            onRemove={() => actions.onRemoveStream(group.id, stream.videoId)}
          />
        ))}
      </ul>
    </li>
  );
}

function Empty() {
  return (
    <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
      <p>No saved groups yet.</p>
      <p className="mt-1">
        Add two or more archives to the sync group from the popup (on their watch pages), then click{" "}
        <b>Save this group</b>. Opening a saved group later picks up where you left off, at the same
        offsets.
      </p>
    </div>
  );
}

/** Every saved group, newest first: open, rename, remove a stream, or delete. */
export function SavedGroupsPage({ saved, ...actions }: { saved: SavedStatus } & SavedGroupActions) {
  const open = saved.groups.find((group) => group.id === saved.activeId);
  return (
    <section aria-label="Saved groups" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        A saved group keeps your place and offsets up to date while it&apos;s open. Which streams
        are in it only changes here.
        {open && ` Playing now: ${open.name}, at ${formatPosition(open.position)}.`}
      </p>
      {saved.groups.length === 0 ? (
        <Empty />
      ) : (
        <ul className="flex flex-col gap-3">
          {saved.groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              isOpen={group.id === saved.activeId}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
