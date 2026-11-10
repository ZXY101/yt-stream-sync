import { useEffect, useState } from "react";

import { ext } from "../lib/browser.ts";
import type { PopupRequest, SyncStatus } from "../lib/messages.ts";

const REFRESH_MS = 1000;
const EMPTY: SyncStatus = { players: [], mixed: false, audio: { state: "waiting" } };

function request(message: PopupRequest): Promise<SyncStatus> {
  const response = ext.runtime.sendMessage(message) as Promise<SyncStatus | undefined>;
  return response.then((status) => status ?? EMPTY);
}

/**
 * The streams the background script knows about, refreshed every second, and the actions
 * the popup offers on them.
 */
export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>();

  useEffect(() => {
    let active = true;
    async function refresh() {
      const latest = await request({ type: "getStatus" });
      if (active) {
        setStatus(latest);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  async function setInGroup(id: string, inGroup: boolean) {
    setStatus(await request({ type: "setInGroup", id, inGroup }));
  }

  async function nudge(id: string, seconds: number) {
    setStatus(await request({ type: "nudge", id, seconds }));
  }

  async function setAudioSync(on: boolean) {
    setStatus(await request({ type: "setAudioSync", on }));
  }

  async function rematchAudio() {
    setStatus(await request({ type: "rematchAudio" }));
  }

  async function clearGroup() {
    setStatus(await request({ type: "clearGroup" }));
  }

  return { status, setInGroup, nudge, setAudioSync, rematchAudio, clearGroup };
}
