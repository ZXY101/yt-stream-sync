import { useEffect, useState } from "react";

import { ext } from "../lib/browser.ts";
import type { GroupRequest, PlayerStatus, StatusRequest } from "../lib/messages.ts";

const REFRESH_MS = 1000;

function request(message: StatusRequest | GroupRequest): Promise<PlayerStatus[]> {
  const response = ext.runtime.sendMessage(message) as Promise<PlayerStatus[] | undefined>;
  return response.then((players) => players ?? []);
}

/**
 * The live players the background script knows about, refreshed every second, and a way to
 * opt one in or out of the sync group.
 */
export function usePlayerStatus() {
  const [players, setPlayers] = useState<PlayerStatus[]>();

  useEffect(() => {
    let active = true;
    async function refresh() {
      const latest = await request({ type: "getStatus" });
      if (active) {
        setPlayers(latest);
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
    setPlayers(await request({ type: "setInGroup", id, inGroup }));
  }

  return { players, setInGroup };
}
