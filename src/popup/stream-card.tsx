import { Zap } from "lucide-react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge.tsx";

import type { PlayerStatus } from "../lib/messages.ts";
import { thumbnailUrl } from "./thumbnail.ts";

interface StreamCardProps {
  player: PlayerStatus;
  /** One line under the title: where the stream is and what the sync does to it. */
  detail: string;
  /** Buttons for this stream, top right. */
  actions?: ReactNode;
  /** Controls under the card, e.g. the nudge buttons. */
  children?: ReactNode;
}

const LOW_LATENCY_HELP =
  "Ultra-low latency: YouTube keeps this stream near the live edge. It can't be slowed or " +
  "paused, only held back a few seconds, so the other streams jump ahead to meet it.";

/** Marks an ultra-low-latency live stream, the one that sets the pace of the group. */
function LowLatencyBadge() {
  return (
    <Badge variant="secondary" title={LOW_LATENCY_HELP}>
      <Zap data-icon="inline-start" />
      Low latency
    </Badge>
  );
}

/** A stream with its thumbnail, so streams are easy to tell apart. */
export function StreamCard({ player, detail, actions, children }: StreamCardProps) {
  const title = player.title || "Untitled stream";
  const thumbnail = thumbnailUrl(player.videoId);
  return (
    <li className="rounded-lg border bg-card p-2 text-card-foreground">
      <div className="flex gap-2">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt=""
            className="aspect-video w-24 shrink-0 rounded-md bg-muted object-cover"
          />
        ) : (
          <div className="aspect-video w-24 shrink-0 rounded-md bg-muted" />
        )}
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm leading-snug font-medium" title={title}>
            {title}
          </p>
          <div className="flex min-w-0 items-center gap-1">
            <p className="truncate text-xs text-muted-foreground">{player.channel}</p>
            {player.kind === "live" && player.pinned === true && <LowLatencyBadge />}
          </div>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </li>
  );
}
