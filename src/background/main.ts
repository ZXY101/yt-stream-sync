// Background script: an event page in Firefox, a service worker in Chrome. Every frame with a
// live player keeps a port open and reports each second, which also keeps this script awake.
import type { SyncSettings } from "../controller/types.ts";
import { ext } from "../lib/browser.ts";
import {
  PLAYER_PORT,
  playerId,
  type PlayerCommand,
  type PopupRequest,
  type ToContent,
} from "../lib/messages.ts";
import { isAudioClip, isPlayerReport, isPopupRequest } from "../lib/validate.ts";
import { readYtdlpzSettings, YTDLPZ_KEY } from "../lib/ytdlpz.ts";
import { createCoordinator } from "./coordinator.ts";

// Fixed until the popup gets its controls (milestone 5). Group and nudges are the coordinator's.
const SETTINGS: Pick<SyncSettings, "enabled" | "safetyMargin"> = { enabled: true, safetyMargin: 0 };
const ports = new Map<string, chrome.runtime.Port>();
const AUDIO_SYNC_KEY = "audioSync";

function send(id: string, command: PlayerCommand) {
  const message: ToContent = { type: "command", command };
  ports.get(id)?.postMessage(message);
}

const coordinator = createCoordinator({
  send,
  settings: () => SETTINGS,
  now: () => performance.now() / 1000,
});

function portPlayerId(port: chrome.runtime.Port): string | undefined {
  const tabId = port.sender?.tab?.id;
  const frameId = port.sender?.frameId;
  if (tabId === undefined || frameId === undefined) {
    return undefined;
  }
  return playerId(tabId, frameId);
}

ext.runtime.onConnect.addListener((port) => {
  const id = portPlayerId(port);
  if (port.name !== PLAYER_PORT || id === undefined) {
    return;
  }
  ports.set(id, port);
  port.onMessage.addListener((message: unknown) => {
    // Content scripts run inside YouTube's pages, so their messages are checked here too.
    const { report, clip } = (message ?? {}) as { report?: unknown; clip?: unknown };
    if (report === null || isPlayerReport(report)) {
      coordinator.report(id, report);
    } else if (isAudioClip(clip)) {
      coordinator.receiveClip(id, clip);
    }
  });
  port.onDisconnect.addListener(() => {
    ports.delete(id);
    coordinator.remove(id);
  });
});

const POPUP_URL = new URL(ext.runtime.getURL("popup/index.html"));

/** The popup's own page, whatever its query (tests open it with `?tab=`). */
function isPopupUrl(url: string | undefined): boolean {
  const parsed = URL.parse(url ?? "");
  return parsed?.origin === POPUP_URL.origin && parsed.pathname === POPUP_URL.pathname;
}

function handlePopupRequest(request: PopupRequest) {
  if (request.type === "setInGroup") {
    coordinator.setInGroup(request.id, request.inGroup);
  } else if (request.type === "nudge") {
    coordinator.nudge(request.id, request.seconds);
  } else if (request.type === "setAudioSync") {
    coordinator.setAudioSync(request.on);
    void ext.storage.local.set({ [AUDIO_SYNC_KEY]: request.on });
  } else if (request.type === "rematchAudio") {
    coordinator.rematchAudio();
  } else if (request.type === "clearGroup") {
    coordinator.clearGroup();
  } else if (request.type === "alignArchives") {
    coordinator.alignArchives();
  } else if (request.type === "cancelAlign") {
    coordinator.cancelAlign();
  }
}

ext.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Only the popup may talk to the background this way; content scripts use their port.
  const fromPopup = isPopupUrl(sender.url);
  if (fromPopup && isPopupRequest(message)) {
    handlePopupRequest(message);
    const header = `yt-stream-sync ${ext.runtime.getManifest().version} · ${navigator.userAgent}`;
    const debug = { log: `${header}\n${coordinator.debugLog()}` };
    sendResponse(message.type === "getDebugLog" ? debug : coordinator.status());
  }
  return false;
});

// Matching by audio is on unless the user turned it off. yt-dlp-z alignment is off unless the
// user set it up on the settings page.
async function loadSettings() {
  const stored = await ext.storage.local.get([AUDIO_SYNC_KEY, YTDLPZ_KEY]);
  coordinator.setAudioSync(stored[AUDIO_SYNC_KEY] !== false);
  coordinator.setYtdlpz(readYtdlpzSettings(stored[YTDLPZ_KEY]));
}

void loadSettings();

// The settings page saves straight to storage.
ext.storage.onChanged.addListener((changes, area) => {
  const change = changes[YTDLPZ_KEY];
  if (area === "local" && change) {
    coordinator.setYtdlpz(readYtdlpzSettings(change.newValue));
  }
});

setInterval(coordinator.tick, 1000);
