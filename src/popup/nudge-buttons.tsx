import { useId, useState } from "react";

import { Button } from "@/components/ui/button.tsx";

import { offsetToText, textToOffset } from "./offset-text.ts";

const STEPS = [-10, -1, -0.1, 0.1, 1, 10] as const;

interface NudgeButtonsProps {
  title: string;
  offset: number;
  onNudge: (seconds: number) => void;
  /** A direction the stream can't move any further (see `blockedNudge`): those buttons are off. */
  blocked?: "ahead" | "back";
}

const BLOCKED_HELP = {
  ahead: "YouTube won't keep this stream any closer to live",
  back: "YouTube won't keep this stream any further behind live",
} as const;

function directionOf(seconds: number): "ahead" | "back" {
  return seconds > 0 ? "ahead" : "back";
}

function describeStep(title: string, seconds: number): string {
  const direction = directionOf(seconds);
  const amount = Math.abs(seconds) === 1 ? "1 second" : `${Math.abs(seconds)} seconds`;
  return `Move ${title} ${direction} ${amount}`;
}

interface OffsetFieldProps {
  title: string;
  offset: number;
  onSet: (seconds: number) => void;
}

/** The offset as text the user can overwrite ("-2:05.3"): big gaps in one go. */
export function OffsetField({ title, offset, onSet }: OffsetFieldProps) {
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

interface StepButtonProps {
  title: string;
  seconds: number;
  blocked: "ahead" | "back" | undefined;
  onNudge: (seconds: number) => void;
}

/**
 * One nudge step. A disabled button gets no pointer events (so no tooltip), so a blocked one
 * sits in a wrapper that carries the explanation instead.
 */
function StepButton({ title, seconds, blocked, onNudge }: StepButtonProps) {
  // Disabled buttons can't be focused, so the reason is also their accessible description.
  const reasonId = useId();
  const button = (
    <Button
      variant="outline"
      size="xs"
      className="min-w-9 px-1.5"
      aria-label={describeStep(title, seconds)}
      aria-describedby={blocked === undefined ? undefined : reasonId}
      disabled={blocked !== undefined}
      onClick={() => onNudge(seconds)}
    >
      {seconds > 0 ? `+${seconds}` : `−${Math.abs(seconds)}`}
    </Button>
  );
  if (blocked === undefined) {
    return button;
  }
  return (
    <span className="inline-flex cursor-not-allowed" title={BLOCKED_HELP[blocked]}>
      {button}
      <span id={reasonId} className="sr-only">
        {BLOCKED_HELP[blocked]}
      </span>
    </span>
  );
}

/** Fine-tunes one stream against the others; the sync keeps whatever the user sets. */
export function NudgeButtons({ title, offset, onNudge, blocked }: NudgeButtonsProps) {
  return (
    <fieldset className="mt-2 flex flex-wrap items-center gap-1" aria-label={`Nudge ${title}`}>
      {STEPS.map((seconds) => (
        <StepButton
          key={seconds}
          title={title}
          seconds={seconds}
          blocked={blocked !== undefined && directionOf(seconds) === blocked ? blocked : undefined}
          onNudge={onNudge}
        />
      ))}
      <OffsetField title={title} offset={offset} onSet={(seconds) => onNudge(seconds - offset)} />
    </fieldset>
  );
}
