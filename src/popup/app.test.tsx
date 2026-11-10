import { render, screen } from "@testing-library/react";

import { App } from "./app.tsx";

describe("App", () => {
  it("shows the empty state when no players are in the group", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "yt-stream-sync" })).toBeInTheDocument();
    expect(screen.getByText(/No players in the sync group yet/)).toBeInTheDocument();
  });
});
