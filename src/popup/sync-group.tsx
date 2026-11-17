import { X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert.tsx";
import { Button } from "@/components/ui/button.tsx";

import type { PlayerStatus } from "../lib/messages.ts";
import { describePlace, describeSync, lowLatencyGap } from "./format.ts";
import { LowLatencyNote } from "./low-latency-note.tsx";
import { NudgeButtons } from "./nudge-buttons.tsx";
import { StreamCard } from "./stream-card.tsx";
import { Waveform } from "./waveform.tsx";

interface SyncGroupProps {
  members: PlayerStatus[];
  mixed: boolean;
  /** Draw each stream's waveform, all ending at `now` (wall-clock ms). */
  waveformsAt?: number;
  onRemove: (id: string) => void;
  onNudge: (id: string, seconds: number) => void;
  onClear: () => void;
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

function HearingNote({ hearing }: { hearing: PlayerStatus["hearing"] }) {
  if (hearing !== "blocked" && hearing !== "unavailable") {
    return null;
  }
  const text =
    hearing === "blocked"
      ? "Click once inside this stream's video so the add-on can hear it."
      : "Can't hear this stream yet; trying again.";
  return <p className="mt-1 text-xs text-destructive">{text}</p>;
}

interface MemberCardProps {
  player: PlayerStatus;
  /** Seconds a low-latency stream stays ahead of the group, 0 if none. */
  gap: number;
  waveformsAt: number | undefined;
  onRemove: () => void;
  onNudge: (seconds: number) => void;
}

function MemberCard({ player, gap, waveformsAt, onRemove, onNudge }: MemberCardProps) {
  const title = player.title || "Untitled stream";
  return (
    <StreamCard
      player={player}
      detail={`${describePlace(player)} · ${describeSync(player, gap)}`}
      actions={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Remove ${title} from sync`}
          onClick={onRemove}
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
      <HearingNote hearing={player.hearing} />
      {waveformsAt !== undefined && <Waveform waveform={player.waveform} now={waveformsAt} />}
      <NudgeButtons title={title} offset={player.offset} onNudge={onNudge} />
    </StreamCard>
  );
}

/** The streams the user added, with what the sync does to each. */
export function SyncGroup(props: SyncGroupProps) {
  const { members, mixed, waveformsAt, onRemove, onNudge } = props;
  const gap = mixed ? 0 : lowLatencyGap(members);
  return (
    <section aria-labelledby="sync-group" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2
          id="sync-group"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Sync group
        </h2>
        {members.length > 0 && (
          <Button variant="ghost" size="xs" onClick={props.onClear}>
            Clear
          </Button>
        )}
      </div>
      {members.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Streams in sync">
          {members.map((player) => (
            <MemberCard
              key={player.id}
              player={player}
              gap={gap}
              waveformsAt={waveformsAt}
              onRemove={() => onRemove(player.id)}
              onNudge={(seconds) => onNudge(player.id, seconds)}
            />
          ))}
        </ul>
      )}
      <Hint members={members} mixed={mixed} />
      {!mixed && <LowLatencyNote members={members} />}
    </section>
  );
}
