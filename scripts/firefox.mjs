// Opens Firefox with the built add-on (dist/) for hand tests: `npm run firefox -- [url ...]`.
//
// web-ext installs the add-on over Firefox's own debugging protocol, not WebDriver, so this is a
// normal browser to YouTube (a WebDriver-controlled Firefox sets navigator.webdriver, and YouTube
// then freezes the streams). The add-on reloads after every `npm run build`.
//
// The profile in .firefox-profile/ is kept between runs (sign-ins, settings), with uBlock Origin
// so ads don't get in the way of a test.
//
// Firefox Developer Edition is used when it's installed: it's a separate app from the everyday
// Firefox, so screen-control tools can be granted the test browser alone. FIREFOX_BIN picks
// another Firefox, as in the E2E suite.
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { cmd } from "web-ext";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROFILE = path.join(ROOT, ".firefox-profile");
const PORT_FILE = path.join(PROFILE, "debugger-port");
const UBLOCK_ID = "uBlock0@raymondhill.net";
const UBLOCK_URL = "https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/latest.xpi";

/** The usual install locations of Firefox Developer Edition. */
function developerEditionPaths() {
  if (process.platform === "win32") {
    return [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], process.env.LOCALAPPDATA]
      .filter(Boolean)
      .map((dir) => path.join(dir, "Firefox Developer Edition", "firefox.exe"));
  }
  if (process.platform === "darwin") {
    return ["/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox"];
  }
  return (process.env.PATH ?? "")
    .split(path.delimiter)
    .filter(Boolean)
    .map((dir) => path.join(dir, "firefox-developer-edition"));
}

/** FIREFOX_BIN, else Developer Edition if installed, else the default Firefox. */
function firefoxBinary() {
  return (
    process.env.FIREFOX_BIN || developerEditionPaths().find((file) => existsSync(file)) || "firefox"
  );
}

/** Puts Mozilla's signed uBlock Origin package into the profile once. */
async function installUblock() {
  const file = path.join(PROFILE, "extensions", `${UBLOCK_ID}.xpi`);
  if (existsSync(file)) {
    return;
  }
  console.warn("Downloading uBlock Origin from addons.mozilla.org…");
  const response = await fetch(UBLOCK_URL);
  if (!response.ok) {
    throw new Error(`Couldn't download uBlock Origin: HTTP ${response.status}`);
  }
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await response.arrayBuffer()));
}

/** Tells scripts/firefox-debug.mjs where web-ext's debugging connection listens. */
function savePort(runner) {
  const port = runner.extensionRunners[0]?.runningInfo?.debuggerPort;
  if (!port) {
    return;
  }
  writeFileSync(PORT_FILE, String(port));
  runner.registerCleanup(() => rmSync(PORT_FILE, { force: true }));
}

await installUblock();
const firefox = firefoxBinary();
console.warn(`Starting ${firefox}`);
const runner = await cmd.run(
  {
    sourceDir: path.join(ROOT, "dist"),
    target: ["firefox-desktop"],
    firefox,
    firefoxProfile: PROFILE,
    profileCreateIfMissing: true,
    keepProfileChanges: true,
    pref: {
      // Firefox leaves add-ons that were put into the profile folder disabled unless this is 0.
      "extensions.autoDisableScopes": 0,
      // Stopping web-ext ends Firefox like a crash; don't reopen the last test's pages.
      "browser.sessionstore.resume_from_crash": false,
    },
    startUrl: process.argv.slice(2),
  },
  { shouldExitProgram: false },
);
savePort(runner);
