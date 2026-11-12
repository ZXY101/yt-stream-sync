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
    { videoId: "Vh-YGhqy_Mo", title: "Tsuzuri POV", channel: "Tsuzuri", offset: 0, position: 4521 },
    {
      videoId: "Cdp-8nmEQCA",
      title: "Kyoko POV",
      channel: "Kyoko",
      offset: -130.2,
      position: 4391,
    },
  ],
};

function group(id: string) {
  return { ...GROUP, id, name: `Group ${id}` };
}

function renderSaved(saved: Partial<SavedStatus>, hasMembers = false) {
  const handlers = {
    onSave: vi.fn<() => void>(),
    onOpen: vi.fn<(groupId: string) => void>(),
    onDelete: vi.fn<(groupId: string) => void>(),
    onRename: vi.fn<(groupId: string, name: string) => void>(),
    onAddStreams: vi.fn<(groupId: string) => void>(),
    onManage: vi.fn<() => void>(),
  };
  const status: SavedStatus = {
    groups: [],
    canSave: false,
    opening: 0,
    addable: 0,
    inSync: 0,
    ...saved,
  };
  const view = render(<SavedGroups saved={status} hasMembers={hasMembers} {...handlers} />);
  return { ...handlers, view };
}

describe("SavedGroups", () => {
  it("shows nothing with no saved groups and nothing to save", () => {
    expect(renderSaved({}).view.container).toBeEmptyDOMElement();
    expect(renderSaved({}, true).view.container).toBeEmptyDOMElement();
  });

  describe("with no sync group", () => {
    it("lists the newest saved groups with their place, opens one, and links to all", async () => {
      const groups = [GROUP, group("2"), group("3"), group("4")];
      const { onOpen, onManage } = renderSaved({ groups });
      expect(screen.getAllByRole("listitem")).toHaveLength(3);
      expect(screen.getAllByText(/^2 streams · at 1:15:21 · /)[0]).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Open Tsuzuri + Kyoko" }));
      expect(onOpen).toHaveBeenCalledWith("g1");
      await userEvent.click(screen.getByRole("button", { name: "View all 4" }));
      expect(onManage).toHaveBeenCalled();
    });
  });

  describe("with an unsaved sync group", () => {
    it("offers to save it and links to the saved groups, without the recent list", async () => {
      const { onSave, onManage } = renderSaved({ groups: [GROUP], canSave: true }, true);
      expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Save this group" }));
      expect(onSave).toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Saved groups" }));
      expect(onManage).toHaveBeenCalled();
    });

    it("only links to the saved groups when the group can't be saved", () => {
      renderSaved({ groups: [GROUP] }, true);
      expect(screen.queryByRole("button", { name: "Save this group" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Saved groups" })).toBeInTheDocument();
    });
  });

  describe("while a saved group is open", () => {
    it("shows only that group, playing, with a link to manage groups", () => {
      renderSaved({ groups: [group("2"), GROUP], activeId: "g1", canSave: true, inSync: 2 }, true);
      expect(screen.getByLabelText("Open saved group Tsuzuri + Kyoko")).toBeInTheDocument();
      expect(screen.getByText("Playing")).toBeInTheDocument();
      expect(screen.getByText("2 streams")).toBeInTheDocument();
      expect(screen.queryByText("Group 2")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save this group" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Manage saved groups" })).toBeInTheDocument();
    });

    it("renames it in place; Escape cancels", async () => {
      const { onRename } = renderSaved({ groups: [GROUP], activeId: "g1" }, true);
      await userEvent.click(screen.getByRole("button", { name: "Rename Tsuzuri + Kyoko" }));
      await userEvent.keyboard("{Escape}");
      expect(onRename).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Rename Tsuzuri + Kyoko" }));
      const input = screen.getByRole("textbox", { name: "Group name" });
      await userEvent.clear(input);
      await userEvent.type(input, "Overwatch collab{Enter}");
      expect(onRename).toHaveBeenCalledWith("g1", "Overwatch collab");
    });

    it("asks before deleting it", async () => {
      const { onDelete } = renderSaved({ groups: [GROUP], activeId: "g1" }, true);
      await userEvent.click(screen.getByRole("button", { name: "Delete Tsuzuri + Kyoko" }));
      expect(screen.getByText("Delete this group?")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Keep" }));
      expect(onDelete).not.toHaveBeenCalled();
      await userEvent.click(screen.getByRole("button", { name: "Delete Tsuzuri + Kyoko" }));
      await userEvent.click(screen.getByRole("button", { name: "Delete" }));
      expect(onDelete).toHaveBeenCalledWith("g1");
    });

    it("offers to add streams the sync group has and the saved group doesn't", async () => {
      const { onAddStreams } = renderSaved({ groups: [GROUP], activeId: "g1", addable: 1 }, true);
      await userEvent.click(
        screen.getByRole("button", { name: "Add 1 stream to the saved group" }),
      );
      expect(onAddStreams).toHaveBeenCalledWith("g1");
    });

    it("isn't playing with one stream left, and offers to reopen the closed ones", async () => {
      const { onOpen } = renderSaved({ groups: [GROUP], activeId: "g1", inSync: 1 }, true);
      expect(screen.queryByText("Playing")).not.toBeInTheDocument();
      expect(screen.getByText("1 of 2 streams open")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Reopen closed streams" }));
      expect(onOpen).toHaveBeenCalledWith("g1");
    });

    it("says how many streams are still opening", () => {
      renderSaved({ groups: [GROUP], activeId: "g1", opening: 1 });
      expect(screen.getByText("Opening: waiting for 1 stream.")).toBeInTheDocument();
    });
  });
});
