import { RotateCcw, Save } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { describeGroup } from "@/components/saved/describe.ts";
import { ThumbnailStack } from "@/components/saved/thumbnail-stack.tsx";

import type { SavedGroupSummary, SavedStatus } from "../lib/messages.ts";
import { OpenGroupCard } from "./open-group-card.tsx";

// The popup shows the newest few; the saved groups page has them all.
const RECENT = 3;

interface SavedGroupsProps {
  saved: SavedStatus;
  /** Whether the sync group has any streams. */
  hasMembers: boolean;
  onSave: () => void;
  onOpen: (groupId: string) => void;
  onDelete: (groupId: string) => void;
  onRename: (groupId: string, name: string) => void;
  /** Opens the saved groups page. */
  onManage: () => void;
}

function Heading() {
  return (
    <h2
      id="saved-groups"
      className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
    >
      Saved groups
    </h2>
  );
}

function ManageLink({ label, onManage }: { label: string; onManage: () => void }) {
  return (
    <Button variant="link" size="xs" className="self-start px-0" onClick={onManage}>
      {label}
    </Button>
  );
}

function OpeningNote({ opening }: { opening: number }) {
  if (opening === 0) {
    return null;
  }
  const streams = opening === 1 ? "1 stream" : `${opening} streams`;
  return <p className="text-sm text-muted-foreground">Opening: waiting for {streams}.</p>;
}

function RecentRow({ group, onOpen }: { group: SavedGroupSummary; onOpen: () => void }) {
  const titles = group.streams.map((stream) => stream.title || stream.videoId).join("\n");
  return (
    <li className="flex items-center gap-2 rounded-md border p-2">
      <ThumbnailStack videoIds={group.streams.map((stream) => stream.videoId)} />
      <div className="min-w-0 flex-1" title={titles}>
        <p className="truncate text-sm font-medium">{group.name}</p>
        <p className="truncate text-xs text-muted-foreground">{describeGroup(group)}</p>
      </div>
      <Button variant="outline" size="xs" aria-label={`Open ${group.name}`} onClick={onOpen}>
        Open
      </Button>
    </li>
  );
}

function OpenGroupSection({ open, ...props }: SavedGroupsProps & { open: SavedGroupSummary }) {
  return (
    <section aria-labelledby="saved-groups" className="flex flex-col gap-2">
      <Heading />
      <OpeningNote opening={props.saved.opening} />
      <OpenGroupCard
        group={open}
        inSync={props.saved.inSync}
        onRename={(name) => props.onRename(open.id, name)}
        onDelete={() => props.onDelete(open.id)}
      />
      {props.saved.opening === 0 && props.saved.inSync < open.streams.length && (
        <Button variant="outline" size="sm" onClick={() => props.onOpen(open.id)}>
          <RotateCcw data-icon="inline-start" />
          Reopen closed streams
        </Button>
      )}
      <ManageLink label="Manage saved groups" onManage={props.onManage} />
    </section>
  );
}

function SaveSection({ saved, onSave, onManage }: SavedGroupsProps) {
  return (
    <section aria-labelledby="saved-groups" className="flex flex-col gap-2">
      <Heading />
      {saved.canSave && (
        <Button variant="outline" size="sm" onClick={onSave}>
          <Save data-icon="inline-start" />
          Save this group
        </Button>
      )}
      <ManageLink label="Saved groups" onManage={onManage} />
    </section>
  );
}

function RecentSection({ saved, onOpen, onManage }: SavedGroupsProps) {
  const all = saved.groups.length;
  return (
    <section aria-labelledby="saved-groups" className="flex flex-col gap-2">
      <Heading />
      <ul className="flex flex-col gap-2" aria-label="Recent saved groups">
        {saved.groups.slice(0, RECENT).map((group) => (
          <RecentRow key={group.id} group={group} onOpen={() => onOpen(group.id)} />
        ))}
      </ul>
      <ManageLink label={all > RECENT ? `View all ${all}` : "View all"} onManage={onManage} />
    </section>
  );
}

/**
 * Saved groups in the popup, depending on what's going on: watching a saved group shows that
 * group; an unsaved sync group can be saved; with no sync group, the newest saved groups can be
 * opened. Everything else (all groups, editing them) is on the saved groups page.
 */
export function SavedGroups(props: SavedGroupsProps) {
  const { saved, hasMembers } = props;
  const open = saved.groups.find((group) => group.id === saved.activeId);
  if (open) {
    return <OpenGroupSection {...props} open={open} />;
  }
  if (hasMembers) {
    const nothingToShow = !saved.canSave && saved.groups.length === 0;
    return nothingToShow ? null : <SaveSection {...props} />;
  }
  return saved.groups.length === 0 ? null : <RecentSection {...props} />;
}
