# yt-stream-sync

A browser extension that keeps two or more YouTube live streams of the same collab in sync,
so you can watch them side by side without fiddling with playback speed.

> **Status:** early development. Live streams and archives sync in Firefox (watch pages and
> embeds); you tick the streams to sync in the popup. Chrome support comes later. Chrome support and archived streams come later.

## How it will work

- **Opt-in:** click the add-on and tick the streams you want to keep together. Nothing is
  touched until you do, and syncing starts once two or more are ticked.
- Works on YouTube watch pages (one stream per tab) and on Holodex multiview.
- **Live streams:** reads each player's live latency and **slows down the stream that's
  ahead** (or pauses it for big gaps) until they line up. It never speeds a live stream up:
  that drains the small live buffer and makes the stream stall.
- **Archives** (finished live streams): lines them up by broadcast time, like Holodex's
  sync. Seek, pause, play or change speed on any of them and the others follow. On watch
  pages this is automatic; embeds have no start time, so they keep the alignment they had
  when ticked.
- **Nudge** any ticked stream ahead or back (±0.1 s, ±1 s) to fine-tune; the sync keeps it.
- Coming: a safety margin for shaky live streams, a "back to live" button, and a warning
  when ticked streams don't look like the same collab.

No data collection, no network requests of its own, no remote code. See
[docs/permissions.md](docs/permissions.md).

## Development

See [docs/development.md](docs/development.md) and [AGENTS.md](AGENTS.md) (rules for humans
and coding agents alike). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[The Unlicense](LICENSE): public domain.
