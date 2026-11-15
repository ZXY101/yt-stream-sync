import { useEffect, useSyncExternalStore } from "react";

import {
  applyTheme,
  getTheme,
  reloadTheme,
  subscribeToTheme,
  systemThemeQuery,
  type Theme,
} from "@/lib/theme.ts";

/**
 * Applies the theme with its `.dark` class: the user's choice from the theme toggle, or the
 * system's light or dark setting. Follows system changes, and choices made in another page.
 */
export function useColorScheme() {
  useEffect(() => {
    reloadTheme();
    const query = systemThemeQuery();
    query.addEventListener("change", applyTheme);
    window.addEventListener("storage", reloadTheme);
    return () => {
      query.removeEventListener("change", applyTheme);
      window.removeEventListener("storage", reloadTheme);
    };
  }, []);
}

/** The theme in use now, for controls that show it. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeToTheme, getTheme);
}
