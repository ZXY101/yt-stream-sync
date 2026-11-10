# yt-stream-sync

A browser extension that keeps two or more YouTube live streams of the same collab in sync,
so you can watch them side by side without fiddling with playback speed.

> **Status:** early development. Live streams sync in Firefox (watch pages and embeds); the
> popup lists the live streams it finds and you tick the ones to sync. Chrome support and archived streams come later.

## How it will work

- **Opt-in:** click the add-on and tick the streams you want to keep together. Nothing is
  touched until you do, and syncing starts once two or more are ticked.
- Works on YouTube watch pages (one stream per tab) and on Holodex multiview.
- Reads each player's live latency and **slows down the stream that's ahead** (or pauses it
  for big gaps) until they line up. It never speeds a stream up: that drains the small live
  buffer and makes the stream stall.
- A popup shows the players in the sync group and the gap between them, with a manual nudge,
  a safety margin and a "back to live" button.

No data collection, no network requests of its own, no remote code. See
[docs/permissions.md](docs/permissions.md).

## Development

See [docs/development.md](docs/development.md) and [AGENTS.md](AGENTS.md) (rules for humans
and coding agents alike). Contributions: [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[The Unlicense](LICENSE): public domain.
