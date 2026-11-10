// Background script: an event page in Firefox, a service worker in Chrome. Every frame with a
// live player keeps a port open and reports each second, which also keeps this script awake.
import type { SyncSettings } from "../controller/types.ts";
import { ext } from "../lib/browser.ts";
import {
  PLAYER_PORT,
  type PlayerCommand,
  type PopupRequest,
  type ToContent,
} from "../lib/messages.ts";
import { isPlayerReport, isPopupRequest } from "../lib/validate.ts";
import { createCoordinator } from "./coordinator.ts";

// Fixed until the popup gets its controls (milestone 5). Group and nudges are the coordinator's.
const SETTINGS: Pick<SyncSettings, "enabled" | "safetyMargin"> = { enabled: true, safetyMargin: 0 };
const ports = new Map<string, chrome.runtime.Port>();

function send(id: string, command: PlayerCommand) {
  const message: ToContent = { type: "command", command };
  ports.get(id)?.postMessage(message);
}

const coordinator = createCoordinator({
  send,
  settings: () => SETTINGS,
  now: () => performance.now() / 1000,
});

function playerId(port: chrome.runtime.Port): string | undefined {
  const tabId = port.sender?.tab?.id;
  const frameId = port.sender?.frameId;
  if (tabId === undefined || frameId === undefined) {
    return undefined;
  }
  return `${tabId}:${frameId}`;
}

ext.runtime.onConnect.addListener((port) => {
  const id = playerId(port);
  if (port.name !== PLAYER_PORT || id === undefined) {
    return;
  }
  ports.set(id, port);
  port.onMessage.addListener((message: unknown) => {
    // Content scripts run inside YouTube's pages, so their messages are checked here too.
    const report = (message as { report?: unknown } | null)?.report;
    if (report === null || isPlayerReport(report)) {
      coordinator.report(id, report);
    }
  });
  port.onDisconnect.addListener(() => {
    ports.delete(id);
    coordinator.remove(id);
  });
});

function handlePopupRequest(request: PopupRequest) {
  if (request.type === "setInGroup") {
    coordinator.setInGroup(request.id, request.inGroup);
  } else if (request.type === "nudge") {
    coordinator.nudge(request.id, request.seconds);
  }
}

ext.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Only the popup may talk to the background this way; content scripts use their port.
  const fromPopup = sender.url === ext.runtime.getURL("popup/index.html");
  if (fromPopup && isPopupRequest(message)) {
    handlePopupRequest(message);
    sendResponse(coordinator.status());
  }
  return false;
});

setInterval(coordinator.tick, 1000);
