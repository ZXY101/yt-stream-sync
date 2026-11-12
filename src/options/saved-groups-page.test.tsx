import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { SavedStatus } from "../lib/messages.ts";
import { SavedGroupsPage } from "./saved-groups-page.tsx";

const STREAMS = [
  { videoId: "Vh-YGhqy_Mo", title: "Tsuzuri POV", channel: "Tsuzuri" },
  { videoId: "Cdp-8nmEQCA", title: "Kyoko POV", channel: "Kyoko" },
  { videoId: "ccccccccccc", title: "Third POV", channel: "Third" },
];

function group(id: string, name: string, streams = STREAMS) {
  return { id, name, updatedAt: Date.UTC(2026, 10, 12), position: 600, streams };
}

function renderPage(saved: Partial<SavedStatus>) {
  const actions = {
    onOpen: vi.fn<(groupId: string) => void>(),
    onDelete: vi.fn<(groupId: string) => void>(),
    onRename: vi.fn<(groupId: string, name: string) => void>(),
    onRemoveStream: vi.fn<(groupId: string, videoId: string) => void>(),
  };
  const status: SavedStatus = { groups: [], canSave: false, opening: 0, ...saved };
  render(<SavedGroupsPage saved={status} {...actions} />);
  return actions;
}

describe("SavedGroupsPage", () => {
  it("explains how to save a group when there are none", () => {
    renderPage({});
    expect(screen.getByText("No saved groups yet.")).toBeInTheDocument();
  });

  it("lists every group with its streams, and marks the one playing", () => {
    renderPage({ groups: [group("g1", "Overwatch"), group("g2", "Minecraft")], activeId: "g2" });
    const playing = screen.getByRole("listitem", { name: "Minecraft" });
    expect(within(playing).getByText("Playing")).toBeInTheDocument();
    expect(
      within(playing).queryByRole("button", { name: "Open Minecraft" }),
    ).not.toBeInTheDocument();
    const other = screen.getByRole("listitem", { name: "Overwatch" });
    expect(within(other).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText(/Playing now: Minecraft, at 10:00\./)).toBeInTheDocument();
  });

  it("opens, renames and deletes (after asking)", async () => {
    const actions = renderPage({ groups: [group("g1", "Overwatch")] });
    await userEvent.click(screen.getByRole("button", { name: "Open Overwatch" }));
    expect(actions.onOpen).toHaveBeenCalledWith("g1");

    await userEvent.click(screen.getByRole("button", { name: "Rename Overwatch" }));
    const input = screen.getByRole("textbox", { name: "Group name" });
    await userEvent.clear(input);
    await userEvent.type(input, "OW 50 wins{Enter}");
    expect(actions.onRename).toHaveBeenCalledWith("g1", "OW 50 wins");

    await userEvent.click(screen.getByRole("button", { name: "Delete Overwatch" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(actions.onDelete).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Delete Overwatch" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(actions.onDelete).toHaveBeenCalledWith("g1");
  });

  it("removes a stream, but not below two", async () => {
    const actions = renderPage({
      groups: [group("g1", "Three"), group("g2", "Two", STREAMS.slice(0, 2))],
    });
    await userEvent.click(screen.getByRole("button", { name: "Remove Third POV from the group" }));
    expect(actions.onRemoveStream).toHaveBeenCalledWith("g1", "ccccccccccc");
    const two = screen.getByRole("listitem", { name: "Two" });
    for (const button of within(two).getAllByRole("button", { name: /^Remove / })) {
      expect(button).toBeDisabled();
    }
  });
});
