import { AudioLines, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { Switch } from "@/components/ui/switch.tsx";

import type { AudioStatus } from "../lib/messages.ts";
import { audioMessage } from "./audio-messages.ts";

interface AudioPanelProps {
  status: AudioStatus;
  showWaveforms: boolean;
  onToggleSync: (on: boolean) => void;
  onRematch: () => void;
  onToggleWaveforms: () => void;
}

/** Matching by audio: on or off, how it's going, and the waveforms toggle. */
export function AudioPanel(props: AudioPanelProps) {
  const { status, showWaveforms } = props;
  const message = audioMessage(status);
  const on = status.state !== "off";
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-2">
      <div className="flex items-center gap-2">
        <Switch id="audio-sync" checked={on} onCheckedChange={props.onToggleSync} />
        <label htmlFor="audio-sync" className="flex-1 text-sm font-medium">
          Auto-sync by audio
        </label>
        {on && (
          <Button
            variant="ghost"
            size="xs"
            aria-pressed={showWaveforms}
            onClick={props.onToggleWaveforms}
          >
            <AudioLines data-icon="inline-start" />
            {showWaveforms ? "Hide audio" : "Show audio"}
          </Button>
        )}
      </div>
      {message && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <output className="flex-1">{message.text}</output>
          {message.retry && (
            <Button variant="outline" size="xs" onClick={props.onRematch}>
              <RefreshCw data-icon="inline-start" />
              Match again
            </Button>
          )}
        </div>
      )}
      {message?.progress !== undefined && (
        <Progress value={message.progress * 100} aria-label="Listening progress" />
      )}
    </div>
  );
}
