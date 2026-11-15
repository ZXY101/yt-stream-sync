import { Zap } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert.tsx";

import type { PlayerStatus } from "../lib/messages.ts";
import { lowLatencyGap } from "./format.ts";

function names(players: readonly PlayerStatus[]): string {
  const channels = players.map((player) => player.channel || player.title || "One stream");
  return [...new Set(channels)].join(" and ");
}

function pinnedReason(players: readonly PlayerStatus[]): string {
  const one = players.length === 1;
  const object = one ? "it" : "them";
  return (
    `The ${names(players)} ${one ? "stream is" : "streams are"} ultra-low latency: YouTube ` +
    `keeps ${object} near the live edge, and the sync has held ${object} back as far as YouTube allows.`
  );
}

function noRewindReason(players: readonly PlayerStatus[]): string {
  const one = players.length === 1;
  const object = one ? "it" : "them";
  return (
    `The ${names(players)} ${one ? "stream has" : "streams have"} rewind turned off, and ` +
    `YouTube moves ${object} back when ${one ? "it is" : "they are"} held or jumped further, ` +
    `so the sync keeps ${object} as close as YouTube allows and tries again now and then.`
  );
}

/**
 * Explains a gap the sync can't close: an ultra-low-latency stream can only be held back a
 * few seconds, one without rewind not at all, and the others can only jump ahead as far as their buffer allows. Without this, a group that
 * stays seconds apart looks broken.
 */
export function LowLatencyNote({ members }: { members: readonly PlayerStatus[] }) {
  const gap = lowLatencyGap(members);
  if (gap === 0) {
    return null;
  }
  const ahead = members.filter((member) => member.stuck === true);
  const pinned = ahead.filter((member) => member.pinned === true);
  const noRewind = ahead.filter((member) => member.pinned !== true && member.noRewind === true);
  // Only next to an ultra-low-latency stream do the others jump as far as they can.
  const othersJumped =
    pinned.length > 0 && members.some((member) => member.stuck !== true && member.pinned !== true);
  return (
    <Alert>
      <Zap />
      <AlertDescription>
        Still {gap.toFixed(1)} s apart.
        {pinned.length > 0 && ` ${pinnedReason(pinned)}`}
        {noRewind.length > 0 && ` ${noRewindReason(noRewind)}`}
        {othersJumped && " The others have jumped as far ahead as their buffer allows."}
      </AlertDescription>
    </Alert>
  );
}
