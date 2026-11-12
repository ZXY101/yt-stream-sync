# yt-stream-sync

A browser extension that keeps two or more YouTube live streams of the same collab in sync,
so you can watch them side by side without fiddling with playback speed.

> **Status:** early development. Live streams and archives sync in Firefox (watch pages and
> embeds); you add streams to the sync group from the popup. Chrome support comes later.

## How it will work

- **Opt-in:** on a stream's tab, click the add-on and **Add** it. Go to the other stream's
  tab and add that one too. Nothing is touched until you do, and syncing starts once two or
  more are added. The popup shows the sync group with thumbnails, so streams are easy to
  tell apart.
- Works on YouTube watch pages (one stream per tab) and on Holodex multiview.
- **Live streams:** reads each player's live latency and **slows down the stream that's
  ahead** (or pauses it for big gaps) until they line up. It never speeds a live stream up:
  that drains the small live buffer and makes the stream stall.
- **Archives** (finished live streams): lines them up by broadcast time, like Holodex's
  sync. Seek, pause, play or change speed on any of them and the others follow. On watch
  pages this is automatic; embeds have no start time, so they keep the alignment they had
  when added.
- **Nudge** any added stream ahead or back (±0.1 s, ±1 s) to fine-tune; the sync keeps it.
- **Optional, for archives far apart:** if you run [yt-dlp-z](https://github.com/ZXY101/yt-dlp-z),
  turn on "Align archives with yt-dlp-z" in the add-on's settings, and the popup can line the
  group's archives up from their audio. See
  [docs/align-with-yt-dlp-z.md](docs/align-with-yt-dlp-z.md).
- Coming: a safety margin for shaky live streams, a "back to live" button, and a warning
  when added streams don't look like the same collab.

No data collection, no remote code, and no network requests of its own unless you turn on
the yt-dlp-z alignment (then only to your server, only when you click Align). See
[docs/permissions.md](docs/permissions.md).

## Development

See [docs/development.md](docs/development.md) and [AGENTS.md](AGENTS.md) (rules for humans
and coding agents alike). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[The Unlicense](LICENSE): public domain.
