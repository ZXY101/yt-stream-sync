import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";

import type { PlayerStatus } from "../lib/messages.ts";
import { describePlace } from "./format.ts";
import { StreamCard } from "./stream-card.tsx";

interface ThisTabProps {
  /** Streams in the tab the popup was opened from that aren't in the group yet. */
  players: PlayerStatus[];
  /** How many of the tab's streams are already in the group. */
  added: number;
  onAdd: (id: string) => void;
  /** Set while a saved group is open: adds a stream to the sync group and the saved group. */
  onAddToSaved?: (id: string) => void;
}

/** What a saved group can hold: an archive on its watch page (see `isSaveable`). */
function canSave(player: PlayerStatus): boolean {
  return player.kind === "archive" && player.hasStartTime === true;
}

function AddButton({
  player,
  onAdd,
  onAddToSaved,
}: Omit<ThisTabProps, "players" | "added"> & { player: PlayerStatus }) {
  const title = player.title || "this stream";
  if (onAddToSaved && canSave(player)) {
    return (
      <Button
        size="sm"
        onClick={() => onAddToSaved(player.id)}
        aria-label={`Add ${title} to the saved group`}
      >
        <Plus data-icon="inline-start" />
        Add to saved group
      </Button>
    );
  }
  return (
    <Button size="sm" onClick={() => onAdd(player.id)} aria-label={`Add ${title} to sync`}>
      <Plus data-icon="inline-start" />
      Add
    </Button>
  );
}

function message(added: number): string {
  if (added === 0) {
    return "No live stream or archive in this tab.";
  }
  return added === 1
    ? "This tab's stream is in the sync group."
    : "This tab's streams are in the sync group.";
}

/** The stream(s) in the current tab, ready to add to the sync group. */
export function ThisTab({ players, added, onAdd, onAddToSaved }: ThisTabProps) {
  return (
    <section aria-labelledby="this-tab" className="flex flex-col gap-2">
      <h2
        id="this-tab"
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        This tab
      </h2>
      {players.length === 0 ? (
        <p className="text-sm text-muted-foreground">{message(added)}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {players.map((player) => (
            <StreamCard
              key={player.id}
              player={player}
              detail={describePlace(player)}
              actions={<AddButton player={player} onAdd={onAdd} onAddToSaved={onAddToSaved} />}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
