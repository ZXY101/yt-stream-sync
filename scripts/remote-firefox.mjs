// Drives a real Firefox on another machine over WebDriver BiDi, for hand tests on real
// YouTube watch pages. Dev tool only: nothing here ships in the add-on.
//
// The other machine starts Firefox with remote debugging on its own localhost and opens an
// SSH tunnel to this one (docs/remote-firefox.md), so the browser shows up here as
// ws://127.0.0.1:9222. Usage:
//   node scripts/remote-firefox.mjs install        load the latest build (npm run build first)
//   node scripts/remote-firefox.mjs open <id|url>… open watch pages in new tabs
//   node scripts/remote-firefox.mjs tabs           list open tabs
//   node scripts/remote-firefox.mjs status         the add-on's sync status (JSON)
//   node scripts/remote-firefox.mjs log            the add-on's debug log
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(path.join(ROOT, "static/manifest.json"), "utf8"));
const ADDON = manifest.browser_specific_settings.gecko.id;
// Pinned in the remote profile's user.js, like in the E2E tests, so popup URLs are known.
const ADDON_UUID = "6f1c2b7e-0d3a-4e59-9a61-2c8f4b5d7e10";
const POPUP = `moz-extension://${ADDON_UUID}/popup/index.html`;
const ENDPOINT = process.env.REMOTE_FIREFOX ?? "ws://127.0.0.1:9222/session";

/** A minimal BiDi client: one request at a time is all this tool needs. */
function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const pending = new Map();
    let nextId = 1;
    socket.addEventListener("error", () => reject(new Error(`can't reach ${url}`)));
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      const waiter = pending.get(message.id);
      if (!waiter) {
        return; // An event; none are subscribed to.
      }
      pending.delete(message.id);
      if (message.type === "error") {
        waiter.reject(new Error(`${message.error}: ${message.message}`));
      } else {
        waiter.resolve(message.result);
      }
    });
    function send(method, params = {}) {
      const id = nextId;
      nextId += 1;
      socket.send(JSON.stringify({ id, method, params }));
      return new Promise((done, fail) => {
        pending.set(id, { resolve: done, reject: fail });
        setTimeout(() => fail(new Error(`${method}: no answer in 15 s`)), 15_000);
      });
    }
    socket.addEventListener("open", () => resolve({ send, close: () => socket.close() }));
  });
}

/** Command output goes to stdout, so it can be piped (e.g. the debug log into a file). */
function print(text) {
  process.stdout.write(`${text}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Zips dist/ (after `npm run build`) and returns it as base64. */
function packedBuild() {
  const zip = path.join(tmpdir(), "yt-stream-sync-remote.zip");
  rmSync(zip, { force: true });
  execFileSync("zip", ["-qr", zip, "."], { cwd: path.join(ROOT, "dist") });
  return readFileSync(zip).toString("base64");
}

async function install(bidi) {
  await bidi.send("webExtension.uninstall", { extension: ADDON }).catch(() => undefined);
  const value = packedBuild();
  const result = await bidi.send("webExtension.install", {
    extensionData: { type: "base64", value },
  });
  print(`installed ${result.extension}; refresh open YouTube tabs once`);
}

function watchUrl(arg) {
  return arg.startsWith("http") ? arg : `https://www.youtube.com/watch?v=${arg}`;
}

async function open(bidi, args) {
  for (const arg of args) {
    // oxlint-disable-next-line no-await-in-loop
    const { context } = await bidi.send("browsingContext.create", {
      type: "tab",
      background: true,
    });
    // oxlint-disable-next-line no-await-in-loop
    await bidi.send("browsingContext.navigate", { context, url: watchUrl(arg), wait: "none" });
    print(`opened ${watchUrl(arg)}`);
  }
}

async function tabs(bidi) {
  const { contexts } = await bidi.send("browsingContext.getTree", { maxDepth: 0 });
  contexts.forEach((context) => print(context.url));
}

async function evaluate(bidi, context, expression) {
  const result = await bidi.send("script.evaluate", {
    expression,
    target: { context },
    awaitPromise: true,
  });
  if (result.type === "exception") {
    throw new Error(result.exceptionDetails.text);
  }
  return result.result.value;
}

/** Opens the popup as a page in a background tab, asks the background script, closes it. */
async function askAddon(bidi, request) {
  const { context } = await bidi.send("browsingContext.create", { type: "tab", background: true });
  try {
    // The navigation into the extension's process never reports done over BiDi; poll instead.
    await bidi.send("browsingContext.navigate", { context, url: POPUP, wait: "none" });
    for (let tries = 0; tries < 50; tries += 1) {
      // oxlint-disable-next-line no-await-in-loop
      const ready = await evaluate(bidi, context, "location.href").catch(() => "");
      if (ready === POPUP) {
        break;
      }
      // oxlint-disable-next-line no-await-in-loop
      await sleep(100);
    }
    const body = JSON.stringify(request);
    const expression = `browser.runtime.sendMessage(${body}).then((r) => JSON.stringify(r))`;
    return JSON.parse(await evaluate(bidi, context, expression));
  } finally {
    await bidi.send("browsingContext.close", { context });
  }
}

async function run(bidi, command, args) {
  if (command === "install") {
    await install(bidi);
  } else if (command === "open") {
    await open(bidi, args);
  } else if (command === "tabs") {
    await tabs(bidi);
  } else if (command === "status") {
    print(JSON.stringify(await askAddon(bidi, { type: "getStatus" }), null, 2));
  } else if (command === "log") {
    print((await askAddon(bidi, { type: "getDebugLog" })).log);
  } else {
    throw new Error("commands: install | open <id|url>… | tabs | status | log");
  }
}

async function main() {
  const [command = "", ...args] = process.argv.slice(2);
  const bidi = await connect(ENDPOINT);
  try {
    await bidi.send("session.new", { capabilities: {} });
    await run(bidi, command, args);
  } finally {
    // One BiDi session at a time: end it so the next run can connect.
    await bidi.send("session.end").catch(() => undefined);
    bidi.close();
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(`remote-firefox: ${error.message} (is the tunnel window open?)\n`);
  process.exitCode = 1;
}
