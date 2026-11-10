import type { PlayerStatus } from "../lib/messages.ts";
import { describePlace, describeSync } from "./format.ts";
import { NudgeButtons } from "./nudge-buttons.tsx";

interface PlayerRowProps {
  player: PlayerStatus;
  onToggle: (inGroup: boolean) => void;
  onNudge: (seconds: number) => void;
}

export function PlayerRow({ player, onToggle, onNudge }: PlayerRowProps) {
  const title = player.title || "Untitled stream";
  const handAligned = player.kind === "archive" && player.inGroup && !player.hasStartTime;
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
          {describePlace(player)} · {describeSync(player)}
        </span>
      </label>
      {handAligned && (
        <p className="player-note">No start time in embeds: aligned as it was when ticked.</p>
      )}
      {player.inGroup && <NudgeButtons title={title} offset={player.offset} onNudge={onNudge} />}
    </li>
  );
}
