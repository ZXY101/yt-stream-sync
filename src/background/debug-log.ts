const KEEP = 300;

/**
 * Recent decisions and observations, newest last, for the popup's "Copy debug log": the only
 * way to see what the add-on did in someone else's browser. Never holds audio or URLs.
 */
export function createDebugLog(now: () => number = Date.now) {
  const lines: string[] = [];

  function add(text: string) {
    lines.push(`${new Date(now()).toISOString().slice(11, 23)} ${text}`);
    if (lines.length > KEEP) {
      lines.shift();
    }
  }

  return { add, text: () => lines.join("\n") };
}
