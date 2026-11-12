import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { SavedStatus } from "../lib/messages.ts";
import { SavedGroups } from "./saved-groups.tsx";

const GROUP = {
  id: "g1",
  name: "Tsuzuri + Kyoko",
  updatedAt: new Date(2026, 10, 12, 14, 3).getTime(),
  position: 4521,
  streams: [
    { videoId: "Vh-YGhqy_Mo", title: "Tsuzuri POV", channel: "Tsuzuri" },
    { videoId: "Cdp-8nmEQCA", title: "Kyoko POV", channel: "Kyoko" },
  ],
};

function renderSaved(saved: Partial<SavedStatus>) {
  const handlers = {
    onSave: vi.fn<() => void>(),
    onOpen: vi.fn<(groupId: string) => void>(),
    onDelete: vi.fn<(groupId: string) => void>(),
  };
  const status: SavedStatus = { groups: [], canSave: false, opening: 0, ...saved };
  const view = render(<SavedGroups saved={status} {...handlers} />);
  return { ...handlers, view };
}

describe("SavedGroups", () => {
  it("shows nothing with no saved groups and nothing to save", () => {
    const { view } = renderSaved({});
    expect(view.container).toBeEmptyDOMElement();
  });

  it("saves the current group", async () => {
    const { onSave } = renderSaved({ canSave: true });
    await userEvent.click(screen.getByRole("button", { name: "Save this group" }));
    expect(onSave).toHaveBeenCalled();
  });

  it("lists saved groups with their place and opens one", async () => {
    const { onOpen } = renderSaved({ groups: [GROUP] });
    expect(screen.getByText("Tsuzuri + Kyoko")).toBeInTheDocument();
    expect(screen.getByText(/^2 streams · at 1:15:21 · /)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open Tsuzuri + Kyoko" }));
    expect(onOpen).toHaveBeenCalledWith("g1");
  });

  it("marks the open group and hides Save while it keeps itself up to date", () => {
    renderSaved({ groups: [GROUP], activeId: "g1", canSave: true });
    expect(screen.getByText("In use")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Open/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save this group" })).not.toBeInTheDocument();
    expect(screen.getByText(/keeps your place/)).toBeInTheDocument();
  });

  it("says how many streams are still opening", () => {
    renderSaved({ groups: [{ ...GROUP, streams: GROUP.streams.slice(0, 1) }], opening: 1 });
    expect(screen.getByText(/waiting for 1 stream\./)).toBeInTheDocument();
    expect(screen.getByText(/^1 stream · /)).toBeInTheDocument();
  });

  it("asks before deleting", async () => {
    const { onDelete } = renderSaved({ groups: [GROUP], opening: 2 });
    expect(screen.getByText(/waiting for 2 streams/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete Tsuzuri + Kyoko" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete Tsuzuri + Kyoko" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).toHaveBeenCalledWith("g1");
  });
});
