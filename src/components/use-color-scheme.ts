import { useEffect } from "react";

/** Follows the system's light or dark setting, with the theme's `.dark` class. */
export function useColorScheme() {
  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    function apply() {
      document.documentElement.classList.toggle("dark", query.matches);
    }
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
}
