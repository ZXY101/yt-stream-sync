import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";

/** jsdom has no matchMedia. Tests can flip `prefersDark` and fire `change`. */
export const colorScheme = {
  prefersDark: false,
  listeners: new Set<() => void>(),
  change(dark: boolean) {
    this.prefersDark = dark;
    this.listeners.forEach((listener) => listener());
  },
};

function stubMatchMedia(query: string): MediaQueryList {
  return {
    get matches() {
      return query.includes("dark") && colorScheme.prefersDark;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => colorScheme.listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) =>
      colorScheme.listeners.delete(listener),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
}

window.matchMedia = stubMatchMedia;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  colorScheme.change(false);
  colorScheme.listeners.clear();
});
