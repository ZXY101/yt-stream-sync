import type { PlayerStatus } from "../lib/messages.ts";

export function formatLatency(seconds: number): string {
  return `${seconds.toFixed(1)} s behind live`;
}

/** What the sync is doing to a player, in words. */
export function describeSync(player: PlayerStatus): string {
  if (!player.inGroup) {
    return "Not synced";
  }
  if (player.error === undefined) {
    return "Waiting";
  }
  if (player.state === "paused") {
    return `Paused, ${player.error.toFixed(1)} s ahead`;
  }
  if (player.playbackRate < 1) {
    return `Slowed to ${player.playbackRate.toFixed(2)}×, ${player.error.toFixed(1)} s ahead`;
  }
  return "In sync";
}
