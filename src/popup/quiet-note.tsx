import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge.tsx";

/**
 * A stream in the group that stopped sending readings, though the add-on keeps asking. The
 * sync can't see it, so it's left out; a refresh of its tab has fixed it every time so far.
 */
export function QuietNote({ quiet }: { quiet: number | undefined }) {
  if (quiet === undefined) {
    return null;
  }
  return (
    <div className="mt-1 flex min-h-8 items-start gap-1.5 py-1.5">
      <Badge variant="destructive">
        <TriangleAlert data-icon="inline-start" />
        Not responding
      </Badge>
      <span className="min-w-0 flex-1 text-xs leading-5 text-muted-foreground">
        {`No readings for ${Math.round(quiet)} s. Refresh its tab, then add it again.`}
      </span>
    </div>
  );
}
