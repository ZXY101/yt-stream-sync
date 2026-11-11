// Opens Firefox with the built add-on (dist/) for hand tests: `npm run firefox -- [url ...]`.
//
// web-ext installs the add-on over Firefox's own debugging protocol, not WebDriver, so this is a
// normal browser to YouTube (a WebDriver-controlled Firefox sets navigator.webdriver, and YouTube
// then freezes the streams). The add-on reloads after every `npm run build`.
//
// The profile in .firefox-profile/ is kept between runs (sign-ins, settings), with uBlock Origin
// so ads don't get in the way of a test. FIREFOX_BIN picks another Firefox, as in the E2E suite.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { cmd } from "web-ext";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROFILE = path.join(ROOT, ".firefox-profile");
const UBLOCK_ID = "uBlock0@raymondhill.net";
const UBLOCK_URL = "https://addons.mozilla.org/firefox/downloads/latest/ublock-origin/latest.xpi";

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

await installUblock();
await cmd.run(
  {
    sourceDir: path.join(ROOT, "dist"),
    target: ["firefox-desktop"],
    firefox: process.env.FIREFOX_BIN || "firefox",
    firefoxProfile: PROFILE,
    profileCreateIfMissing: true,
    keepProfileChanges: true,
    // Firefox leaves add-ons that were put into the profile folder disabled unless this is 0.
    pref: { "extensions.autoDisableScopes": 0 },
    startUrl: process.argv.slice(2),
  },
  { shouldExitProgram: false },
);
