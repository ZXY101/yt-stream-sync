import type { PlayerStatus } from "../lib/messages.ts";
import { PlayerRow } from "./player-row.tsx";
import { usePlayerStatus } from "./use-player-status.ts";

export function App() {
  const { players, setInGroup } = usePlayerStatus();
  return (
    <main className="popup">
      <h1>yt-stream-sync</h1>
      <PlayerList players={players} onToggle={setInGroup} />
    </main>
  );
}

interface PlayerListProps {
  players: PlayerStatus[] | undefined;
  onToggle: (id: string, inGroup: boolean) => void;
}

function PlayerList({ players, onToggle }: PlayerListProps) {
  if (players === undefined) {
    return null;
  }
  if (players.length === 0) {
    return (
      <p className="hint">
        No live streams open. Open the streams you want to watch together, then tick them here.
      </p>
    );
  }
  const ticked = players.filter((player) => player.inGroup).length;
  return (
    <>
      <ul className="players" aria-label="Live streams">
        {players.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            onToggle={(inGroup) => onToggle(player.id, inGroup)}
          />
        ))}
      </ul>
      {ticked < 2 && <p className="hint">Tick two or more streams to keep them in sync.</p>}
    </>
  );
}
