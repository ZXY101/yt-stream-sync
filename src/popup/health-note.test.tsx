import { render, screen } from "@testing-library/react";

import type { StreamHealth } from "../lib/messages.ts";
import { HealthNote } from "./health-note.tsx";

function health(overrides: Partial<StreamHealth> = {}): StreamHealth {
  return { label: "steady", buffering: 0, moved: 0, corrections: 0, ...overrides };
}

describe("HealthNote", () => {
  it("shows nothing until the stream has a health", () => {
    const { container } = render(<HealthNote health={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says a calm stream is steady", () => {
    render(<HealthNote health={health()} />);
    expect(screen.getByText("Steady")).toBeInTheDocument();
    expect(screen.getByText("Last 2 min: nothing to fix")).toBeInTheDocument();
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
});
