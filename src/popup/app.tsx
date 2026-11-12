import { Settings } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";

import type { PlayerStatus, SyncStatus } from "../lib/messages.ts";
import { ext } from "../lib/browser.ts";
import { AlignPanel } from "./align-panel.tsx";
import { AudioPanel } from "./audio-panel.tsx";
import { DebugLogButton } from "./debug-log-button.tsx";
import { SavedGroups } from "./saved-groups.tsx";
import { SyncGroup } from "./sync-group.tsx";
import { ThisTab } from "./this-tab.tsx";
import { useColorScheme } from "@/components/use-color-scheme.ts";
import { useCurrentTab } from "./use-current-tab.ts";
import { useSyncStatus } from "./use-sync-status.ts";

function isSyncing(status: SyncStatus): boolean {
  return !status.mixed && status.players.filter((player) => player.inGroup).length >= 2;
}

/** The newest audio any member has heard: the shared right edge of the waveforms. */
function newestAudio(members: PlayerStatus[]): number {
  return Math.max(0, ...members.map((player) => player.waveform?.end ?? 0));
}

function Header({ syncing }: { syncing: boolean }) {
  return (
    <header className="flex items-center gap-2">
      <h1 className="flex-1 text-base font-semibold">yt-stream-sync</h1>
      {syncing && <Badge>Syncing</Badge>}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="Settings"
        onClick={() => void ext.runtime.openOptionsPage()}
      >
        <Settings />
      </Button>
    </header>
  );
}

type Sync = ReturnType<typeof useSyncStatus>;

/** The streams: this tab's, matching by audio and yt-dlp-z, and the sync group. */
function StreamPanels({ status, sync, tabId }: { status: SyncStatus; sync: Sync; tabId?: number }) {
  const { setInGroup, nudge, setAudioSync, rematchAudio, clearGroup } = sync;
  // Waveforms are shown by default while matching by audio is on.
  const [showWaveforms, setShowWaveforms] = useState(true);
  const inTab = status.players.filter((player) => player.tabId === tabId);
  const members = status.players.filter((player) => player.inGroup);
  return (
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
      <AlignPanel
        status={status}
        members={members}
        onAlign={() => void sync.alignArchives()}
        onCancel={() => void sync.cancelAlign()}
      />
      <SyncGroup
        members={members}
        mixed={status.mixed}
        waveformsAt={
          showWaveforms && status.audio.state !== "off" ? newestAudio(members) : undefined
        }
        onClear={() => void clearGroup()}
        onRemove={(id) => void setInGroup(id, false)}
        onNudge={(id, seconds) => void nudge(id, seconds)}
      />
    </>
  );
}

export function App() {
  useColorScheme();
  const tabId = useCurrentTab();
  const sync = useSyncStatus();
  const { status } = sync;
  return (
    <main className="flex w-[360px] flex-col gap-4 p-3">
      <Header syncing={status !== undefined && isSyncing(status)} />
      {status && (
        <>
          <StreamPanels status={status} sync={sync} tabId={tabId} />
          <SavedGroups
            saved={status.saved}
            onSave={() => void sync.saveGroup()}
            onOpen={(groupId) => void sync.openSavedGroup(groupId)}
            onDelete={(groupId) => void sync.deleteSavedGroup(groupId)}
          />
        </>
      )}
      <DebugLogButton />
    </main>
  );
}
