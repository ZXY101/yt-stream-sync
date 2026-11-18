import { CircleCheck, TriangleAlert } from "lucide-react";

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

/** A live stream's health: a label, and what happened to it lately. */
export function HealthNote({ health }: { health: StreamHealth | undefined }) {
  if (!health) {
    return null;
  }
  const { text, variant, Icon } = LABELS[health.label];
  return (
    <div className="mt-1 flex min-w-0 items-start gap-1.5" title={HELP}>
      <Badge variant={variant}>
        <Icon data-icon="inline-start" />
        {text}
      </Badge>
      <p className="min-w-0 text-xs leading-5 text-muted-foreground">{describeHealth(health)}</p>
    </div>
  );
}
