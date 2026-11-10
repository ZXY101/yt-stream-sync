import { Badge } from "@/components/ui/badge.tsx";

import type { SyncStatus } from "../lib/messages.ts";
import { SyncGroup } from "./sync-group.tsx";
import { ThisTab } from "./this-tab.tsx";
import { useColorScheme } from "./use-color-scheme.ts";
import { useCurrentTab } from "./use-current-tab.ts";
import { useSyncStatus } from "./use-sync-status.ts";

function isSyncing(status: SyncStatus): boolean {
  return !status.mixed && status.players.filter((player) => player.inGroup).length >= 2;
}

export function App() {
  useColorScheme();
  const tabId = useCurrentTab();
  const { status, setInGroup, nudge } = useSyncStatus();
  const players = status?.players ?? [];
  const inTab = players.filter((player) => player.tabId === tabId);
  return (
    <main className="flex w-[360px] flex-col gap-4 p-3">
      <header className="flex items-center justify-between">
        <h1 className="text-base font-semibold">yt-stream-sync</h1>
        {status && isSyncing(status) && <Badge>Syncing</Badge>}
      </header>
      {status && (
        <>
          <ThisTab
            players={inTab.filter((player) => !player.inGroup)}
            added={inTab.filter((player) => player.inGroup).length}
            onAdd={(id) => void setInGroup(id, true)}
          />
          <SyncGroup
            members={players.filter((player) => player.inGroup)}
            mixed={status.mixed}
            onRemove={(id) => void setInGroup(id, false)}
            onNudge={(id, seconds) => void nudge(id, seconds)}
          />
        </>
      )}
    </main>
  );
}
