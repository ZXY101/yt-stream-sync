# Permissions

Every permission the add-on asks for, and why. Update this file in the same commit as any
change to `permissions`, `optional_permissions`, `host_permissions` or `content_scripts`
in `static/manifest.json`.

| Permission                                                 | Why                                                                                                                                                                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`                                                  | Remembers whether matching by audio is on. Nothing else is stored.                                                                                                                                             |
| Content scripts on `https://www.youtube.com/*`, all frames | Read each live player's latency, buffer and state, and slow, pause or resume it. All frames, so YouTube embeds inside other sites (such as Holodex multiview) work too. This is the add-on's only site access. |

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
for videos the user already has open in a tab.

The popup asks the browser which tab is active (`tabs.query`, no permission needed) so it
can offer that tab's streams; it never reads tab URLs or titles.
