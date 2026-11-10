import { useState } from "react";

import { Button } from "@/components/ui/button.tsx";

import { ext } from "../lib/browser.ts";

/** Copies the background's debug log, so the user can send it along with a bug report. */
export function DebugLogButton() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const answer = (await ext.runtime.sendMessage({ type: "getDebugLog" })) as { log?: string };
    await navigator.clipboard.writeText(answer?.log ?? "");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="link"
      size="xs"
      className="self-start px-0 text-muted-foreground"
      onClick={() => void copy()}
    >
      {copied ? "Copied" : "Copy debug log"}
    </Button>
  );
}
