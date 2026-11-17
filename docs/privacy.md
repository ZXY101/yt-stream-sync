# Privacy policy: yt-stream-sync

_Last updated: 2026-11-12_

yt-stream-sync keeps YouTube streams in sync inside your browser. It has no servers of its
own, no analytics and no tracking, and it collects no data.

## What it stores

On your device, in the browser's extension storage (never synced to other devices):

- whether matching by audio is on;
- the sync groups you saved: for each archive, its video id, title, channel, offset and
  where you were in it;
- only if you set up the optional yt-dlp-z alignment: your server's address and API token.

Removing the add-on deletes all of it.

## What it reads

On YouTube pages (including YouTube players embedded in other sites), it reads each player's
state, position and buffer, and changes only the players you add to the sync group. While
matching by audio is on, it listens to those players' sound at low quality, in memory only, to
measure the delay between them. Audio is never stored or sent anywhere.

## What it sends, and where

- **Thumbnails:** the popup loads thumbnails from YouTube's image server (`i.ytimg.com`) for
  videos you already have open.
- **Only if you turn on "Align archives with yt-dlp-z"** (off by default): when you click
  Align, the watch page links of the archives in your sync group go to the yt-dlp-z server
  **you** entered, with your token, so it can compare their audio. Turning the feature on asks
  for your consent first (in Firefox, the browser's own "browsing activity" prompt) and for
  access to that one server; turning it off gives both back.

Nothing is sent to the add-on's authors or to any third party.

## Debug log

The add-on keeps a short log of its recent decisions in memory (no audio, no page addresses).
It leaves the browser only if you click "Copy debug log" and paste it somewhere yourself.

## Contact

Questions: open an issue at https://github.com/ZXY101/yt-stream-sync/issues.
