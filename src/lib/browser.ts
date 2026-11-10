// Firefox names the WebExtension API `browser`, Chrome names it `chrome`. Both return
// promises in Manifest V3, so one name covers both.
const firefox = (globalThis as { browser?: typeof chrome }).browser;

export const ext: typeof chrome = firefox ?? chrome;
