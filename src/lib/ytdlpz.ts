// Settings for the optional yt-dlp-z alignment (the settings page), shared by the
// settings page and the background script.

export const YTDLPZ_KEY = "ytdlpz";

export interface YtdlpzSettings {
  /** The user turned alignment on (and granted access to `address`). */
  enabled: boolean;
  /** The server's base address, e.g. `https://ytdlpz.example.ts.net` (no trailing slash). */
  address: string;
  /** A full-access API token from yt-dlp-z's Settings page. */
  token: string;
}

const MAX_TEXT = 2000;

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT;
}

/** Stored settings, or undefined when they're missing or not in the expected shape. */
export function readYtdlpzSettings(value: unknown): YtdlpzSettings | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { enabled, address, token } = value as Record<string, unknown>;
  if (typeof enabled !== "boolean" || !isText(address) || !isText(token)) {
    return undefined;
  }
  return { enabled, address, token };
}

/** What the user typed, as a base address: http(s), host and any sub-path, no trailing slash. */
export function normalizeAddress(input: string): string {
  const trimmed = input.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  const url = new URL(withScheme);
  // Keep a path: the server may sit under a sub-path behind a reverse proxy.
  const path = url.pathname.replace(/\/+$/, "");
  return `${url.protocol}//${url.host}${path}`;
}

/** The host permission to ask for: this one server, nothing else. */
export function originPattern(address: string): string {
  const url = new URL(address);
  return `${url.protocol}//${url.hostname}/*`;
}
