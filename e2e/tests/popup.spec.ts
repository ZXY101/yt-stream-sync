import { expect, test } from "../fixtures/test.ts";

test("popup explains what to do when no live streams are open", async ({ openPopup }) => {
  const popup = await openPopup();

  const heading = await popup.waitForSelector("h1");
  expect(await heading?.evaluate((node) => node.textContent)).toBe("yt-stream-sync");
  const body = await popup.evaluate(() => document.body.textContent ?? "");
  expect(body).toContain("No live streams open");
});
