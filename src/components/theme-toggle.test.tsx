import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { colorScheme } from "../test/setup.ts";
import { ThemeToggle } from "./theme-toggle.tsx";
import { useColorScheme } from "./use-color-scheme.ts";

const STORAGE_KEY = "yt-stream-sync-theme";

function Page() {
  useColorScheme();
  return <ThemeToggle />;
}

afterEach(() => {
  window.localStorage.clear();
});

describe("ThemeToggle", () => {
  it("switches to dark and back, and remembers the choice", async () => {
    const user = userEvent.setup();
    render(<Page />);
    expect(document.documentElement).not.toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");

    // Back to what the system shows: that means following the system again.
    await user.click(screen.getByRole("button", { name: "Switch to light theme" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("starts with the choice saved earlier, over the system's setting", () => {
    window.localStorage.setItem(STORAGE_KEY, "dark");
    render(<Page />);

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  });

  it("follows a choice made in another page (the settings page or another popup)", () => {
    render(<Page />);

    act(() => {
      window.localStorage.setItem(STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    });

    expect(document.documentElement).toHaveClass("dark");
  });

  it("still switches when storage is blocked, for as long as the page is open", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Page />);

    await user.click(screen.getByRole("button", { name: "Switch to dark theme" }));

    expect(document.documentElement).toHaveClass("dark");
    vi.restoreAllMocks();
  });

  it("keeps following the system while nothing was chosen", () => {
    render(<Page />);

    act(() => colorScheme.change(true));

    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeVisible();
  });
});
