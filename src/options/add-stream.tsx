import { Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { ThumbnailStack } from "@/components/saved/thumbnail-stack.tsx";

import { parseVideoId } from "../lib/video-id.ts";

/** An archive open in a tab (on its watch page), offered for adding with one click. */
export interface OpenArchive {
  videoId: string;
  title: string;
  channel: string;
}

interface AddStreamProps {
  /** Open archives that aren't in the group yet. */
  open: OpenArchive[];
  onAdd: (videoId: string) => void;
}

function OpenTabs({ open, onAdd }: AddStreamProps) {
  if (open.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-muted-foreground">Open in your tabs:</p>
      <ul className="flex flex-col gap-1" aria-label="Archives open in your tabs">
        {open.map((archive) => (
          <li key={archive.videoId} className="flex items-center gap-2">
            <ThumbnailStack videoIds={[archive.videoId]} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{archive.title || archive.videoId}</p>
              <p className="truncate text-xs text-muted-foreground">{archive.channel}</p>
            </div>
            <Button
              variant="outline"
              size="xs"
              aria-label={`Add ${archive.title || archive.videoId}`}
              onClick={() => onAdd(archive.videoId)}
            >
              <Plus data-icon="inline-start" />
              Add
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LinkForm({ onAdd }: Pick<AddStreamProps, "onAdd">) {
  const [text, setText] = useState("");
  const [invalid, setInvalid] = useState(false);
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const videoId = parseVideoId(text);
        setInvalid(videoId === undefined);
        if (videoId !== undefined) {
          onAdd(videoId);
          setText("");
        }
      }}
    >
      <Input
        aria-label="YouTube link or video id"
        placeholder="Paste a YouTube link or video id"
        value={text}
        aria-invalid={invalid}
        className="h-8"
        onChange={(event) => {
          setText(event.target.value);
          setInvalid(false);
        }}
      />
      <Button type="submit" size="sm" disabled={text.trim() === ""}>
        Add
      </Button>
    </form>
  );
}

/** Adds an archive to a saved group: pasted, or one already open in a tab. */
export function AddStream({ open, onAdd }: AddStreamProps) {
  const [adding, setAdding] = useState(false);
  if (!adding) {
    return (
      <Button variant="outline" size="xs" className="self-start" onClick={() => setAdding(true)}>
        <Plus data-icon="inline-start" />
        Add stream
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed p-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Add a stream</p>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close add stream"
          onClick={() => setAdding(false)}
        >
          <X />
        </Button>
      </div>
      <LinkForm onAdd={onAdd} />
      <OpenTabs open={open} onAdd={onAdd} />
      <p className="text-xs text-muted-foreground">
        Archives only (finished streams). A new stream lines up by its broadcast start; fine-tune
        its offset after.
      </p>
    </div>
  );
}
