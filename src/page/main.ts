// Runs in the page's own JavaScript world (manifest `"world": "MAIN"`), where YouTube's
// player methods are reachable. It has no extension APIs; it talks to the content script
// through window messages.
import { PAGE_TAG, type PlayerReport } from "../lib/messages.ts";
import { isContentMessage } from "../lib/validate.ts";
import { createPageAgent } from "./agent.ts";
import { createListener } from "./listener.ts";
import { findPlayer } from "./youtube.ts";

function post(report: PlayerReport | null) {
  window.postMessage({ tag: PAGE_TAG, report }, location.origin);
}

const listener = createListener({
  post: (clip) => window.postMessage({ tag: PAGE_TAG, clip }, location.origin),
});

const agent = createPageAgent({
  findPlayer: () => findPlayer(document),
  post,
  listener,
  now: () => performance.now() / 1000,
});

window.addEventListener("message", (event) => {
  if (event.source === window && isContentMessage(event.data)) {
    agent.run(event.data.command);
  }
});

setInterval(agent.tick, 1000);
