import { render, screen } from "@testing-library/react";

import { QuietNote } from "./quiet-note.tsx";

describe("QuietNote", () => {
  it("shows nothing for a stream that responds", () => {
    const { container } = render(<QuietNote quiet={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says the stream stopped responding and how to fix it", () => {
    render(<QuietNote quiet={24.6} />);
    expect(screen.getByText("Not responding")).toBeInTheDocument();
    expect(
      screen.getByText("No readings for 25 s. Refresh its tab, then add it again."),
    ).toBeInTheDocument();
  });
});
