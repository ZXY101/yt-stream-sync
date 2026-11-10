import type { PlayerStatus } from "../lib/messages.ts";

/** 4521.3 → "1:15:21" */
function formatPosition(seconds: number): string {
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

function describeLive(player: PlayerStatus, error: number): string {
  if (player.state === "paused") {
    return `Paused, ${error.toFixed(1)} s ahead`;
  }
  if (player.playbackRate < 1) {
    return `Slowed to ${player.playbackRate.toFixed(2)}×, ${error.toFixed(1)} s ahead`;
  }
  return "In sync";
}

function describeArchive(error: number): string {
  if (Math.abs(error) < 0.2) {
    return "In sync";
  }
  const direction = error > 0 ? "ahead" : "behind";
  return `Catching up, ${Math.abs(error).toFixed(1)} s ${direction}`;
}

/** What the sync is doing to a player, in words. */
export function describeSync(player: PlayerStatus): string {
  if (!player.inGroup) {
    return "Not synced";
  }
  if (player.error === undefined) {
    return "Waiting";
  }
  if (player.kind === "live") {
    return describeLive(player, player.error);
  }
  return describeArchive(player.error);
}

/** 0.3 → "+0.3 s", -1 → "−1.0 s" */
export function formatOffset(seconds: number): string {
  const sign = seconds < 0 ? "−" : "+";
  return `${sign}${Math.abs(seconds).toFixed(1)} s`;
}
