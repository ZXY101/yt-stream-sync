import type { ReactNode } from "react";

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
          <p className="truncate text-xs text-muted-foreground">{player.channel}</p>
          <p className="truncate text-xs text-muted-foreground">{detail}</p>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>
      {children}
    </li>
  );
}
