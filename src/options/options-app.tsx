import { useColorScheme } from "@/components/use-color-scheme.ts";

import { YtdlpzSection } from "./ytdlpz-section.tsx";

export function OptionsApp() {
  useColorScheme();
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 sm:p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">yt-stream-sync settings</h1>
        <p className="text-sm text-muted-foreground">
          Everyday controls are in the toolbar popup. These are extras you can turn on.
        </p>
      </header>
      <section aria-labelledby="advanced" className="flex flex-col gap-3">
        <h2
          id="advanced"
          className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Advanced
        </h2>
        <YtdlpzSection />
      </section>
    </main>
  );
}
