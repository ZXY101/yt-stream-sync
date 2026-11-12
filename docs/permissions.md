# Permissions

Every permission the add-on asks for, and why. Update this file in the same commit as any
change to `permissions`, `optional_permissions`, `host_permissions` or `content_scripts`
in `static/manifest.json`.

| Permission                                                                                             | Why                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                                                                              | Remembers whether matching by audio is on, the yt-dlp-z settings (on/off, server address, API token) if the user set them, and the sync groups the user saved (see below). Nothing else is stored.                                                   |
| Optional host permission for **one** server (`optional_host_permissions`: `http://*/*`, `https://*/*`) | Only for the opt-in yt-dlp-z alignment. Asked when the user clicks Turn on in the settings page, for the address they entered alone (e.g. `https://my-server.example/*`), and given back on Turn off. Nothing is asked for while the feature is off. |
| Optional data consent `browsingActivity` (Firefox `data_collection_permissions.optional`)              | Same feature: clicking Align sends the archives' watch page links to the user's own server, which Firefox counts as browsing activity. Asked together with the host permission. Required data collection stays `none`.                               |
| Content scripts on `https://www.youtube.com/*`, all frames                                             | Read each live player's latency, buffer and state, and slow, pause or resume it. All frames, so YouTube embeds inside other sites (such as Holodex multiview) work too. This is the add-on's only site access.                                       |

Two scripts run in those frames: `page.js` in the page's own JavaScript world (YouTube's
player methods are only reachable there) and `content.js` in the isolated world, which talks
to the background script. Messages from the page are validated before use, and the page
script only ever receives commands, never data from other tabs. Nothing is changed on any
player until the user adds it in the popup; only the popup can change the sync group.

**Audio:** for streams in the sync group (and only while matching by audio is on), the page
script listens to the player's audio (`captureStream()`), keeps the last 30 s at low quality
in memory, and sends short clips to the background script to measure the delay between
streams, plus loudness levels for the popup's waveform. Audio never leaves the browser and
is never stored.

**Debug log:** the background script keeps its last 300 decisions in memory (commands,
detected user actions, audio matching results, stream states and loudness levels; no audio,
no URLs). It leaves the browser only if the user clicks "Copy debug log" and pastes it
somewhere.

The add-on collects no data (`data_collection_permissions: none`). Its only network
requests of its own are the popup's thumbnails from `i.ytimg.com` (YouTube's image server),
for videos the user already has open in a tab, and, only if the user turned on the yt-dlp-z
alignment, requests to the server they entered: a connection test when they turn it on, and
`POST`/`GET`/`DELETE /api/align` when they click Align (see
[align-with-yt-dlp-z.md](align-with-yt-dlp-z.md)). The settings page (`options_ui`) is where
that is set up.

**Saved groups:** when the user clicks "Save this group", the add-on stores, for each archive
in the group, its video id, title, channel, offset and position, in `storage.local` only
(never synced, never sent anywhere). While that group is open, the offsets and position are
updated about every 10 s. Opening a saved group opens a tab per archive that isn't open yet
(`tabs.create` with its watch page link, which needs no permission). Deleting a group removes
it from storage; removing the add-on removes them all.

The popup asks the browser which tab is active (`tabs.query`, no permission needed) so it
can offer that tab's streams; it never reads tab URLs or titles.
