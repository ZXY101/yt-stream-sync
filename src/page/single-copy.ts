const KEY = "__ytStreamSyncPage";

type Holder = Record<string, { stop: () => void } | undefined>;

/**
 * Makes sure only the newest copy of the page script runs in a page. When the add-on is
 * updated or reloaded, Firefox injects the new scripts into open tabs, but a page script
 * already running there keeps going; several generations would then report and carry out
 * commands at once. The new copy stops the old one.
 */
export function takeOver(holder: object, stop: () => void): void {
  const running = holder as Holder;
  running[KEY]?.stop();
  running[KEY] = { stop };
}
