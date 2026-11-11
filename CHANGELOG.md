# Changelog

## 0.1.0 (2026-11-11)


### Features

* **background:** align archives through yt-dlp-z ([25af8b3](https://github.com/ZXY101/yt-stream-sync/commit/25af8b3d8f5e4c250d0447a2d89e3805abd68ea9))
* **background:** match a stream through any matched stream, not only the reference ([3375313](https://github.com/ZXY101/yt-stream-sync/commit/33753135d1877c7c4406e9e47f4da7f9b10a9e2f))
* **controller:** add a controller for archived streams ([895277f](https://github.com/ZXY101/yt-stream-sync/commit/895277f097e58c28e5af2cb0a5ad34c9a7a094cb))
* **controller:** add the sync controller and a simulated live player ([ac8050a](https://github.com/ZXY101/yt-stream-sync/commit/ac8050a373460c18f3e649f07fe059681e665957))
* **controller:** regroup archives after a jump so they start together ([c11898b](https://github.com/ZXY101/yt-stream-sync/commit/c11898bf5c56f70ff7048dc300cb6003e469d74d))
* copy a debug log from the popup ([76eb9e6](https://github.com/ZXY101/yt-stream-sync/commit/76eb9e6df98bc1c8d63b22282d98af4884dea218))
* hold back ultra-low-latency streams a little by seeking ([422320c](https://github.com/ZXY101/yt-stream-sync/commit/422320c3b9840ea6440c7d2f90b8c3961f676693))
* make syncing opt-in from the popup ([693072b](https://github.com/ZXY101/yt-stream-sync/commit/693072b9538f929bca6c454a8368cf87389eb56a))
* match the streams in the group by their audio ([9467770](https://github.com/ZXY101/yt-stream-sync/commit/94677703d83dd6af1ad9c30613ae04f1f0a05054))
* opt-in archive alignment through yt-dlp-z ([9ce9652](https://github.com/ZXY101/yt-stream-sync/commit/9ce9652cae9afb70ca70ac708c97219facbb9709))
* **page:** listen to a player's audio for matching ([8ff032b](https://github.com/ZXY101/yt-stream-sync/commit/8ff032b917c0496e1f87a257c0bbd1c8f93d8fc4))
* **popup:** add streams from their own tab, with thumbnails and shadcn styling ([169c953](https://github.com/ZXY101/yt-stream-sync/commit/169c9533b9491c094fc2889d1ceb5e40dac3996c))
* **popup:** audio matching controls and waveforms ([312b32a](https://github.com/ZXY101/yt-stream-sync/commit/312b32aba21168bb3913a2e12f199f84f7fd67b1))
* **popup:** clear the sync group, and show waveforms by default ([1b6c400](https://github.com/ZXY101/yt-stream-sync/commit/1b6c400a51e09eb6eae3e50b18d7026b99d8383b))
* **popup:** opt-in yt-dlp-z alignment from a settings page ([fe676e6](https://github.com/ZXY101/yt-stream-sync/commit/fe676e610eedd569b82d4833ebd942f9e57f3193))
* **popup:** show each step of a yt-dlp-z alignment ([96d2b02](https://github.com/ZXY101/yt-stream-sync/commit/96d2b02012ed9468e95331bf148a7b964b5e7738))
* **popup:** show low-latency streams and the gap the sync can't close ([3a5a41c](https://github.com/ZXY101/yt-stream-sync/commit/3a5a41c8f3f1fd3d8855feb360d103e57bd0b8e8))
* **popup:** typed offsets, ±10 s steps and batched nudges ([4fab7fa](https://github.com/ZXY101/yt-stream-sync/commit/4fab7fa8dc54e6a7551ac0f7f0ced43a781cd89f))
* sync archived streams, with linked controls and nudges ([ecc4446](https://github.com/ZXY101/yt-stream-sync/commit/ecc44466e540dfb2be92100d730e80839d3ac302))
* sync live groups around ultra-low-latency streams ([f968909](https://github.com/ZXY101/yt-stream-sync/commit/f968909562e937616f796886c1c9575d5f441f72))
* sync live YouTube players across tabs and embeds ([0a5b882](https://github.com/ZXY101/yt-stream-sync/commit/0a5b882955d5dc21766c1c499a3faf6433cf6560))


### Bug Fixes

* **background:** don't export a type only the client uses ([2dc0a13](https://github.com/ZXY101/yt-stream-sync/commit/2dc0a13982c351e8b0bef61870fc0eafe37fd447))
* **background:** find audio lags up to 15 s, and match players one by one ([c86660b](https://github.com/ZXY101/yt-stream-sync/commit/c86660bda7dd3ad90204155fcc66dee73867486e))
* **background:** match collab audio reliably, and keep trying ([cb16afe](https://github.com/ZXY101/yt-stream-sync/commit/cb16afef8b2e5f8d7af641130a23aa0eb8e1c49f))
* **background:** show "listening" right away when matching audio again ([827f13e](https://github.com/ZXY101/yt-stream-sync/commit/827f13e8674d82ca6bcf36433b09c717e0546b55))
* **controller:** a stream added while paused no longer pauses the group ([cd73345](https://github.com/ZXY101/yt-stream-sync/commit/cd73345857253b5a87e61b1671027c0b453aa061))
* **page:** stop older copies of the page script after an update ([696af3b](https://github.com/ZXY101/yt-stream-sync/commit/696af3b8b3d591133c3e1a1c9f2931b43079427f))
* **popup:** hide the audio button while matching by audio is off ([011164e](https://github.com/ZXY101/yt-stream-sync/commit/011164e9250e3c6076e999f194dd6591953003a7))
* **popup:** shorter alignment step labels, current timing on the settings page ([637b156](https://github.com/ZXY101/yt-stream-sync/commit/637b156f38b49232160638353f52627bf6aa24af))
* stop audio sync and regroups from pausing the group over and over ([dd4245a](https://github.com/ZXY101/yt-stream-sync/commit/dd4245ab84799462c84a15a6644a3e7d1bf007da))
* tunnel remote Firefox on 9222 at both ends ([c00c373](https://github.com/ZXY101/yt-stream-sync/commit/c00c373031286d8b3b4821aadd0cbd4dd19ea2dd))
