import { useEffect, useState } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { useColorScheme } from "@/components/use-color-scheme.ts";

import type { PlayerStatus } from "../lib/messages.ts";
import { useSyncStatus } from "../popup/use-sync-status.ts";
import type { OpenArchive } from "./add-stream.tsx";
import { SavedGroupsPage } from "./saved-groups-page.tsx";
import { YtdlpzSection } from "./ytdlpz-section.tsx";

type Tab = "groups" | "settings";

/** The tab named in the address (`#groups`, `#settings`), saved groups by default. */
function tabFromHash(): Tab {
  return window.location.hash === "#settings" ? "settings" : "groups";
}

function chooseTab(next: string) {
  window.location.hash = next;
}

/** Follows the address, so the popup's links and the back button pick the tab. */
function useHashTab() {
  const [tab, setTab] = useState<Tab>(tabFromHash);
  useEffect(() => {
    function onChange() {
      setTab(tabFromHash());
    }
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return [tab, chooseTab] as const;
}

/** Archives open on their watch pages (what a saved group can hold), one per video. */
function openArchives(players: PlayerStatus[]): OpenArchive[] {
  const seen = new Map<string, OpenArchive>();
  for (const player of players) {
    if (player.kind === "archive" && player.hasStartTime === true && !seen.has(player.videoId)) {
      seen.set(player.videoId, {
        videoId: player.videoId,
        title: player.title,
        channel: player.channel,
      });
    }
  }
  return [...seen.values()];
}

function GroupsTab() {
  const sync = useSyncStatus();
  if (!sync.status) {
    return null;
  }
  return (
    <SavedGroupsPage
      saved={sync.status.saved}
      openArchives={openArchives(sync.status.players)}
      onOpen={(groupId) => void sync.openSavedGroup(groupId)}
      onDelete={(groupId) => void sync.deleteSavedGroup(groupId)}
      onRename={(groupId, name) => void sync.renameSavedGroup(groupId, name)}
      onRemoveStream={(groupId, videoId) => void sync.removeSavedMember(groupId, videoId)}
      onSetOffset={(groupId, videoId, offset) => void sync.setSavedOffset(groupId, videoId, offset)}
      onAddStream={(groupId, videoId) => void sync.addSavedStream(groupId, videoId)}
    />
  );
}

/** The add-on's page: saved groups, and the settings. */
export function OptionsApp() {
  useColorScheme();
  const [tab, setTab] = useHashTab();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-xl font-semibold">yt-stream-sync</h1>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="groups">Saved groups</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="groups">
          <GroupsTab />
        </TabsContent>
        <TabsContent value="settings">
          <YtdlpzSection />
        </TabsContent>
      </Tabs>
    </main>
  );
}
