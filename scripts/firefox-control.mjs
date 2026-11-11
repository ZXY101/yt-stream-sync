// Controls the add-on in the Firefox that `npm run firefox` opened, for hand tests on real
// YouTube pages: the same requests the popup sends, over web-ext's debugging connection (RDP).
// Dev tool only: nothing here ships in the add-on. Usage (a player is its video id, a part of
// its channel name, or its position in `status`):
//   npm run control -- status [--json]       the sync group and every player the add-on sees
//   npm run control -- open <id|url>…        watch pages, each in its own window
//   npm run control -- sync [player…]        add players to the sync group (default: all)
//   npm run control -- remove <player>       take one out of the group
//   npm run control -- clear                 empty the group
//   npm run control -- nudge <player> <s>    move it by s seconds (positive: ahead)
//   npm run control -- offset <player> <t>   set its offset: -125.3, -2:05.3, +4 s
//   npm run control -- audio on|off          matching by audio
//   npm run control -- rematch               match by audio again now
//   npm run control -- log                   the popup's debug log
//   npm run control -- quit                  close the test Firefox (and npm run firefox)
import { readFileSync } from "node:fs";
import path from "node:path";

import { textToOffset } from "../src/popup/offset-text.ts";
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
 * Sends a popup request to the background script. A message from the background page doesn't
 * reach its own listeners, so it goes through the popup page loaded in a hidden frame.
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

function watchUrl(arg) {
  return arg.startsWith("http") ? arg : `https://www.youtube.com/watch?v=${arg}`;
}

/** Finds a player by video id, position in `status` (1, 2, …) or part of the channel name. */
function findPlayer(status, name) {
  const players = status.players;
  const lower = String(name).toLowerCase();
  const found =
    players.find((player) => player.videoId === name || player.id === name) ??
    players[Number(name) - 1] ??
    players.find((player) => player.channel.toLowerCase().includes(lower));
  if (!found) {
    throw new Error(`no player "${name}"; see status`);
  }
  return found;
}

function seconds(value) {
  return value === undefined ? "–" : `${value.toFixed(1)} s`;
}

/** One line per player: what a tester needs to judge the sync at a glance. */
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
    print("No players: open a watch page first.");
  }
  print(
    `audio: ${JSON.stringify(status.audio)}${status.mixed ? " (live and archive mixed!)" : ""}`,
  );
}

async function syncPlayers(background, names) {
  const status = await askAddon(background, { type: "getStatus" });
  const players = names.length > 0 ? names.map((name) => findPlayer(status, name)) : status.players;
  let latest = status;
  for (const player of players.filter((item) => !item.inGroup)) {
    // oxlint-disable-next-line no-await-in-loop
    latest = await askAddon(background, { type: "setInGroup", id: player.id, inGroup: true });
  }
  printStatus(latest, false);
}

/** Sets an absolute offset, sent as one nudge by the difference (like the popup's field). */
async function setOffset(background, name, text) {
  const target = textToOffset(String(text));
  if (target === undefined) {
    throw new Error(`"${text}" isn't an offset (e.g. -125.3, -2:05.3, +4 s)`);
  }
  const player = findPlayer(await askAddon(background, { type: "getStatus" }), name);
  const request = { type: "nudge", id: player.id, seconds: target - player.offset };
  printStatus(await askAddon(background, request), false);
}

async function changeGroup(background, request) {
  printStatus(await askAddon(background, request), false);
}

async function withPlayer(background, name, makeRequest) {
  const player = findPlayer(await askAddon(background, { type: "getStatus" }), name);
  await changeGroup(background, makeRequest(player));
}

/**
 * Closes every window; Firefox quits with the last one. On Windows, stopping web-ext (Ctrl+C)
 * can leave Firefox running, so this is the clean way to end a test.
 */
async function closeWindows(background) {
  const expression = `browser.windows.getAll().then(async (windows) => {
    for (const window of windows) {
      await browser.windows.remove(window.id);
    }
  })`;
  // The answer can be lost when the last window takes the add-on down with it.
  await background.evaluate(expression).catch(() => undefined);
  print("closed the test Firefox");
}

async function openPages(background, args) {
  for (const arg of args) {
    const url = JSON.stringify(watchUrl(arg));
    // oxlint-disable-next-line no-await-in-loop
    await background.evaluate(`browser.windows.create({ url: ${url} }).then(() => "")`);
    print(`opened ${watchUrl(arg)}`);
  }
}

const COMMANDS = {
  status: async (bg, args) => {
    printStatus(await askAddon(bg, { type: "getStatus" }), args.includes("--json"));
  },
  open: (bg, args) => openPages(bg, args),
  sync: (bg, args) => syncPlayers(bg, args),
  remove: (bg, [name]) =>
    withPlayer(bg, name, (player) => ({ type: "setInGroup", id: player.id, inGroup: false })),
  clear: (bg) => changeGroup(bg, { type: "clearGroup" }),
  nudge: (bg, [name, amount]) =>
    withPlayer(bg, name, (player) => ({ type: "nudge", id: player.id, seconds: Number(amount) })),
  offset: (bg, [name, text]) => setOffset(bg, name, text),
  audio: (bg, [state]) => changeGroup(bg, { type: "setAudioSync", on: state !== "off" }),
  rematch: (bg) => changeGroup(bg, { type: "rematchAudio" }),
  log: async (bg) => print((await askAddon(bg, { type: "getDebugLog" })).log),
  quit: (bg) => closeWindows(bg),
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
  process.stderr.write(`firefox-control: ${error.message}\n`);
  process.exitCode = 1;
}
