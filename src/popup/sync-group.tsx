import { X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";

import type { PlayerStatus } from "../lib/messages.ts";
import { describePlace, describeSync } from "./format.ts";
import { NudgeButtons } from "./nudge-buttons.tsx";
import { StreamCard } from "./stream-card.tsx";

interface SyncGroupProps {
  members: PlayerStatus[];
  mixed: boolean;
  onRemove: (id: string) => void;
  onNudge: (id: string, seconds: number) => void;
}

function Hint({ members, mixed }: Pick<SyncGroupProps, "members" | "mixed">) {
  if (mixed) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Live streams and archives can&apos;t be synced together. Remove one kind.
        </AlertDescription>
      </Alert>
    );
  }
  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Add the streams you want to keep in sync.</p>
    );
  }
  if (members.length === 1) {
    return (
      <p className="text-sm text-muted-foreground">
        Now open the other stream&apos;s tab and add it too.
      </p>
    );
  }
  return null;
}

/** The streams the user added, with what the sync does to each. */
export function SyncGroup({ members, mixed, onRemove, onNudge }: SyncGroupProps) {
  return (
    <section aria-labelledby="sync-group" className="flex flex-col gap-2">
      <h2
        id="sync-group"
        className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
      >
        Sync group
      </h2>
      {members.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Streams in sync">
          {members.map((player) => {
            const title = player.title || "Untitled stream";
            return (
              <StreamCard
                key={player.id}
                player={player}
                detail={`${describePlace(player)} · ${describeSync(player)}`}
                actions={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Remove ${title} from sync`}
                    onClick={() => onRemove(player.id)}
                  >
                    <X />
                  </Button>
                }
              >
                {player.kind === "archive" && !player.hasStartTime && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    No start time in embeds: aligned as it was when added.
                  </p>
                )}
                <NudgeButtons
                  title={title}
                  offset={player.offset}
                  onNudge={(seconds) => onNudge(player.id, seconds)}
                />
              </StreamCard>
            );
          })}
        </ul>
      )}
      <Hint members={members} mixed={mixed} />
    </section>
  );
}
