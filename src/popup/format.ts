import type { PlayerStatus } from "../lib/messages.ts";

/** 4521.3 → "1:15:21" */
export function formatPosition(seconds: number): string {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${rest}`;
  }
  return `${minutes}:${rest}`;
}

/** Where the player is: latency for live streams, position for archives. */
export function describePlace(player: PlayerStatus): string {
  if (player.kind === "live") {
    return `${(player.latency ?? 0).toFixed(1)} s behind live`;
  }
  return `Archive at ${formatPosition(player.position ?? 0)}`;
}

/** Gaps below this read as "in sync": the live controller settles within about a second. */
const LIVE_SETTLED = 1;
/** A low-latency stream this far ahead is being held back (the controller's `holdError`). */
const HOLDING = 0.3;

/**
 * `gap`: how far a low-latency stream stays ahead of the group (see `lowLatencyGap`). While
 * there is one, "in sync" would be wrong: the others are only as close as they can get.
 */
/** A low-latency stream ahead of the group: being held back, or held back as far as it goes. */
function describePinnedAhead(player: PlayerStatus, error: number): string {
  if (player.stuck === true) {
    return `${error.toFixed(1)} s ahead`;
  }
  return `Holding back, ${error.toFixed(1)} s ahead`;
}

function describeLive(player: PlayerStatus, error: number, gap: number): string {
  if (player.state === "paused") {
    return `Paused, ${error.toFixed(1)} s ahead`;
  }
  if (player.playbackRate < 1) {
    return `Slowed to ${player.playbackRate.toFixed(2)}×, ${error.toFixed(1)} s ahead`;
  }
  if (player.pinned === true && error >= HOLDING) {
    return describePinnedAhead(player, error);
  }
  if (error <= -LIVE_SETTLED) {
    return `Jumping ahead, ${(-error).toFixed(1)} s behind`;
  }
  return gap > 0 && player.pinned !== true ? "Can't get closer" : "In sync";
}

/**
 * How far an ultra-low-latency stream stays ahead of the rest: the gap the sync can't close.
 * 0 when there's none or it's under a second.
 */
export function lowLatencyGap(members: readonly PlayerStatus[]): number {
  const gaps = members
    .filter((member) => member.kind === "live" && member.pinned === true && member.stuck === true)
    .map((member) => member.error ?? 0);
  const gap = Math.max(0, ...gaps);
  return gap >= LIVE_SETTLED ? gap : 0;
}

function describeArchive(error: number): string {
  if (Math.abs(error) < 0.2) {
    return "In sync";
  }
  const direction = error > 0 ? "ahead" : "behind";
  return `Catching up, ${Math.abs(error).toFixed(1)} s ${direction}`;
}

/** What the sync is doing to a player, in words. `gap`: see `describeLive`. */
export function describeSync(player: PlayerStatus, gap = 0): string {
  if (!player.inGroup) {
    return "Not synced";
  }
  if (player.error === undefined) {
    return "Waiting";
  }
  if (player.kind === "live") {
    return describeLive(player, player.error, gap);
  }
  return describeArchive(player.error);
}
