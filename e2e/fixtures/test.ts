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
      return openExtensionPage(firefoxPage, "popup/index.html");
    }
    await use(openPopup);
  },
});

export { expect } from "@playwright/test";
