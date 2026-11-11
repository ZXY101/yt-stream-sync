import { useColorScheme } from "@/components/use-color-scheme.ts";

import { YtdlpzSection } from "./ytdlpz-section.tsx";

// One section so far. When more settings come, give each its own card here.
export function OptionsApp() {
  useColorScheme();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <h1 className="text-xl font-semibold">yt-stream-sync settings</h1>
      <YtdlpzSection />
    </main>
  );
}
