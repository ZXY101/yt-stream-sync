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
export function ThisTab({ players, added, onAdd }: ThisTabProps) {
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
              actions={
                <Button
                  size="sm"
                  onClick={() => onAdd(player.id)}
                  aria-label={`Add ${player.title || "this stream"} to sync`}
                >
                  <Plus data-icon="inline-start" />
                  Add
                </Button>
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}
