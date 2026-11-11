import { useEffect, useState } from "react";

import { ext } from "../lib/browser.ts";
import {
  normalizeAddress,
  readYtdlpzSettings,
  YTDLPZ_KEY,
  type YtdlpzSettings,
} from "../lib/ytdlpz.ts";
import { releaseAccess, requestAccess, supportsDataConsent } from "./access.ts";
import { testConnection } from "./connection-test.ts";

export type Outcome = { tone: "ok" | "error"; text: string } | undefined;

const EMPTY: YtdlpzSettings = { enabled: false, address: "", token: "" };

async function save(settings: YtdlpzSettings) {
  await ext.storage.local.set({ [YTDLPZ_KEY]: settings });
}

/** Tests the connection and, if it works, saves alignment as on. */
async function testAndSave(address: string, token: string): Promise<Outcome> {
  const problem = await testConnection(address, token);
  if (problem) {
    return { tone: "error", text: problem };
  }
  await save({ enabled: true, address, token });
  return { tone: "ok", text: "Connected. Alignment is on." };
}

/** The yt-dlp-z settings, and turning alignment on (checked first) and off. */
export function useYtdlpzSettings() {
  const [settings, setSettings] = useState<YtdlpzSettings>();
  const [dataConsent, setDataConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>();

  useEffect(() => {
    async function load() {
      const stored = await ext.storage.local.get(YTDLPZ_KEY);
      setSettings(readYtdlpzSettings(stored[YTDLPZ_KEY]) ?? EMPTY);
      setDataConsent(await supportsDataConsent());
    }
    void load();
  }, []);

  async function enable(addressInput: string, tokenInput: string) {
    let address: string;
    try {
      address = normalizeAddress(addressInput);
    } catch {
      setOutcome({ tone: "error", text: "That isn't a web address." });
      return;
    }
    // First, while the click still counts: browsers only ask for permission from one.
    const allowed = await requestAccess(address, dataConsent);
    if (!allowed) {
      setOutcome({ tone: "error", text: "The add-on needs your permission to reach the server." });
      return;
    }
    setBusy(true);
    setOutcome(undefined);
    const token = tokenInput.trim();
    const result = await testAndSave(address, token);
    setBusy(false);
    setOutcome(result);
    if (result?.tone === "ok") {
      setSettings({ enabled: true, address, token });
    }
  }

  async function disable() {
    if (!settings) {
      return;
    }
    const next = { ...settings, enabled: false };
    await save(next);
    await releaseAccess(settings.address, dataConsent);
    setSettings(next);
    setOutcome({ tone: "ok", text: "Alignment is off." });
  }

  return { settings, busy, outcome, enable, disable };
}
