import { Button } from "@/components/ui/button.tsx";
import { Progress } from "@/components/ui/progress.tsx";

import type { AlignStatus, AlignStreamStatus, PlayerStatus } from "../lib/messages.ts";

type Running = Extract<AlignStatus, { state: "running" }>;

const PHASES: Record<Running["phase"], string> = {
  starting: "Asking yt-dlp-z…",
  fetching: "Step 1 of 2 · Getting the audio",
  comparing: "Step 2 of 2 · Comparing",
};

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function stageText(stream: AlignStreamStatus): string {
  if (stream.stage === "ready") {
    return "Ready";
  }
  if (stream.stage === "converting") {
    return "Converting…";
  }
  return `Downloading ${Math.round(stream.downloaded * 100)}%`;
}

function StreamStages({
  streams,
  members,
}: {
  streams: AlignStreamStatus[];
  members: PlayerStatus[];
}) {
  return (
    <ul className="flex flex-col gap-0.5 text-xs" aria-label="Alignment steps per stream">
      {streams.map((stream) => {
        const title = members.find((player) => player.id === stream.id)?.title || "Untitled stream";
        return (
          <li key={stream.id} className="flex gap-2">
            <span className="min-w-0 flex-1 truncate">{title}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums">{stageText(stream)}</span>
          </li>
        );
      })}
    </ul>
  );
}

interface AlignRunningProps {
  status: Running;
  members: PlayerStatus[];
  onCancel: () => void;
}

/** What a running alignment is doing: the step, the time so far, and each stream's stage. */
export function AlignRunning({ status, members, onCancel }: AlignRunningProps) {
  return (
    <>
      <div className="flex items-center gap-2 text-xs">
        <output className="flex-1 font-medium">{PHASES[status.phase]}</output>
        <span className="text-muted-foreground tabular-nums" aria-label="Time so far">
          {clock(status.elapsed)}
        </span>
        <Button variant="outline" size="xs" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <Progress value={status.progress * 100} aria-label="Alignment progress" />
      {status.streams.length > 0 && <StreamStages streams={status.streams} members={members} />}
    </>
  );
}
