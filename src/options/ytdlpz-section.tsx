import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";

import { useYtdlpzSettings } from "./use-ytdlpz-settings.ts";
import { YtdlpzForm } from "./ytdlpz-form.tsx";

const YTDLPZ_URL = "https://github.com/ZXY101/yt-dlp-z";

function HowItWorks() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>
        Archives of the same collab can be minutes apart, more than the add-on can find by listening
        to the streams. With this on, the popup offers <b>Align with yt-dlp-z</b> for archives in
        the sync group: your own{" "}
        <a
          className="underline underline-offset-2"
          href={YTDLPZ_URL}
          target="_blank"
          rel="noreferrer"
        >
          yt-dlp-z
        </a>{" "}
        server downloads a small audio-only copy of each, compares them over their whole length, and
        deletes the audio again. The add-on then sets the offsets, and matching by audio fine-tunes
        them.
      </p>
      <p className="text-muted-foreground">
        What leaves your browser: only when you click Align, the links of the archives in the sync
        group, sent to your server with your token. Nothing else, and nothing on its own.
      </p>
    </div>
  );
}

function SetupSteps() {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <h4 className="font-medium">Setting it up</h4>
      <ol className="ml-5 list-decimal space-y-1 text-muted-foreground">
        <li>Run a yt-dlp-z server with alignment (see its docs, “Aligning recordings”).</li>
        <li>
          In yt-dlp-z, open Settings → API tokens and make a token with full access (a send-only
          token can&apos;t align).
        </li>
        <li>
          Enter the server&apos;s address and the token below, then click Turn on. Your browser asks
          to let the add-on reach that address; Firefox also asks about sending browsing activity,
          because stream links go to the server.
        </li>
      </ol>
      <p className="mt-1 text-xs text-muted-foreground">
        Works for ended streams on YouTube watch pages (embeds have no start time), up to 12 hours
        each. A pair takes about one to two minutes.
      </p>
    </div>
  );
}

/** Settings → Advanced: lining archives up through the user's yt-dlp-z. */
export function YtdlpzSection() {
  const { settings, busy, outcome, enable, disable } = useYtdlpzSettings();
  const on = settings?.enabled ?? false;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Align archives with yt-dlp-z
          <Badge variant={on ? "default" : "secondary"}>{on ? "On" : "Off"}</Badge>
        </CardTitle>
        <CardDescription>Optional. Needs your own yt-dlp-z server.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <HowItWorks />
        <SetupSteps />
        {settings && (
          <YtdlpzForm
            settings={settings}
            busy={busy}
            outcome={outcome}
            onEnable={(address, token) => void enable(address, token)}
            onDisable={() => void disable()}
          />
        )}
      </CardContent>
    </Card>
  );
}
