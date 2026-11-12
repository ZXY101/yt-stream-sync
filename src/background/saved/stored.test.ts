import { describe, expect, it } from "vitest";

import { capGroups, groupName, readSavedGroups, watchUrlAt, type SavedGroup } from "./stored.ts";

const MEMBER = { videoId: "Vh-YGhqy_Mo", title: "A", channel: "Tsuzuri", offset: 0, position: 60 };

function group(overrides: Partial<SavedGroup> = {}): SavedGroup {
  return {
    id: "g1",
    name: "Tsuzuri",
    updatedAt: 1_800_000_000_000,
    members: [MEMBER],
    ...overrides,
  };
}

describe("readSavedGroups", () => {
  it("keeps groups in the expected shape", () => {
    expect(readSavedGroups([group()])).toEqual([group()]);
  });

  it.each([
    ["not a list", { g1: group() }],
    ["nothing stored", undefined],
  ])("is empty when %s", (_label, value) => {
    expect(readSavedGroups(value)).toEqual([]);
  });

  it.each<[string, unknown]>([
    ["no id", group({ id: "" })],
    ["a bad time", group({ updatedAt: -1 })],
    ["a video id that isn't one", group({ members: [{ ...MEMBER, videoId: "../evil" }] })],
    ["an offset past an hour", group({ members: [{ ...MEMBER, offset: 3601 }] })],
    ["a negative position", group({ members: [{ ...MEMBER, position: -1 }] })],
    ["a member that isn't an object", group({ members: [null as never] })],
    ["too many members", group({ members: Array.from({ length: 17 }, () => MEMBER) })],
    ["a missing name", { ...group(), name: undefined }],
    ["a string", "group"],
  ])("drops a group with %s", (_label, value) => {
    expect(readSavedGroups([value, group({ id: "ok" })])).toEqual([group({ id: "ok" })]);
  });

  it("keeps at most 100 groups", () => {
    const many = Array.from({ length: 120 }, (_, index) => group({ id: `g${index}` }));
    expect(readSavedGroups(many)).toHaveLength(100);
    expect(capGroups(many)).toHaveLength(100);
  });
});

describe("groupName", () => {
  it("joins the channels once each", () => {
    const members = [{ channel: "Tsuzuri" }, { channel: " Kyoko " }, { channel: "Tsuzuri" }];
    expect(groupName(members)).toBe("Tsuzuri + Kyoko");
  });

  it("has a fallback without channels", () => {
    expect(groupName([{ channel: "" }])).toBe("Saved group");
  });

  it("shortens long names", () => {
    const name = groupName([{ channel: "x".repeat(50) }, { channel: "y".repeat(50) }]);
    expect(name).toHaveLength(80);
    expect(name.endsWith("…")).toBe(true);
  });
});

describe("watchUrlAt", () => {
  it("links the watch page at the whole second", () => {
    expect(watchUrlAt("Vh-YGhqy_Mo", 4521.8)).toBe(
      "https://www.youtube.com/watch?v=Vh-YGhqy_Mo&t=4521s",
    );
  });
});
