import type { Page } from "puppeteer-core";

import { addAllStreams, groupRows } from "../fixtures/popup.ts";
import { expect, test } from "../fixtures/test.ts";
import { openMultiview, readStream, streamFrame } from "../fixtures/youtube.ts";

interface NudgeState {
  disabled: boolean;
  /** The button ignores the pointer, so the tooltip must sit on its wrapper. */
  pointerEvents: string;
  wrapperTitle: string | null;
}

async function rowOf(popup: Page, title: string): Promise<string | undefined> {
  return (await groupRows(popup)).find((row) => row.startsWith(title));
}

/** Whether the status line containing `text` shows in full (not cut off or clamped). */
function statusFits(popup: Page, text: string): Promise<boolean> {
  return popup.evaluate((wanted) => {
    const lines = [...document.querySelectorAll<HTMLElement>("p[title]")];
    const line = lines.find((element) => element.title.includes(wanted));
    if (!line) {
      return false;
    }
    return line.scrollWidth <= line.clientWidth && line.scrollHeight <= line.clientHeight;
  }, text);
}

function nudgeState(popup: Page, label: string): Promise<NudgeState | null> {
  return popup.evaluate((wanted) => {
    const button = document.querySelector<HTMLButtonElement>(`[aria-label='${wanted}']`);
    if (!button) {
      return null;
    }
    return {
      disabled: button.disabled,
      pointerEvents: getComputedStyle(button).pointerEvents,
      wrapperTitle: button.parentElement?.getAttribute("title") ?? null,
    };
  }, label);
}

test("lines up streams with rewind off by slowing and jumping, never pausing", async ({
  firefoxPage,
  openPopup,
}) => {
  test.setTimeout(60_000);
  // Like a real collab: two low-latency streams near 8 s, a normal one 10 s further back.
  await openMultiview(firefoxPage, [
    { id: "near", latency: 8, rewind: false, latencyClass: "LOW" },
    { id: "close", latency: 8.5, rewind: false, latencyClass: "LOW" },
    { id: "far", latency: 18, rewind: false, edge: 2, latencyClass: "NORMAL" },
  ]);
  const frames = await Promise.all(
    ["near", "close", "far"].map((id) => streamFrame(firefoxPage, id)),
  );
  const popup = await openPopup();
  await addAllStreams(popup, 3);

  // The one far behind jumps ahead to the others instead of everyone waiting for it.
  const far = frames[2] as (typeof frames)[number];
  await expect
    .poll(async () => (await readStream(far)).latency, { timeout: 10_000 })
    .toBeLessThan(11);
  await expect
    .poll(
      async () => {
        const latencies = await Promise.all(frames.map(async (f) => (await readStream(f)).latency));
        return Math.max(...latencies) - Math.min(...latencies);
      },
      { timeout: 30_000 },
    )
    .toBeLessThan(0.6);
  // Pausing would send them back to the live edge.
  const pauses = await Promise.all(frames.map(async (f) => (await readStream(f)).pauses));
  expect(pauses).toEqual([0, 0, 0]);
});

test("keeps a stream YouTube won't move closer as an outlier, and greys out its nudges", async ({
  firefoxPage,
  openPopup,
}) => {
  test.setTimeout(60_000);
  // The newest video of "far" is 12 s behind live: keeping 3 s of buffer, it can't get closer
  // than 15 s, while "near" won't stay further back than 8 s.
  await openMultiview(firefoxPage, [
    { id: "near", latency: 6, rewind: false, latencyClass: "LOW" },
    { id: "far", latency: 20, rewind: false, edge: 12, latencyClass: "NORMAL" },
  ]);
  const near = await streamFrame(firefoxPage, "near");
  const popup = await openPopup();
  await addAllStreams(popup, 2);

  await expect
    .poll(() => rowOf(popup, "far"), { timeout: 20_000 })
    .toMatch(/Can't get closer, \d+\.\d s behind/);
  await expect
    .poll(() => nudgeState(popup, "Move far ahead 1 second"))
    .toEqual({
      disabled: true,
      pointerEvents: "none",
      wrapperTitle: "YouTube won't keep this stream any closer to live",
    });
  // Back still works, and the stream in the group isn't affected.
  expect(await nudgeState(popup, "Move far back 1 second")).toMatchObject({ disabled: false });
  expect(await nudgeState(popup, "Move near ahead 1 second")).toMatchObject({ disabled: false });
  expect((await readStream(near)).pauses).toBe(0);
  // The status line used to be cut off before "behind", hiding how far off it is.
  expect(await statusFits(popup, "Can't get closer")).toBe(true);
});
