import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { StreamHealth } from "../lib/messages.ts";
import { HealthNote } from "./health-note.tsx";

function health(overrides: Partial<StreamHealth> = {}): StreamHealth {
  return { label: "steady", buffering: 0, moved: 0, corrections: 0, ...overrides };
}

describe("HealthNote", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows nothing until the stream has a health", () => {
    const { container } = render(<HealthNote health={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says a calm stream is steady", () => {
    render(<HealthNote health={health()} />);
    expect(screen.getByText("Steady")).toBeInTheDocument();
    expect(screen.getByText("Last 2 min: no hiccups")).toBeInTheDocument();
  });

  it("says what happened to a stream that isn't calm", () => {
    render(
      <HealthNote health={health({ label: "unstable", buffering: 2, moved: 1, corrections: 4 })} />,
    );
    expect(screen.getByText("Unstable")).toBeInTheDocument();
    expect(
      screen.getByText("Last 2 min: buffered 2×, moved by YouTube 1×, corrected 4×"),
    ).toBeInTheDocument();
  });

  it("leaves out what didn't happen", () => {
    render(<HealthNote health={health({ label: "shaky", corrections: 3 })} />);
    expect(screen.getByText("Shaky")).toBeInTheDocument();
    expect(screen.getByText("Last 2 min: corrected 3×")).toBeInTheDocument();
  });

  it("offers no chevron when the details fit on the line", () => {
    render(<HealthNote health={health({ label: "shaky", buffering: 2, corrections: 2 })} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Shaky")).toBeInTheDocument();
    expect(screen.getByText("Last 2 min: buffered 2×, corrected 2×")).toBeInTheDocument();
  });

  it("keeps details too long for the line on one line until clicked", async () => {
    // Open, the line wraps and fits; closed, it's twice as wide as the room it has.
    vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function width(
      this: HTMLElement,
    ) {
      return this.classList.contains("truncate") ? 400 : 200;
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(200);
    render(<HealthNote health={health({ label: "unstable", buffering: 3, moved: 2 })} />);
    const row = screen.getByRole("button", { name: /Unstable/ });
    expect(row).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/^Last 2 min/)).toHaveClass("truncate");

    await userEvent.click(row);

    expect(row).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/^Last 2 min/)).not.toHaveClass("truncate");

    await userEvent.click(row);

    expect(screen.getByRole("button", { name: /Unstable/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });
});
