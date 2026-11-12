import { ChevronRight, Pencil, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { describeGroup } from "@/components/saved/describe.ts";
import { RenameForm } from "@/components/saved/rename-form.tsx";
import { ThumbnailStack } from "@/components/saved/thumbnail-stack.tsx";

import type { SavedGroupSummary, SavedStatus } from "../lib/messages.ts";
import type { OpenArchive } from "./add-stream.tsx";
import { GroupDetails } from "./group-details.tsx";

export interface SavedGroupActions {
  onOpen: (groupId: string) => void;
  onDelete: (groupId: string) => void;
  onRename: (groupId: string, name: string) => void;
  onRemoveStream: (groupId: string, videoId: string) => void;
  onSetOffset: (groupId: string, videoId: string, offset: number) => void;
  onAddStream: (groupId: string, videoId: string) => void;
}

interface GroupProps {
  group: SavedGroupSummary;
  /** The sync group was opened from (or saved as) this group. */
  isOpen: boolean;
  /** How many of its streams are in the sync group (0 unless it's open). */
  inSync: number;
  actions: SavedGroupActions;
}

/** Syncing needs two streams: with fewer in the sync group, the group isn't playing. */
function isPlaying({ isOpen, inSync }: Pick<GroupProps, "isOpen" | "inSync">): boolean {
  return isOpen && inSync >= 2;
}

/** Open, or the open group with some of its tabs closed. */
function canOpen({ group, isOpen, inSync }: GroupProps): boolean {
  return !isOpen || inSync < group.streams.length;
}

function ConfirmDelete({ group, actions, onKeep }: GroupProps & { onKeep: () => void }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2" title={group.name}>
      <p className="min-w-0 flex-1 truncate text-sm">Delete this group?</p>
      <Button variant="destructive" size="sm" onClick={() => actions.onDelete(group.id)}>
        Delete
      </Button>
      <Button variant="ghost" size="sm" onClick={onKeep}>
        Keep
      </Button>
    </div>
  );
}

type HeaderMode = "view" | "rename" | "confirm";

function Summary({
  group,
  isOpen,
  inSync,
  expanded,
  onToggle,
}: Omit<GroupProps, "actions"> & { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="flex min-w-0 flex-1 items-center gap-3 text-left"
      aria-expanded={expanded}
      aria-label={`${expanded ? "Hide" : "Show"} streams of ${group.name}`}
      onClick={onToggle}
    >
      <ChevronRight
        className={`size-4 shrink-0 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
      />
      <ThumbnailStack videoIds={group.streams.map((stream) => stream.videoId)} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium" title={group.name}>
            {group.name}
          </span>
          {isPlaying({ isOpen, inSync }) && (
            <Badge className="bg-emerald-600 text-white">Playing</Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{describeGroup(group)}</p>
      </div>
    </button>
  );
}

function HeaderButtons(props: GroupProps & { setMode: (mode: HeaderMode) => void }) {
  const { group, isOpen, actions, setMode } = props;
  const label = isOpen ? "Reopen" : "Open";
  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Rename ${group.name}`}
        onClick={() => setMode("rename")}
      >
        <Pencil />
      </Button>
      {canOpen(props) && (
        <Button
          variant="outline"
          size="sm"
          aria-label={`${label} ${group.name}`}
          onClick={() => actions.onOpen(group.id)}
        >
          {label}
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
    </>
  );
}

function GroupHeader(props: GroupProps & { expanded: boolean; onToggle: () => void }) {
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
  return (
    <>
      <Summary {...props} />
      <HeaderButtons {...props} setMode={setMode} />
    </>
  );
}

function GroupCard(props: GroupProps & { openArchives: OpenArchive[] }) {
  const [expanded, setExpanded] = useState(false);
  const border = isPlaying(props) ? "border-2 border-emerald-500/70" : "border";
  return (
    <li
      className={`flex flex-col gap-2 rounded-xl ${border} bg-card p-3`}
      aria-label={props.group.name}
    >
      <div className="flex items-center gap-2">
        <GroupHeader {...props} expanded={expanded} onToggle={() => setExpanded((open) => !open)} />
      </div>
      {expanded && <GroupDetails {...props} />}
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

/** Every saved group, newest first, each opening to its streams, offsets and places. */
export function SavedGroupsPage({
  saved,
  openArchives,
  ...actions
}: { saved: SavedStatus; openArchives: OpenArchive[] } & SavedGroupActions) {
  return (
    <section aria-label="Saved groups" className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        A saved group keeps your place and offsets up to date while it&apos;s open. Which streams
        are in it only changes here.
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
              inSync={group.id === saved.activeId ? saved.inSync : 0}
              openArchives={openArchives}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
