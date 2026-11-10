// Content script (isolated world) in every YouTube frame, embeds included.
import { ext } from "../lib/browser.ts";
import { CONTENT_TAG, PLAYER_PORT } from "../lib/messages.ts";
import { createBridge } from "./bridge.ts";

const bridge = createBridge({
  connect: () => ext.runtime.connect({ name: PLAYER_PORT }),
  sendToPage: (command) => window.postMessage({ tag: CONTENT_TAG, command }, location.origin),
});

window.addEventListener("message", (event) => {
  if (event.source === window) {
    bridge.fromPage(event.data);
  }
});
