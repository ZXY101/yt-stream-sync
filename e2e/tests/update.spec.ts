import { DIST, ADDON } from "../fixtures/firefox.ts";
import { expect, test } from "../fixtures/test.ts";
import { openMultiview, streamFrame } from "../fixtures/youtube.ts";

/** How many reports the page scripts in `frame` post over `seconds`. */
async function reportsPerSecond(frame: Awaited<ReturnType<typeof streamFrame>>, seconds: number) {
  return frame.evaluate(async (wait) => {
    let count = 0;
    function onMessage(event: MessageEvent) {
      if ((event.data as { tag?: string } | null)?.tag === "yt-stream-sync:page") {
        count += 1;
      }
    }
    window.addEventListener("message", onMessage);
    await new Promise((resolve) => setTimeout(resolve, wait * 1000));
    window.removeEventListener("message", onMessage);
    return count / wait;
  }, seconds);
}

test("after the add-on is updated, only the new page script runs in open tabs", async ({
  firefoxPage,
}) => {
  await openMultiview(firefoxPage, [{ id: "solo", latency: 5 }]);
  const frame = await streamFrame(firefoxPage, "solo");
  expect(await reportsPerSecond(frame, 4)).toBeLessThanOrEqual(1.5);

  // Like clicking Reload on the add-on: Firefox injects the new scripts into open tabs.
  const browser = firefoxPage.browser();
  await browser.uninstallExtension(ADDON);
  await browser.installExtension(DIST);
  await new Promise((resolve) => setTimeout(resolve, 2_000));

  const rate = await reportsPerSecond(frame, 4);
  expect(rate).toBeGreaterThan(0.5);
  expect(rate).toBeLessThanOrEqual(1.5);
});
