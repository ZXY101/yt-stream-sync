import { render } from "@testing-library/react";

import { colorScheme } from "../test/setup.ts";
import { useColorScheme } from "./use-color-scheme.ts";

function Probe() {
  useColorScheme();
  return null;
}

describe("useColorScheme", () => {
  it("follows the system's dark setting, also when it changes", () => {
    colorScheme.change(true);
    const { unmount } = render(<Probe />);
    expect(document.documentElement).toHaveClass("dark");

    colorScheme.change(false);
    expect(document.documentElement).not.toHaveClass("dark");

    unmount();
    expect(colorScheme.listeners.size).toBe(0);
  });
});
