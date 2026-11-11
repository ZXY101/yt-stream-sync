import { Button } from "@/components/ui/button.tsx";
import { Progress } from "@/components/ui/progress.tsx";

import type { AlignStatus, PlayerStatus, SyncStatus } from "../lib/messages.ts";

interface AlignPanelProps {
  status: SyncStatus;
  members: PlayerStatus[];
  onAlign: () => void;
  onCancel: () => void;
}

/** Offered once the user set up yt-dlp-z, for a group of two or more archives. */
function canAlign(status: SyncStatus, members: PlayerStatus[]): boolean {
  const archives = members.every((player) => player.kind === "archive");
  return status.align.state !== "off" && !status.mixed && members.length >= 2 && archives;
}

function unmatchedNames(status: AlignStatus, members: PlayerStatus[]): string {
  if (status.state !== "done") {
    return "";
  }
  const titles = members
    .filter((player) => status.unmatched.includes(player.id))
    .map((player) => player.title || "Untitled stream");
  return titles.join(", ");
}

function Running({ progress, onCancel }: { progress: number; onCancel: () => void }) {
  return (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <output className="flex-1">
          yt-dlp-z is downloading and comparing the audio. This takes a minute or two.
        </output>
        <Button variant="outline" size="xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <Progress value={progress * 100} aria-label="Alignment progress" />
    </>
  );
}

function Outcome({ status, members }: { status: AlignStatus; members: PlayerStatus[] }) {
  if (status.state === "failed") {
    return <output className="text-xs text-destructive">{status.message}</output>;
  }
  if (status.state !== "done") {
    return null;
  }
  const missing = unmatchedNames(status, members);
  const text = missing ? `Aligned, except: ${missing} (no reliable match).` : "Aligned.";
  return <output className="text-xs text-muted-foreground">{text}</output>;
}

/** Lining the group's archives up through the user's yt-dlp-z (set up in the settings). */
export function AlignPanel(props: AlignPanelProps) {
  const { members, onAlign, onCancel } = props;
  if (!canAlign(props.status, members)) {
    return null;
  }
  const status = props.status.align;
  const embeds = members.some((player) => !player.hasStartTime);
  const again = status.state === "done" || status.state === "failed";
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2">
      {status.state === "running" ? (
        <Running progress={status.progress} onCancel={onCancel} />
      ) : (
        <div className="flex items-center gap-2">
          <p className="flex-1 text-sm font-medium">Far apart?</p>
          <Button variant="outline" size="xs" disabled={embeds} onClick={onAlign}>
            {again ? "Align again" : "Align with yt-dlp-z"}
          </Button>
        </div>
      )}
      {embeds && (
        <p className="text-xs text-muted-foreground">
          Needs watch pages: embeds have no start time.
        </p>
      )}
      <Outcome status={status} members={members} />
    </div>
  );
}
