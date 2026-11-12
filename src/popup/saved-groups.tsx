import { Save, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";

import type { SavedGroupSummary, SavedStatus } from "../lib/messages.ts";
import { formatPosition } from "./format.ts";

interface SavedGroupsProps {
  saved: SavedStatus;
  onSave: () => void;
  onOpen: (groupId: string) => void;
  onDelete: (groupId: string) => void;
}

function savedAt(time: number): string {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };
  return new Date(time).toLocaleString(undefined, options);
}

function describeGroup(group: SavedGroupSummary): string {
  const count = group.streams.length;
  const streams = count === 1 ? "1 stream" : `${count} streams`;
  return `${streams} · at ${formatPosition(group.position)} · ${savedAt(group.updatedAt)}`;
}

interface GroupRowProps {
  group: SavedGroupSummary;
  isOpen: boolean;
  onOpen: () => void;
  onDelete: () => void;
}

function ConfirmDelete({ name, onDelete, onKeep }: Record<"name", string> & ConfirmActions) {
  return (
    <li className="flex items-center gap-2 rounded-md border p-2">
      <p className="min-w-0 flex-1 truncate text-sm">Delete {name}?</p>
      <Button variant="destructive" size="xs" onClick={onDelete}>
        Delete
      </Button>
      <Button variant="ghost" size="xs" onClick={onKeep}>
        Keep
      </Button>
    </li>
  );
}

interface ConfirmActions {
  onDelete: () => void;
  onKeep: () => void;
}

function GroupRow({ group, isOpen, onOpen, onDelete }: GroupRowProps) {
  const [confirming, setConfirming] = useState(false);
  if (confirming) {
    return (
      <ConfirmDelete name={group.name} onDelete={onDelete} onKeep={() => setConfirming(false)} />
    );
  }
  const titles = group.streams.map((stream) => stream.title || stream.videoId).join("\n");
  return (
    <li className="flex items-center gap-2 rounded-md border p-2">
      <div className="min-w-0 flex-1" title={titles}>
        <p className="truncate text-sm font-medium">{group.name}</p>
        <p className="truncate text-xs text-muted-foreground">{describeGroup(group)}</p>
      </div>
      {isOpen ? (
        <Badge variant="secondary">Open</Badge>
      ) : (
        <Button variant="outline" size="xs" aria-label={`Open ${group.name}`} onClick={onOpen}>
          Open
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${group.name}`}
        onClick={() => setConfirming(true)}
      >
        <X />
      </Button>
    </li>
  );
}

function Note({ saved }: { saved: SavedStatus }) {
  if (saved.opening > 0) {
    const streams = saved.opening === 1 ? "1 stream" : `${saved.opening} streams`;
    return (
      <p className="text-sm text-muted-foreground">
        Opening: waiting for {streams}. Visit each new tab once so it starts playing.
      </p>
    );
  }
  if (saved.activeId !== undefined) {
    return (
      <p className="text-sm text-muted-foreground">
        This group is saved and keeps your place as you watch.
      </p>
    );
  }
  return null;
}

/** Sync groups saved for later: save the current one, open or delete saved ones. */
export function SavedGroups({ saved, onSave, onOpen, onDelete }: SavedGroupsProps) {
  const showSave = saved.canSave && saved.activeId === undefined;
  if (saved.groups.length === 0 && !showSave) {
    return null;
  }
  return (
    <section aria-labelledby="saved-groups" className="flex flex-col gap-2">
      <h2
        id="saved-groups"
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        Saved groups
      </h2>
      <Note saved={saved} />
      {showSave && (
        <Button variant="outline" size="sm" onClick={onSave}>
          <Save data-icon="inline-start" />
          Save this group
        </Button>
      )}
      {saved.groups.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Saved groups">
          {saved.groups.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              isOpen={group.id === saved.activeId}
              onOpen={() => onOpen(group.id)}
              onDelete={() => onDelete(group.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
