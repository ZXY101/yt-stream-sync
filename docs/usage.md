# Using yt-stream-sync

## Syncing streams

1. Open each stream in its own tab: a YouTube watch page, or a page with YouTube players
   embedded (such as a multiview site).
2. On the first stream's tab, click the toolbar button and **Add**.
3. Go to the next stream's tab and add it too. Syncing starts once two or more are added.

The popup lists the sync group with thumbnails and what the sync is doing to each stream.
Nothing is changed on a player until you add it. **Clear** takes everything out; the ×
on a stream takes just that one out.

A live stream and an archive can't be synced together.

## Live streams

The add-on reads how far each player is behind live and **slows down the stream that's
ahead** until they match, or pauses it briefly for a big gap. It never speeds a live stream
up: that drains the small live buffer and makes it stall.

Streams marked **Low latency** sit near the live edge and can only be held back a few
seconds, so the others jump ahead to meet them. If a gap remains, the popup says
"Can't get closer".

Most streams have **rewind turned off**. YouTube sends such a stream back to the live edge
after a pause, and may undo a jump ahead, so these are never paused: they are only slowed a
little or moved ahead within their buffer. The add-on learns how far each one will stay
ahead or behind, then lines the group up at the delay that suits the most streams. A stream
YouTube won't keep there sits as close as it can, shows "Can't get closer", and is tried again
every few minutes.

## Archives

Finished live streams are lined up by when each broadcast started. Seek, pause, play or
change speed on any of them and the others follow.

On watch pages this is automatic. Embedded players don't say when their stream started, so
they keep the alignment they had when you added them.

## Fine-tuning

Each stream has nudge buttons (±0.1, ±1 and ±10 s) and an **Offset** field where you can type
an offset in seconds or `m:ss` (for example `-2:05.3`). The sync keeps whatever you set.
Buttons for a direction a stream can't move any further (YouTube won't keep it closer to, or
further from, live) are greyed out; hover them to see why.

## Matching by audio

With **Auto-sync by audio** on (the default), the add-on listens to the added streams for
30 seconds once they play steadily in sync (a stream that can't get closer may be up to 5
seconds off), and moves each one so the shared sound (voices, game audio) lines up. If a try
finds no match, the popup says so and it listens again. While some streams are lined up and
another isn't playing steadily yet, it says how many it is waiting for. It finds offsets of up
to 15 seconds.
**Match again** listens afresh; the waveforms show what it hears.

If a stream says "Click once inside this stream's video so the add-on can hear it", the browser
needs a click in that page before it lets the add-on listen.

Archives that are minutes apart need a nudge first, or the optional
[yt-dlp-z alignment](align-with-yt-dlp-z.md).

## Saved groups

Long archives often take more than one sitting. With two or more archives on their watch pages
in the sync group, click **Save this group**.

While a saved group plays, it keeps your place and offsets up to date, and the popup shows it
with a **Playing** tag. Clicking **Add** on another archive's tab then adds it to the saved
group too.

To continue later, click **Open** on the group (in the popup, or on the saved groups page). The
add-on opens each archive at your place, brings each tab to the front once so Firefox lets it
start, and puts them back in sync with the saved offsets. If you close some of the tabs,
**Reopen closed streams** brings them back.

The **saved groups page** (gear icon in the popup, or **View all**) lists every group. Open one
to see its streams: open a stream on YouTube, change its offset, add a stream (paste a link or
pick an archive open in a tab), remove one (a group keeps at least two), rename or delete the
group.

Saved groups stay in your browser.

## Theme

Pick **System**, **Light** or **Dark** under **Theme** in the settings (the gear in the popup).
The popup and the settings page both follow it. System, the default, follows your computer.

## Troubleshooting

- **A tab's stream doesn't show up in the popup.** A tab opened in the background hasn't loaded
  its video yet. Switch to the tab once.
- **"Won't start: open its tab once".** Firefox doesn't start video in a tab you haven't looked
  at. Switch to that tab; the stream rejoins the sync by itself.
- **Matching by audio finds no shared sound.** The streams may share little sound right now, or
  be more than 15 s apart. It tries again a few times; otherwise nudge them closer and click
  **Match again**.
- **Something else is wrong.** Click **Copy debug log** in the popup and attach it to an
  [issue](https://github.com/ZXY101/yt-stream-sync/issues). It contains no audio and no page
  addresses.
