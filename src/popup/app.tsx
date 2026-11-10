import { useState } from "react";

import { Badge } from "@/components/ui/badge.tsx";

import type { PlayerStatus, SyncStatus } from "../lib/messages.ts";
import { AudioPanel } from "./audio-panel.tsx";
import { SyncGroup } from "./sync-group.tsx";
import { ThisTab } from "./this-tab.tsx";
import { useColorScheme } from "./use-color-scheme.ts";
import { useCurrentTab } from "./use-current-tab.ts";
import { useSyncStatus } from "./use-sync-status.ts";

function isSyncing(status: SyncStatus): boolean {
  return !status.mixed && status.players.filter((player) => player.inGroup).length >= 2;
}

/** The newest audio any member has heard: the shared right edge of the waveforms. */
function newestAudio(members: PlayerStatus[]): number {
  return Math.max(0, ...members.map((player) => player.waveform?.end ?? 0));
}

export function App() {
  useColorScheme();
  const tabId = useCurrentTab();
  const { status, setInGroup, nudge, setAudioSync, rematchAudio } = useSyncStatus();
  const [showWaveforms, setShowWaveforms] = useState(false);
  const players = status?.players ?? [];
  const inTab = players.filter((player) => player.tabId === tabId);
  const members = players.filter((player) => player.inGroup);
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
          {members.length >= 2 && !status.mixed && (
            <AudioPanel
              status={status.audio}
              showWaveforms={showWaveforms}
              onToggleSync={(on) => void setAudioSync(on)}
              onRematch={() => void rematchAudio()}
              onToggleWaveforms={() => setShowWaveforms((shown) => !shown)}
            />
          )}
          <SyncGroup
            members={members}
            mixed={status.mixed}
            waveformsAt={showWaveforms ? newestAudio(members) : undefined}
            onRemove={(id) => void setInGroup(id, false)}
            onNudge={(id, seconds) => void nudge(id, seconds)}
          />
        </>
      )}
    </main>
  );
}
