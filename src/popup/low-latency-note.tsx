import { Zap } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert.tsx";

import type { PlayerStatus } from "../lib/messages.ts";
import { lowLatencyGap } from "./format.ts";

function names(players: readonly PlayerStatus[]): string {
  const channels = players.map((player) => player.channel || player.title || "One stream");
  return [...new Set(channels)].join(" and ");
}

/**
 * Explains a gap the sync can't close: an ultra-low-latency stream can't be held back, and
 * the others can only jump ahead as far as their buffer allows. Without this, a group that
 * stays seconds apart looks broken.
 */
export function LowLatencyNote({ members }: { members: readonly PlayerStatus[] }) {
  const gap = lowLatencyGap(members);
  if (gap === 0) {
    return null;
  }
  const pinned = members.filter((member) => member.pinned === true);
  const one = pinned.length === 1;
  const subject = one ? "stream is" : "streams are";
  const object = one ? "it" : "them";
  return (
    <Alert>
      <Zap />
      <AlertDescription>
        Still {gap.toFixed(1)} s apart: the {names(pinned)} {subject} ultra-low latency. YouTube
        keeps {object} at the live edge, so the sync can&apos;t hold {object} back, and the others
        have jumped as far ahead as their buffer allows.
      </AlertDescription>
    </Alert>
  );
}
