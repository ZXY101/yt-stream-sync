import { CircleCheck, LoaderCircle } from "lucide-react";

import type { PlayerStatus } from "../lib/messages.ts";
import { describeSync, lowLatencyGap } from "./format.ts";

/** How far apart the furthest-ahead and furthest-behind streams are, once all are measured. */
function spreadOf(members: readonly PlayerStatus[]): number | undefined {
  const known = members.flatMap((member) => (member.error === undefined ? [] : [member.error]));
  if (known.length < members.length) {
    return undefined;
  }
  return Math.max(...known) - Math.min(...known);
}

/** Settled once every card says "In sync", so the line never disagrees with the cards. */
function progressText(members: readonly PlayerStatus[]): string {
  const spread = spreadOf(members);
  if (spread === undefined) {
    return "Starting the sync…";
  }
  if (members.every((member) => describeSync(member) === "In sync")) {
    return "Streams in sync";
  }
  return `Lining the streams up, ${spread.toFixed(1)} s apart`;
}

/**
 * Whether the cards show each stream's health. Not while the sync is still starting or lining
 * the streams up: that busy start moves every stream, and a label then misleads (user, 11-19).
 * A gap a low-latency stream keeps open is as settled as that group gets, so labels show.
 */
export function showsHealth(members: readonly PlayerStatus[]): boolean {
  return lowLatencyGap(members) > 0 || progressText(members) === "Streams in sync";
}

/**
 * What the sync is doing for the group as a whole, so adding the second stream visibly
 * starts something: a spinner while the streams are still apart, a check once they meet.
 * Says nothing when a low-latency stream keeps a gap open: `LowLatencyNote` explains that.
 */
export function GroupProgress({ members }: { members: readonly PlayerStatus[] }) {
  if (members.length < 2 || lowLatencyGap(members) > 0) {
    return null;
  }
  const text = progressText(members);
  const busy = text !== "Streams in sync";
  const Icon = busy ? LoaderCircle : CircleCheck;
  return (
    <output className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon
        aria-hidden="true"
        className={`size-3.5 shrink-0 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`}
      />
      {text}
    </output>
  );
}
