import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { SavedStatus } from "../lib/messages.ts";
import { SavedGroupsPage } from "./saved-groups-page.tsx";

const STREAMS = [
  { videoId: "Vh-YGhqy_Mo", title: "Tsuzuri POV", channel: "Tsuzuri", offset: 0, position: 600 },
  { videoId: "Cdp-8nmEQCA", title: "Kyoko POV", channel: "Kyoko", offset: -130.2, position: 470 },
  { videoId: "ccccccccccc", title: "Third POV", channel: "Third", offset: 2, position: 602 },
];

function group(id: string, name: string, streams = STREAMS) {
  return { id, name, updatedAt: Date.UTC(2026, 10, 12), position: 600, streams };
}

const OPEN_TAB = { videoId: "ddddddddddd", title: "Fourth POV", channel: "Fourth" };

function renderPage(
  saved: Partial<SavedStatus>,
  openArchives = [OPEN_TAB, STREAMS[0] ?? OPEN_TAB],
) {
  const actions = {
    onOpen: vi.fn<(groupId: string) => void>(),
    onDelete: vi.fn<(groupId: string) => void>(),
    onRename: vi.fn<(groupId: string, name: string) => void>(),
    onRemoveStream: vi.fn<(groupId: string, videoId: string) => void>(),
    onSetOffset: vi.fn<(groupId: string, videoId: string, offset: number) => void>(),
    onAddStream: vi.fn<(groupId: string, videoId: string) => void>(),
  };
  const status: SavedStatus = {
    groups: [],
    canSave: false,
    opening: 0,
    addable: 0,
    inSync: 0,
    ...saved,
  };
  render(<SavedGroupsPage saved={status} openArchives={openArchives} {...actions} />);
  return actions;
}

async function expand(name: string) {
  await userEvent.click(screen.getByRole("button", { name: `Show streams of ${name}` }));
  return screen.getByRole("listitem", { name });
}

describe("SavedGroupsPage", () => {
  it("explains how to save a group when there are none", () => {
    renderPage({});
    expect(screen.getByText("No saved groups yet.")).toBeInTheDocument();
  });

  it("starts with every group closed, and marks the one playing", async () => {
    renderPage({
      groups: [group("g1", "Overwatch"), group("g2", "Minecraft", STREAMS.slice(0, 2))],
      activeId: "g2",
      inSync: 2,
    });
    expect(screen.queryByRole("list", { name: /^Streams in/ })).not.toBeInTheDocument();
    const playing = screen.getByRole("listitem", { name: "Minecraft" });
    expect(within(playing).getByText("Playing")).toBeInTheDocument();
    expect(
      within(playing).queryByRole("button", { name: "Open Minecraft" }),
    ).not.toBeInTheDocument();
    const card = await expand("Overwatch");
    expect(within(card).getByRole("list", { name: "Streams in Overwatch" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide streams of Overwatch" }));
    expect(screen.queryByRole("list", { name: "Streams in Overwatch" })).not.toBeInTheDocument();
  });

  it("shows each stream's place and offset, linked to YouTube at that place", async () => {
    renderPage({ groups: [group("g1", "Overwatch")] });
    const card = await expand("Overwatch");
    const link = within(card).getByRole("link", { name: /Kyoko POV/ });
    expect(link).toHaveAttribute("href", "https://www.youtube.com/watch?v=Cdp-8nmEQCA&t=470s");
    expect(link).toHaveAttribute("target", "_blank");
    expect(within(card).getByText("Kyoko · at 7:50")).toBeInTheDocument();
    expect(within(card).getByLabelText(/^Offset of Kyoko POV/)).toHaveValue("-2:10.2");
  });

  it("isn't playing with one stream left, and offers to reopen", async () => {
    const actions = renderPage({ groups: [group("g1", "Overwatch")], activeId: "g1", inSync: 1 });
    expect(screen.queryByText("Playing")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reopen Overwatch" }));
    expect(actions.onOpen).toHaveBeenCalledWith("g1");
  });

  it("sets an offset typed in", async () => {
    const actions = renderPage({ groups: [group("g1", "Overwatch")] });
    await expand("Overwatch");
    const field = screen.getByLabelText(/^Offset of Third POV/);
    await userEvent.click(field);
    await userEvent.keyboard("-1:05{Enter}");
    expect(actions.onSetOffset).toHaveBeenCalledWith("g1", "ccccccccccc", -65);
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

  it("removes a stream, but not below two, and says why", async () => {
    const actions = renderPage({
      groups: [group("g1", "Three"), group("g2", "Two", STREAMS.slice(0, 2))],
    });
    await expand("Three");
    await userEvent.click(screen.getByRole("button", { name: "Remove Third POV from the group" }));
    expect(actions.onRemoveStream).toHaveBeenCalledWith("g1", "ccccccccccc");
    const two = await expand("Two");
    expect(within(two).queryByRole("button", { name: /^Remove / })).not.toBeInTheDocument();
    expect(within(two).getByText(/keeps at least two streams/)).toBeInTheDocument();
  });

  it("adds a stream to any group from a pasted link, and says when the link isn't one", async () => {
    const actions = renderPage({ groups: [group("g1", "Overwatch")] });
    await expand("Overwatch");
    await userEvent.click(screen.getByRole("button", { name: "Add stream" }));
    const field = screen.getByRole("textbox", { name: "YouTube link or video id" });
    await userEvent.type(field, "not a link{Enter}");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(actions.onAddStream).not.toHaveBeenCalled();
    await userEvent.clear(field);
    await userEvent.type(field, "https://youtu.be/ddddddddddd?si=x{Enter}");
    expect(actions.onAddStream).toHaveBeenCalledWith("g1", "ddddddddddd");
    expect(field).toHaveValue("");
  });

  it("offers archives open in tabs that the group doesn't have, one click each", async () => {
    const actions = renderPage({ groups: [group("g1", "Overwatch")] });
    await expand("Overwatch");
    await userEvent.click(screen.getByRole("button", { name: "Add stream" }));
    const open = screen.getByRole("list", { name: "Archives open in your tabs" });
    expect(within(open).getAllByRole("listitem")).toHaveLength(1);
    await userEvent.click(within(open).getByRole("button", { name: "Add Fourth POV" }));
    expect(actions.onAddStream).toHaveBeenCalledWith("g1", "ddddddddddd");
  });
});
