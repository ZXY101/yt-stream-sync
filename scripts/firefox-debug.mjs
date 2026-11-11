// Shows what the add-on is doing in the Firefox that `npm run firefox` opened, while someone
// hand-tests it: the popup's sync status and its debug log, read over web-ext's debugging
// connection (RDP). Read-only: it never changes the sync group or the players. Dev tool only:
// nothing here ships in the add-on. Usage:
//   npm run debug -- status [--json]   the sync group and every player the add-on sees
//   npm run debug -- log               the popup's debug log
import { readFileSync } from "node:fs";
import path from "node:path";

import { openBackground } from "./firefox-rdp.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT_FILE = path.join(ROOT, ".firefox-profile", "debugger-port");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "static/manifest.json"), "utf8"));
const ADDON_ID = manifest.browser_specific_settings.gecko.id;

/** Command output goes to stdout, so it can be piped (e.g. the debug log into a file). */
function print(text) {
  process.stdout.write(`${text}\n`);
}

/**
 * Sends a read-only popup request to the background script. A message from the background page
 * doesn't reach its own listeners, so it goes through the popup page in a hidden frame.
 */
function askAddon(background, request) {
  const expression = `(async () => {
    const frame = document.createElement("iframe");
    frame.src = browser.runtime.getURL("popup/index.html");
    const loaded = new Promise((done) => frame.addEventListener("load", done, { once: true }));
    document.body.append(frame);
    await loaded;
    try {
      const answer = await frame.contentWindow.browser.runtime.sendMessage(${JSON.stringify(request)});
      return JSON.stringify(answer);
    } finally {
      frame.remove();
    }
  })()`;
  return background.evaluate(expression).then((text) => JSON.parse(text));
}

function seconds(value) {
  return value === undefined ? "–" : `${value.toFixed(1)} s`;
}

/** One line per player: what's needed to judge the sync at a glance. */
function playerLine(player, index) {
  const where =
    player.kind === "live"
      ? `latency ${seconds(player.latency)}`
      : `at ${seconds(player.position)}`;
  const group = player.inGroup ? `in group, offset ${seconds(player.offset)}` : "not in group";
  const error = player.error === undefined ? "" : `, off by ${seconds(player.error)}`;
  const audio = player.hearing ? `, audio ${player.hearing}` : "";
  return (
    `${index + 1}. ${player.videoId} ${player.channel} [${player.kind}, ${player.state}, ` +
    `×${player.playbackRate}] ${where}; ${group}${error}${player.stuck ? " (stuck)" : ""}${audio}`
  );
}

function printStatus(status, json) {
  if (json) {
    // Waveforms are hundreds of numbers each; leave them out.
    const players = status.players.map(({ waveform: _waveform, ...player }) => player);
    print(JSON.stringify({ ...status, players }, null, 2));
    return;
  }
  status.players.forEach((player, index) => print(playerLine(player, index)));
  if (status.players.length === 0) {
    print("No players.");
  }
  print(
    `audio: ${JSON.stringify(status.audio)}${status.mixed ? " (live and archive mixed!)" : ""}`,
  );
}

const COMMANDS = {
  status: async (background, args) => {
    printStatus(await askAddon(background, { type: "getStatus" }), args.includes("--json"));
  },
  log: async (background) => print((await askAddon(background, { type: "getDebugLog" })).log),
};

function debuggerPort() {
  try {
    return Number(readFileSync(PORT_FILE, "utf8"));
  } catch {
    throw new Error("no test Firefox running: start it with npm run firefox");
  }
}

async function main() {
  const [command = "", ...args] = process.argv.slice(2);
  const action = Object.hasOwn(COMMANDS, command) ? COMMANDS[command] : undefined;
  if (!action) {
    throw new Error(`commands: ${Object.keys(COMMANDS).join(" | ")}`);
  }
  const background = await openBackground(debuggerPort(), ADDON_ID);
  try {
    await action(background, args);
  } finally {
    background.close();
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`firefox-debug: ${error.message}\n`);
  process.exitCode = 1;
}
