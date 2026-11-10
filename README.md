# yt-stream-sync

A browser extension that keeps two or more YouTube live streams of the same collab in sync,
so you can watch them side by side without fiddling with playback speed.

> **Status:** early development, nothing usable yet. Firefox first, Chrome as well once it
> works there.

## How it will work

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
