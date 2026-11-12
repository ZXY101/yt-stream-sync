import type { Page } from "puppeteer-core";

import { addAllStreams } from "../fixtures/popup.ts";
import { expect, test } from "../fixtures/test.ts";
import { openMultiview, streamFrame } from "../fixtures/youtube.ts";

// Saved groups only take real-looking video ids (11 characters), so these fakes have them.
const VIDEO_A = "tsuzuriPOV1";
const VIDEO_B = "kyokoPOV001";
const START_A = "2026-11-10T12:59:40+00:00";
const START_B = "2026-11-10T13:00:50+00:00";

interface Saved {
  players: { title: string; inGroup: boolean; offset: number }[];
  saved: { groups: { name: string }[]; activeId?: string };
}

/** The background's status, asked from the popup like the popup itself does. */
function status(popup: Page): Promise<Saved> {
  return popup.evaluate(async () => {
    type Runtime = { sendMessage: (message: unknown) => Promise<unknown> };
    const api = (globalThis as unknown as { browser: { runtime: Runtime } }).browser;
    return (await api.runtime.sendMessage({ type: "getStatus" })) as Saved;
  });
}

/** Each member's offset by title; streams outside the group are left out. */
async function memberOffsets(popup: Page): Promise<Record<string, number>> {
  const { players } = await status(popup);
  const members = players.filter((player) => player.inGroup);
  return Object.fromEntries(members.map((player) => [player.title, player.offset]));
}

test("saves a sync group and opens it again with its offsets", async ({
  firefoxPage,
  openPopup,
}) => {
  await openMultiview(firefoxPage, [
    { id: VIDEO_A, position: 300, start: START_A },
    { id: VIDEO_B, position: 230, start: START_B },
  ]);
  await streamFrame(firefoxPage, VIDEO_A);
  await streamFrame(firefoxPage, VIDEO_B);
  const popup = await openPopup();
  await addAllStreams(popup, 2);

  await popup.locator(`input[aria-label^="Offset of ${VIDEO_B}"]`).click();
  await popup.keyboard.type("1:30");
  await popup.keyboard.press("Enter");
  await expect.poll(() => memberOffsets(popup)).toEqual({ [VIDEO_A]: 0, [VIDEO_B]: 90 });

  await popup.locator("::-p-aria(Save this group)").click();
  await expect
    .poll(() => popup.$("::-p-aria(Open saved group Fake channel)").then(Boolean))
    .toBe(true);
  expect((await status(popup)).saved.groups.map((group) => group.name)).toEqual(["Fake channel"]);

  await popup.locator("::-p-aria(Clear)").click();
  await expect.poll(() => memberOffsets(popup)).toEqual({});

  // Both videos are still open, so no tab is opened: they rejoin where they are.
  const pages = (await firefoxPage.browser().pages()).length;
  await popup.locator("::-p-aria(Open Fake channel)").click();
  await expect.poll(() => memberOffsets(popup)).toEqual({ [VIDEO_A]: 0, [VIDEO_B]: 90 });
  expect((await firefoxPage.browser().pages()).length).toBe(pages);
  expect((await status(popup)).saved.activeId).toBeDefined();
});
