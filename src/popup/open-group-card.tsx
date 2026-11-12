import { Pencil, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { streamCount } from "@/components/saved/describe.ts";
import { RenameForm } from "@/components/saved/rename-form.tsx";
import { ThumbnailStack } from "@/components/saved/thumbnail-stack.tsx";

import type { SavedGroupSummary } from "../lib/messages.ts";

type CardMode = "view" | "rename" | "confirm";

/** Syncing needs two streams: with fewer in the sync group, the group isn't playing. */
const PLAYING_FROM = 2;

/** "2 streams" when all are in the sync group, else "1 of 2 streams open". */
function openCount(group: SavedGroupSummary, inSync: number): string {
  const total = group.streams.length;
  return inSync >= total ? streamCount(group) : `${inSync} of ${total} streams open`;
}

function CardText({
  group,
  mode,
  inSync,
}: {
  group: SavedGroupSummary;
  mode: CardMode;
  inSync: number;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="truncate text-sm font-medium" title={group.name}>
          {group.name}
        </p>
        {mode !== "confirm" && inSync >= PLAYING_FROM && (
          <Badge className="shrink-0 bg-emerald-600 text-white">Playing</Badge>
        )}
      </div>
      <p className="truncate text-xs text-muted-foreground">
        {mode === "confirm" ? "Delete this group?" : openCount(group, inSync)}
      </p>
    </div>
  );
}

function CardButtons({
  name,
  mode,
  setMode,
  onDelete,
}: {
  name: string;
  mode: CardMode;
  setMode: (mode: CardMode) => void;
  onDelete: () => void;
}) {
  if (mode === "confirm") {
    return (
      <>
        <Button variant="destructive" size="xs" onClick={onDelete}>
          Delete
        </Button>
        <Button variant="ghost" size="xs" onClick={() => setMode("view")}>
          Keep
        </Button>
      </>
    );
  }
  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Rename ${name}`}
        onClick={() => setMode("rename")}
      >
        <Pencil />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${name}`}
        onClick={() => setMode("confirm")}
      >
        <X />
      </Button>
    </>
  );
}

/** The saved group being watched: its place and offsets are kept as you watch. */
export function OpenGroupCard({
  group,
  inSync,
  onRename,
  onDelete,
}: {
  group: SavedGroupSummary;
  /** How many of its streams are in the sync group. */
  inSync: number;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [mode, setMode] = useState<CardMode>("view");
  const border = inSync >= PLAYING_FROM ? "border-emerald-500/70" : "border-border";
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border-2 ${border} bg-card p-2`}
      aria-label={`Open saved group ${group.name}`}
    >
      <ThumbnailStack videoIds={group.streams.map((stream) => stream.videoId)} size="md" />
      {mode === "rename" ? (
        <RenameForm name={group.name} onRename={onRename} onDone={() => setMode("view")} />
      ) : (
        <>
          <CardText group={group} mode={mode} inSync={inSync} />
          <CardButtons name={group.name} mode={mode} setMode={setMode} onDelete={onDelete} />
        </>
      )}
    </div>
  );
}
