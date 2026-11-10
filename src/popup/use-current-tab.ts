import { useEffect, useState } from "react";

import { ext } from "../lib/browser.ts";

/** When the popup is opened as a page instead (tests do this), `?tab=<id>` names the tab. */
function tabFromQuery(): number | undefined {
  const value = new URLSearchParams(location.search).get("tab");
  return value === null ? undefined : Number(value);
}

/** The tab the popup was opened from. */
export function useCurrentTab(): number | undefined {
  const [tabId, setTabId] = useState(tabFromQuery);

  useEffect(() => {
    if (tabId !== undefined) {
      return;
    }
    void ext.tabs.query({ active: true, currentWindow: true }).then(([tab]) => setTabId(tab?.id));
  }, [tabId]);

  return tabId;
}
