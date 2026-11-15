import { useSyncExternalStore } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { getThemeChoice, setThemeChoice, subscribeToTheme, type ThemeChoice } from "@/lib/theme.ts";

// Drawn by us, not the browser: Firefox's native radio barely shows the pick in dark mode.
const RADIO =
  "size-4 shrink-0 appearance-none rounded-full border border-input outline-none " +
  "checked:border-primary checked:bg-primary checked:shadow-[inset_0_0_0_3px_var(--background)] " +
  "focus-visible:ring-3 focus-visible:ring-ring/50";

const CHOICES: readonly { value: ThemeChoice; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** Light, dark, or following the system; the popup and this page both follow it. */
export function ThemeSection() {
  const choice = useSyncExternalStore(subscribeToTheme, getThemeChoice);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Theme</CardTitle>
        <CardDescription>
          For the popup and this page. System follows your computer.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="sr-only">Theme</legend>
          {CHOICES.map(({ value, label }) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="theme"
                value={value}
                checked={choice === value}
                onChange={() => setThemeChoice(value)}
                className={RADIO}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </CardContent>
    </Card>
  );
}
