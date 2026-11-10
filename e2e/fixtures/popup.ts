import type { Page } from "puppeteer-core";

import { openExtensionPage } from "./firefox.ts";

interface StatusPlayer {
  id: string;
  tabId: number;
  title: string;
  inGroup: boolean;
}

/** The background's view of every stream, asked from the popup like the popup itself does. */
function status(popup: Page): Promise<StatusPlayer[]> {
  return popup.evaluate(async () => {
    type Runtime = { sendMessage: (message: unknown) => Promise<unknown> };
    const api = (globalThis as unknown as { browser: { runtime: Runtime } }).browser;
    const answer = (await api.runtime.sendMessage({ type: "getStatus" })) as {
      players: StatusPlayer[];
    };
    return answer.players;
  });
}

async function waitForStreams(popup: Page, count: number): Promise<StatusPlayer[]> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    // oxlint-disable-next-line no-await-in-loop
    const players = await status(popup);
    if (players.length >= count) {
      return players;
    }
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`The popup never saw ${count} streams`);
}

/** Shows the popup as it looks when opened from `tabId`. */
async function showPopupFor(popup: Page, tabId: number): Promise<void> {
  await openExtensionPage(popup, `popup/index.html?tab=${tabId}`);
  await popup.waitForSelector("main h1");
}

async function clickAddButtons(popup: Page): Promise<void> {
  // One at a time: each click re-renders the popup from the background's answer.
  // oxlint-disable-next-line no-await-in-loop
  while (await popup.$("button[aria-label^='Add ']")) {
    // oxlint-disable-next-line no-await-in-loop
    await popup.locator("button[aria-label^='Add ']").click();
    // oxlint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/** Like a user: opens the popup from each stream's tab in turn and adds its streams. */
export async function addAllStreams(popup: Page, count: number): Promise<void> {
  const players = await waitForStreams(popup, count);
  const tabs = [...new Set(players.map((player) => player.tabId))];
  for (const tabId of tabs) {
    // oxlint-disable-next-line no-await-in-loop
    await showPopupFor(popup, tabId);
    // oxlint-disable-next-line no-await-in-loop
    await clickAddButtons(popup);
  }
}

/** Opens the popup from the tab of the first stream it knows about. */
export async function showPopupForStreams(popup: Page, count: number): Promise<void> {
  const [first] = await waitForStreams(popup, count);
  await showPopupFor(popup, (first as StatusPlayer).tabId);
}

/** Each sync-group row's text, sorted (streams are listed in the order they joined). */
export function groupRows(popup: Page): Promise<string[]> {
  return popup.evaluate(() => {
    const list = document.querySelector("[aria-label='Streams in sync']");
    const rows = [...(list?.querySelectorAll(":scope > li") ?? [])];
    return rows.map((row) => row.textContent ?? "").toSorted();
  });
}

/** Removes the stream called `title` from the sync group, like a user would. */
export async function removeStream(popup: Page, title: string): Promise<void> {
  await popup.locator(`::-p-aria(Remove ${title} from sync)`).click();
}

/** Names of the "Add … to sync" buttons in the This tab section. */
export function addButtons(popup: Page): Promise<string[]> {
  return popup.evaluate(() =>
    [...document.querySelectorAll("button[aria-label^='Add ']")]
      .map((button) => button.getAttribute("aria-label") ?? "")
      .toSorted(),
  );
}
