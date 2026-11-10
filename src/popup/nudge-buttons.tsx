import { Button } from "@/components/ui/button.tsx";

import { formatOffset } from "./format.ts";

const STEPS = [-1, -0.1, 0.1, 1] as const;

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

/** Fine-tunes one stream against the others; the sync keeps whatever the user sets. */
export function NudgeButtons({ title, offset, onNudge }: NudgeButtonsProps) {
  return (
    <fieldset className="mt-2 flex items-center gap-1" aria-label={`Nudge ${title}`}>
      {STEPS.map((seconds) => (
        <Button
          key={seconds}
          variant="outline"
          size="xs"
          className="min-w-10"
          aria-label={describeStep(title, seconds)}
          onClick={() => onNudge(seconds)}
        >
          {seconds > 0 ? `+${seconds}` : `−${Math.abs(seconds)}`}
        </Button>
      ))}
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
        Nudge {formatOffset(offset)}
      </span>
    </fieldset>
  );
}
