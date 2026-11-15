import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import { toggleTheme } from "@/lib/theme.ts";

import { useTheme } from "./use-color-scheme.ts";

/** Switches between light and dark; the choice is shared by the popup and settings page. */
export function ThemeToggle() {
  const theme = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={toggleTheme}>
      {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
    </Button>
  );
}
