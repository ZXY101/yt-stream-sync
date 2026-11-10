import type { SyncStatus } from "../lib/messages.ts";
import { PlayerRow } from "./player-row.tsx";
import { usePlayerStatus } from "./use-player-status.ts";

export function App() {
  const { status, setInGroup, nudge } = usePlayerStatus();
  return (
    <main className="popup">
      <h1>yt-stream-sync</h1>
      {status && <PlayerList status={status} onToggle={setInGroup} onNudge={nudge} />}
    </main>
  );
}

interface PlayerListProps {
  status: SyncStatus;
  onToggle: (id: string, inGroup: boolean) => void;
  onNudge: (id: string, seconds: number) => void;
}

function Hint({ status }: { status: SyncStatus }) {
  if (status.mixed) {
    return (
      <p className="hint warning" role="alert">
        Live streams and archives can&apos;t be synced together. Untick one kind.
      </p>
    );
  }
  const ticked = status.players.filter((player) => player.inGroup).length;
  return ticked < 2 ? <p className="hint">Tick two or more streams to keep them in sync.</p> : null;
}

function PlayerList({ status, onToggle, onNudge }: PlayerListProps) {
  if (status.players.length === 0) {
    return (
      <p className="hint">
        No streams open. Open the live streams or archives you want to watch together, then tick
        them here.
      </p>
    );
  }
  return (
    <>
      <ul className="players" aria-label="Streams">
        {status.players.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            onToggle={(inGroup) => onToggle(player.id, inGroup)}
            onNudge={(seconds) => onNudge(player.id, seconds)}
          />
        ))}
      </ul>
      <Hint status={status} />
    </>
  );
}
