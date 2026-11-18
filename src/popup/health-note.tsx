import { ChevronDown, ChevronUp, CircleCheck, TriangleAlert } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge.tsx";

import type { StreamHealth } from "../lib/messages.ts";

const LABELS = {
  steady: { text: "Steady", variant: "outline", Icon: CircleCheck },
  shaky: { text: "Shaky", variant: "secondary", Icon: TriangleAlert },
  unstable: { text: "Unstable", variant: "destructive", Icon: TriangleAlert },
} as const;

const HELP =
  "How calm this stream has been over the last 2 minutes: how often it buffered, how often " +
  "YouTube moved it by itself, and how often the sync had to correct it.";

/** "Last 2 min: buffered 2×, corrected 3×", leaving out what didn't happen. */
function describeHealth({ buffering, moved, corrections }: StreamHealth): string {
  const parts = [
    buffering > 0 ? `buffered ${buffering}×` : "",
    moved > 0 ? `moved by YouTube ${moved}×` : "",
    corrections > 0 ? `corrected ${corrections}×` : "",
  ].filter(Boolean);
  return `Last 2 min: ${parts.join(", ") || "nothing to fix"}`;
}

const ROW = "mt-1 -mx-1 flex min-h-8 w-[calc(100%+0.5rem)] min-w-0 items-start gap-1.5 px-1 py-1.5";
const EXPANDABLE =
  "rounded-md text-left hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none";

/**
 * Whether `text`, shown in `ref`, is cut off. Measured only while the line is closed (open,
 * it wraps and always fits), again whenever the text changes.
 */
function useCutOff(text: string, open: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  const [cutOff, setCutOff] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element && !open) {
      setCutOff(text !== "" && element.scrollWidth > element.clientWidth);
    }
  }, [text, open]);
  return { ref, cutOff };
}

/**
 * A live stream's health on one line. Only a line too long to fit can be clicked open, so
 * the chevron never promises more than there is.
 */
export function HealthNote({ health }: { health: StreamHealth | undefined }) {
  const [open, setOpen] = useState(false);
  const detail = health ? describeHealth(health) : "";
  const { ref, cutOff } = useCutOff(detail, open);
  if (!health) {
    return null;
  }
  const { text, variant, Icon } = LABELS[health.label];
  const content = (
    <>
      <Badge variant={variant}>
        <Icon data-icon="inline-start" />
        {text}
      </Badge>
      <span
        ref={ref}
        className={`min-w-0 flex-1 text-xs leading-5 text-muted-foreground ${open ? "" : "truncate"}`}
      >
        {detail}
      </span>
    </>
  );
  const title = `${detail}\n\n${HELP}`;
  if (!open && !cutOff) {
    return (
      <div className={ROW} title={title}>
        {content}
      </div>
    );
  }
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <button
      type="button"
      aria-expanded={open}
      title={title}
      onClick={() => setOpen(!open)}
      className={`${ROW} ${EXPANDABLE}`}
    >
      {content}
      <Chevron aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
