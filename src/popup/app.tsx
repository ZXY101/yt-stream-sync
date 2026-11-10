import { PlayerRow } from "./player-row.tsx";
import { usePlayerStatus } from "./use-player-status.ts";

export function App() {
  const players = usePlayerStatus();
  return (
    <main className="popup">
      <h1>yt-stream-sync</h1>
      <PlayerList players={players} />
    </main>
  );
}

function PlayerList({ players }: { players: ReturnType<typeof usePlayerStatus> }) {
  if (players === undefined) {
    return null;
  }
  if (players.length === 0) {
    return (
      <p className="empty">
        No players in the sync group yet. Open two YouTube live streams to start.
      </p>
    );
  }
  return (
    <ul className="players" aria-label="Players in the sync group">
      {players.map((player) => (
        <PlayerRow key={player.id} player={player} />
      ))}
    </ul>
  );
}
