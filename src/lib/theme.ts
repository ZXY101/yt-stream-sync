/**
 * Light or dark: the user's choice on the settings page, or the system's when they haven't
 * picked one. Kept in the extension pages' localStorage, so the popup and the settings page
 * share it.
 */
export type Theme = "light" | "dark";

const DARK_QUERY = "(prefers-color-scheme: dark)";
const STORAGE_KEY = "yt-stream-sync-theme";

const listeners = new Set<() => void>();
let preference: Theme | null = null;

function systemTheme(): Theme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function readPreference(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

function writePreference(theme: Theme | null) {
  try {
    if (theme) {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Storage can be blocked. The choice then lasts until the page closes.
  }
}

function getTheme(): Theme {
  return preference ?? systemTheme();
}

/** Sets the theme's `.dark` class and tells subscribers. */
export function applyTheme() {
  document.documentElement.classList.toggle("dark", getTheme() === "dark");
  for (const listener of listeners) {
    listener();
  }
}

/** Reads the stored choice again (at start, and when another page changed it). */
export function reloadTheme() {
  preference = readPreference();
  applyTheme();
}

/** What the user picked in the settings; "system" follows the system's light or dark. */
export type ThemeChoice = Theme | "system";

export function getThemeChoice(): ThemeChoice {
  return preference ?? "system";
}

export function setThemeChoice(choice: ThemeChoice) {
  preference = choice === "system" ? null : choice;
  writePreference(preference);
  applyTheme();
}

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The media query to watch for system changes. */
export function systemThemeQuery(): MediaQueryList {
  return window.matchMedia(DARK_QUERY);
}
