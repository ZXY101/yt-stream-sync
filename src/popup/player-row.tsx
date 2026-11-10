import type { PlayerStatus } from "../lib/messages.ts";
import { describeSync, formatLatency } from "./format.ts";

export function PlayerRow({ player }: { player: PlayerStatus }) {
  return (
    <li className="player">
      <span className="player-title">{player.title || "Untitled stream"}</span>
      <span className="player-channel">{player.channel}</span>
      <span className="player-detail">
        {formatLatency(player.latency)} · {describeSync(player)}
      </span>
    </li>
  );
}
