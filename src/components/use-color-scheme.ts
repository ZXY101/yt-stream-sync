import { useEffect } from "react";

import { applyTheme, reloadTheme, systemThemeQuery } from "@/lib/theme.ts";

/**
 * Applies the theme with its `.dark` class: the user's choice on the settings page, or the
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
