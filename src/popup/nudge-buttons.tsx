import { useState } from "react";

import { Button } from "@/components/ui/button.tsx";

import { offsetToText, textToOffset } from "./offset-text.ts";

const STEPS = [-10, -1, -0.1, 0.1, 1, 10] as const;

interface NudgeButtonsProps {
  title: string;
  offset: number;
  onNudge: (seconds: number) => void;
}

function describeStep(title: string, seconds: number): string {
  const direction = seconds > 0 ? "ahead" : "back";
  const amount = Math.abs(seconds) === 1 ? "1 second" : `${Math.abs(seconds)} seconds`;
  return `Move ${title} ${direction} ${amount}`;
}

interface OffsetFieldProps {
  title: string;
  offset: number;
  onSet: (seconds: number) => void;
}

/** The offset as text the user can overwrite ("-2:05.3"): big gaps in one go. */
function OffsetField({ title, offset, onSet }: OffsetFieldProps) {
  // While the user types, the second-by-second refresh mustn't overwrite the draft.
  const [draft, setDraft] = useState<string>();

  function commit() {
    const seconds = draft === undefined ? undefined : textToOffset(draft);
    setDraft(undefined);
    if (seconds !== undefined && seconds !== offset) {
      onSet(seconds);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      commit();
    } else if (event.key === "Escape") {
      setDraft(undefined);
    }
  }

  return (
    <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
      Offset
      <input
        className="h-6 w-20 rounded-md border border-input bg-transparent px-1.5 text-right text-xs text-foreground tabular-nums"
        aria-label={`Offset of ${title} (seconds or m:ss)`}
        value={draft ?? offsetToText(offset)}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={commit}
        onKeyDown={handleKeyDown}
      />
      s
    </label>
  );
}

/** Fine-tunes one stream against the others; the sync keeps whatever the user sets. */
export function NudgeButtons({ title, offset, onNudge }: NudgeButtonsProps) {
  return (
    <fieldset className="mt-2 flex flex-wrap items-center gap-1" aria-label={`Nudge ${title}`}>
      {STEPS.map((seconds) => (
        <Button
          key={seconds}
          variant="outline"
          size="xs"
          className="min-w-9 px-1.5"
          aria-label={describeStep(title, seconds)}
          onClick={() => onNudge(seconds)}
        >
          {seconds > 0 ? `+${seconds}` : `−${Math.abs(seconds)}`}
        </Button>
      ))}
      <OffsetField title={title} offset={offset} onSet={(seconds) => onNudge(seconds - offset)} />
    </fieldset>
  );
}
