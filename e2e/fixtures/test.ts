import { test as base } from "@playwright/test";
import type { Page } from "puppeteer-core";

import { launchFirefox, openExtensionPage } from "./firefox.ts";

interface Fixtures {
  firefoxPage: Page;
  openPopup: () => Promise<Page>;
}

export const test = base.extend<Fixtures>({
  firefoxPage: async ({}, use) => {
    const session = await launchFirefox();
    await use(session.page);
    await session.close();
  },
  openPopup: async ({ firefoxPage }, use) => {
    async function openPopup() {
      // Its own window: the first tab may hold the players, and newPage() for a tab hangs.
      const page = await firefoxPage.browser().newPage({ type: "window" });
      return openExtensionPage(page, "popup/index.html");
    }
    await use(openPopup);
  },
});

export { expect } from "@playwright/test";
