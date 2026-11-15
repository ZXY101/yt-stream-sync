import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { useColorScheme } from "@/components/use-color-scheme.ts";

import { colorScheme } from "../test/setup.ts";
import { ThemeSection } from "./theme-section.tsx";

const STORAGE_KEY = "yt-stream-sync-theme";

function Page() {
  useColorScheme();
  return <ThemeSection />;
}

afterEach(() => {
  window.localStorage.clear();
});

describe("ThemeSection", () => {
  it("follows the system until a theme is picked, and remembers the pick", async () => {
    const user = userEvent.setup();
    render(<Page />);
    expect(screen.getByRole("radio", { name: "System" })).toBeChecked();
    expect(document.documentElement).not.toHaveClass("dark");

    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(document.documentElement).toHaveClass("dark");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("dark");

    await user.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement).not.toHaveClass("dark");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("starts with the theme picked earlier, over the system's setting", () => {
    window.localStorage.setItem(STORAGE_KEY, "light");
    colorScheme.change(true);
    render(<Page />);

    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("follows a theme picked in another settings page", () => {
    render(<Page />);

    act(() => {
      window.localStorage.setItem(STORAGE_KEY, "dark");
      window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
    });

    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(document.documentElement).toHaveClass("dark");
  });

  it("still switches when storage is blocked, for as long as the page is open", async () => {
    const user = userEvent.setup();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<Page />);

    await user.click(screen.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement).toHaveClass("dark");
    vi.restoreAllMocks();
  });

  it("keeps following system changes while System is picked", () => {
    render(<Page />);

    act(() => colorScheme.change(true));

    expect(document.documentElement).toHaveClass("dark");
  });
});
