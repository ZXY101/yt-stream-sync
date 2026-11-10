import type { PlayerStatus } from "../lib/messages.ts";
import { describeSync, formatLatency } from "./format.ts";

interface PlayerRowProps {
  player: PlayerStatus;
  onToggle: (inGroup: boolean) => void;
}

export function PlayerRow({ player, onToggle }: PlayerRowProps) {
  const title = player.title || "Untitled stream";
  return (
    <li>
      <label className="player">
        <input
          type="checkbox"
          checked={player.inGroup}
          onChange={(event) => onToggle(event.currentTarget.checked)}
        />
        <span className="player-title">{title}</span>
        <span className="player-channel">{player.channel}</span>
        <span className="player-detail">
          {formatLatency(player.latency)} · {describeSync(player)}
        </span>
      </label>
    </li>
  );
}
