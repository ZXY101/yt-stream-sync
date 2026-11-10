import type { PlayerCommand, ToBackground, ToContent } from "../lib/messages.ts";
import { isPageMessage, isPlayerCommand } from "../lib/validate.ts";

/** The slice of `chrome.runtime.Port` the bridge uses, so tests can pass a fake. */
export interface BridgePort {
  postMessage(message: ToBackground): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

export interface BridgeOptions {
  connect: () => BridgePort;
  sendToPage: (command: PlayerCommand) => void;
}

/**
 * Passes reports from the page script to the background and commands back. A frame only
 * joins the sync group (opens a port) once it has a live player to report.
 */
export function createBridge(options: BridgeOptions) {
  let port: BridgePort | undefined;

  function openPort(): BridgePort {
    const opened = options.connect();
    opened.onMessage.addListener((message) => {
      const command = (message as Partial<ToContent> | null)?.command;
      if (isPlayerCommand(command)) {
        options.sendToPage(command);
      }
    });
    opened.onDisconnect.addListener(() => {
      port = undefined;
    });
    return opened;
  }

  function fromPage(data: unknown) {
    if (!isPageMessage(data)) {
      return;
    }
    if (!port && data.report === null) {
      return;
    }
    port ??= openPort();
    port.postMessage({ type: "report", report: data.report });
  }

  return { fromPage };
}
