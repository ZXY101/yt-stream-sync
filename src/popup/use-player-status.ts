import { useEffect, useState } from "react";

import { ext } from "../lib/browser.ts";
import type { PlayerStatus, StatusRequest } from "../lib/messages.ts";

const REFRESH_MS = 1000;

/** The sync group as the background script sees it, refreshed every second. */
export function usePlayerStatus(): PlayerStatus[] | undefined {
  const [players, setPlayers] = useState<PlayerStatus[]>();

  useEffect(() => {
    let active = true;
    async function refresh() {
      const request: StatusRequest = { type: "getStatus" };
      const response = (await ext.runtime.sendMessage(request)) as PlayerStatus[] | undefined;
      if (active) {
        setPlayers(response ?? []);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return players;
}
