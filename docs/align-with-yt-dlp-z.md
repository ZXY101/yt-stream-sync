# Aligning archives with yt-dlp-z (optional)

Archives of the same collab can be minutes apart: each streamer started at a different time,
and the broadcast start times YouTube gives don't always line the content up. The add-on's
own audio matching only searches a few seconds either way, so for big gaps you had to type
an offset by hand.

If you run [yt-dlp-z](https://github.com/ZXY101/yt-dlp-z), the add-on can ask it instead.
It's off unless you turn it on.

## What happens

1. You add two or more archives to the sync group (on YouTube watch pages) and click
   **Align with yt-dlp-z** in the popup.
2. The add-on sends the archives' watch page links to your yt-dlp-z (`POST /api/align`).
3. yt-dlp-z downloads a small audio-only copy of each, compares their loudness over the
   whole overlap, and deletes the audio again. A pair of two-hour streams takes well under a
   minute; the popup shows each stream's step (downloading, converting, ready).
4. The add-on turns the result into offsets in the sync group, and matching by audio (if
   it's on) fine-tunes them. Then it asks yt-dlp-z to forget the job (`DELETE`).

Clearing the group, removing or adding a stream (closing a stream's tab removes it), or
turning the feature off while it runs cancels it and deletes it on the server, which stops
the download and deletes the audio. If the browser closes mid-way, yt-dlp-z notices nobody
is checking on the job and stops it after a minute. Either way the audio never stays: yt-dlp-z
deletes it as soon as a job finishes, fails or is stopped.

## What leaves your browser

Only when you click Align: the links of the archives in your sync group, sent to the server
address you entered, with your API token. Nothing is sent on its own, and nothing goes
anywhere else.

## Setting it up

1. A yt-dlp-z server with alignment (its docs: "Aligning recordings").
2. In yt-dlp-z: **Settings → API tokens**, make a token with **full access**. Send-only
   tokens can't align.
3. In the add-on: open the popup, click the gear (or the add-on's preferences in the
   browser's add-ons page) → **Align archives with yt-dlp-z**. Enter the server
   address and the token and click **Turn on**.
4. Your browser asks to let the add-on reach that address. Firefox also asks about sending
   "browsing activity", because stream links go to your server. The add-on then checks the
   address and token and only turns the feature on if they work.

**Turn off** gives the access back. The address and token stay saved in the add-on (in the
browser's extension storage) so you can turn it on again.

## Limits

- Ended streams only, up to 12 hours each.
- Watch pages only: YouTube embeds (such as Holodex multiview) don't tell the add-on when
  the broadcast started, which the offsets are based on.
- One alignment at a time per server.
- If yt-dlp-z finds no reliable match for a stream (the audio doesn't overlap or is too
  different), that stream keeps its offset and the popup says so.
