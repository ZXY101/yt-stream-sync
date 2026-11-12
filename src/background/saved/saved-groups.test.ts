import { describe, expect, it, vi } from "vitest";

import type { PlayerStatus } from "../../lib/messages.ts";
import { createSavedGroups } from "./saved-groups.ts";
import type { SavedGroup } from "./stored.ts";

function archive(id: string, videoId: string, overrides: Partial<PlayerStatus> = {}) {
  const player: PlayerStatus = {
    id,
    tabId: Number(id.split(":")[0]),
    videoId,
    kind: "archive",
    title: `Title ${videoId}`,
    channel: `Channel ${videoId}`,
    state: "playing",
    playbackRate: 1,
    position: 100,
    hasStartTime: true,
    inGroup: true,
    offset: 0,
    ...overrides,
  };
  return player;
}

const VIDEO_A = "aaaaaaaaaaa";
const VIDEO_B = "bbbbbbbbbbb";

function member(videoId: string, offset = 0, position = 100) {
  return { videoId, title: `Title ${videoId}`, channel: `Channel ${videoId}`, offset, position };
}

const STORED: SavedGroup = {
  id: "g1",
  name: "Saved",
  updatedAt: 1000,
  members: [member(VIDEO_A, 0, 3600), member(VIDEO_B, 130.2, 3600)],
};

async function setUp(stored: unknown = [], initial: PlayerStatus[] = []) {
  const state = { players: initial, now: 1_000_000, nextTab: 100 };
  const options = {
    load: vi.fn<() => Promise<unknown>>(async () => stored),
    save: vi.fn<(groups: SavedGroup[]) => void>(),
    openTab: vi.fn<(url: string) => Promise<number | undefined>>(async () => {
      state.nextTab += 1;
      return state.nextTab;
    }),
    focusTab: vi.fn<(tabId: number) => void>(),
    players: () => state.players,
    setInGroup: vi.fn<(id: string, inGroup: boolean) => void>((id, inGroup) => {
      state.players = state.players.map((p) => (p.id === id ? { ...p, inGroup } : p));
    }),
    setOffset: vi.fn<(id: string, offset: number) => void>(),
    clearGroup: vi.fn<() => void>(() => {
      state.players = state.players.map((p) => ({ ...p, inGroup: false }));
    }),
    now: () => state.now,
    newId: () => "new-id",
  };
  const saved = createSavedGroups(options);
  await saved.ready;
  return { saved, options, state };
}

function lastSaved(save: ReturnType<typeof vi.fn<(groups: SavedGroup[]) => void>>) {
  return save.mock.lastCall?.[0] ?? [];
}

describe("createSavedGroups", () => {
  it("lists what storage holds and ignores unreadable storage", async () => {
    const { saved } = await setUp([STORED, { broken: true }]);
    expect(saved.status().groups).toEqual([
      {
        id: "g1",
        name: "Saved",
        updatedAt: 1000,
        position: 3600,
        streams: [{ ...member(VIDEO_A, 0, 3600) }, { ...member(VIDEO_B, 130.2, 3600) }],
      },
    ]);
    const failing = createSavedGroups({
      ...(await setUp()).options,
      load: () => Promise.reject(new Error("x")),
    });
    await failing.ready;
    expect(failing.status().groups).toEqual([]);
  });

  it("saves two or more archives and then keeps them up to date", async () => {
    const players = [archive("1:0", VIDEO_A), archive("2:0", VIDEO_B, { offset: 130 })];
    const { saved, options, state } = await setUp([], players);
    expect(saved.status().canSave).toBe(true);
    saved.handle({ type: "saveGroup" });
    expect(lastSaved(options.save)).toEqual([
      {
        id: "new-id",
        name: `Channel ${VIDEO_A} + Channel ${VIDEO_B}`,
        updatedAt: 1_000_000,
        members: [member(VIDEO_A), member(VIDEO_B, 130)],
      },
    ]);
    expect(saved.status().activeId).toBe("new-id");

    state.players = [
      archive("1:0", VIDEO_A, { position: 160 }),
      archive("2:0", VIDEO_B, { offset: 130, position: 160 }),
    ];
    state.now += 5000;
    saved.tick();
    expect(options.save).toHaveBeenCalledTimes(1);
    state.now += 5000;
    saved.tick();
    expect(lastSaved(options.save)[0]?.members.map((m) => m.position)).toEqual([160, 160]);
    // Nothing changed since: nothing written.
    state.now += 10_000;
    saved.tick();
    expect(options.save).toHaveBeenCalledTimes(2);
  });

  it("doesn't save fewer than two archives", async () => {
    const { saved, options } = await setUp([], [archive("1:0", VIDEO_A)]);
    expect(saved.status().canSave).toBe(false);
    saved.handle({ type: "saveGroup" });
    expect(options.save).not.toHaveBeenCalled();
  });

  it("opens tabs at the saved position and restores offsets as players report", async () => {
    const { saved, options, state } = await setUp([STORED]);
    saved.handle({ type: "openSavedGroup", groupId: "g1" });
    expect(options.clearGroup).toHaveBeenCalled();
    // Each tab is opened in front (so Firefox lets its video start), then the first comes back.
    await vi.waitFor(() => expect(options.focusTab).toHaveBeenCalledWith(101));
    expect(options.openTab.mock.calls).toEqual([
      [`https://www.youtube.com/watch?v=${VIDEO_A}&t=3600s`],
      [`https://www.youtube.com/watch?v=${VIDEO_B}&t=3600s`],
    ]);
    expect(saved.status()).toMatchObject({ activeId: "g1", opening: 2 });

    // An embed of B (no start time) doesn't count; the watch page does.
    state.players = [
      archive("1:0", VIDEO_A, { inGroup: false }),
      archive("2:5", VIDEO_B, { inGroup: false, hasStartTime: false }),
    ];
    saved.tick();
    expect(options.setOffset.mock.calls).toEqual([["1:0", 0]]);
    state.players.push(archive("3:0", VIDEO_B, { inGroup: false }));
    saved.tick();
    expect(options.setOffset.mock.calls).toEqual([
      ["1:0", 0],
      ["3:0", 130.2],
    ]);
    expect(options.setInGroup.mock.calls).toEqual([
      ["1:0", true],
      ["3:0", true],
    ]);
    expect(saved.status().opening).toBe(0);
  });

  it("reuses a watch page already open (not an embed), and gives up on tabs that never report", async () => {
    const { saved, options, state } = await setUp(
      [STORED],
      [
        archive("1:0", VIDEO_A, { inGroup: false }),
        archive("2:0", VIDEO_B, { inGroup: false, hasStartTime: false }),
      ],
    );
    saved.handle({ type: "openSavedGroup", groupId: "g1" });
    expect(options.openTab.mock.calls).toEqual([
      [`https://www.youtube.com/watch?v=${VIDEO_B}&t=3600s`],
    ]);
    // A single new tab is already in front.
    await Promise.resolve();
    expect(options.focusTab).not.toHaveBeenCalled();
    expect(options.setInGroup).toHaveBeenCalledWith("1:0", true);
    state.now += 121_000;
    saved.tick();
    expect(saved.status().opening).toBe(0);
  });

  it("ignores a group that doesn't exist", async () => {
    const { saved, options } = await setUp([STORED]);
    saved.handle({ type: "openSavedGroup", groupId: "nope" });
    expect(options.clearGroup).not.toHaveBeenCalled();
  });

  it("keeps its archives when streams leave or join the sync group", async () => {
    const players = [archive("1:0", VIDEO_A, { position: 200 }), archive("2:0", VIDEO_B)];
    const { saved, options, state } = await setUp([STORED], players);
    saved.handle({ type: "openSavedGroup", groupId: "g1" });
    saved.handle({ type: "setInGroup", id: "2:0", inGroup: false });
    state.players = [
      archive("1:0", VIDEO_A, { position: 200 }),
      archive("2:0", VIDEO_B, { inGroup: false }),
      archive("3:0", "ccccccccccc"),
    ];
    state.now += 10_000;
    saved.tick();
    const members = lastSaved(options.save)[0]?.members ?? [];
    expect(members.map((m) => m.videoId)).toEqual([VIDEO_A, VIDEO_B]);
    expect(members[0]?.position).toBe(200);
  });

  it("renames a group, ignoring blank names, without moving it in the list", async () => {
    const { saved, options } = await setUp([STORED, { ...STORED, id: "g2", name: "Other" }]);
    saved.handle({ type: "renameSavedGroup", groupId: "g2", name: "  Movie night  " });
    expect(lastSaved(options.save).map((g) => g.name)).toEqual(["Saved", "Movie night"]);
    saved.handle({ type: "renameSavedGroup", groupId: "g2", name: "   " });
    saved.handle({ type: "renameSavedGroup", groupId: "g2", name: "Movie night" });
    saved.handle({ type: "renameSavedGroup", groupId: "nope", name: "x" });
    expect(options.save).toHaveBeenCalledTimes(1);
  });

  it("removes an archive from a saved group, but keeps at least two", async () => {
    const three = { ...STORED, members: [...STORED.members, member("ccccccccccc")] };
    const { saved, options } = await setUp([three]);
    saved.handle({ type: "removeSavedMember", groupId: "g1", videoId: "ccccccccccc" });
    expect(lastSaved(options.save)[0]?.members.map((m) => m.videoId)).toEqual([VIDEO_A, VIDEO_B]);
    saved.handle({ type: "removeSavedMember", groupId: "g1", videoId: VIDEO_A });
    saved.handle({ type: "removeSavedMember", groupId: "nope", videoId: VIDEO_A });
    expect(options.save).toHaveBeenCalledTimes(1);
  });

  it("stops updating once the group is cleared", async () => {
    const { saved, options, state } = await setUp([STORED], [archive("1:0", VIDEO_A)]);
    saved.handle({ type: "openSavedGroup", groupId: "g1" });
    saved.handle({ type: "clearGroup" });
    expect(saved.status()).toMatchObject({ activeId: undefined, opening: 0 });
    state.now += 10_000;
    saved.tick();
    expect(options.save).not.toHaveBeenCalled();
  });

  it("lets go of the open group once its tabs are all closed, so it can be opened again", async () => {
    const players = [archive("1:0", VIDEO_A), archive("2:0", VIDEO_B)];
    const { saved, state } = await setUp([STORED], players);
    saved.handle({ type: "openSavedGroup", groupId: "g1" });
    saved.tick();
    expect(saved.status()).toMatchObject({ activeId: "g1", inSync: 2 });
    state.players = [players[0] as PlayerStatus];
    saved.tick();
    expect(saved.status()).toMatchObject({ activeId: "g1", inSync: 1 });
    state.players = [];
    saved.tick();
    expect(saved.status().activeId).toBeUndefined();
  });

  it("keeps the group open while its tabs are still loading", async () => {
    const { saved, state } = await setUp([STORED]);
    saved.handle({ type: "openSavedGroup", groupId: "g1" });
    saved.tick();
    expect(saved.status().activeId).toBe("g1");
    state.now += 121_000;
    saved.tick();
    expect(saved.status().activeId).toBeUndefined();
  });

  it("sets an offset in a saved group, and on the open group's player too", async () => {
    const players = [archive("1:0", VIDEO_A), archive("2:0", VIDEO_B, { offset: 130.2 })];
    const { saved, options } = await setUp([STORED, { ...STORED, id: "g2" }], players);
    saved.handle({ type: "setSavedOffset", groupId: "g2", videoId: VIDEO_B, offset: 12 });
    expect(lastSaved(options.save)[1]?.members[1]?.offset).toBe(12);
    expect(options.setOffset).not.toHaveBeenCalled();
    saved.handle({ type: "openSavedGroup", groupId: "g1" });
    options.setOffset.mockClear();
    saved.handle({ type: "setSavedOffset", groupId: "g1", videoId: VIDEO_B, offset: 125 });
    expect(lastSaved(options.save)[0]?.members[1]?.offset).toBe(125);
    expect(options.setOffset).toHaveBeenCalledWith("2:0", 125);
    const writes = options.save.mock.calls.length;
    saved.handle({ type: "setSavedOffset", groupId: "g1", videoId: "ccccccccccc", offset: 1 });
    expect(options.save).toHaveBeenCalledTimes(writes);
  });

  it("adds the sync group's new archives to the open group only", async () => {
    const players = [archive("1:0", VIDEO_A), archive("2:0", VIDEO_B)];
    const { saved, options, state } = await setUp([STORED, { ...STORED, id: "g2" }], players);
    saved.handle({ type: "openSavedGroup", groupId: "g1" });
    expect(saved.status().addable).toBe(0);
    state.players = [...players, archive("3:0", "ccccccccccc", { offset: 4 })];
    expect(saved.status().addable).toBe(1);
    saved.handle({ type: "addToSavedGroup", groupId: "g2" });
    expect(options.save).not.toHaveBeenCalled();
    saved.handle({ type: "addToSavedGroup", groupId: "g1" });
    const members = lastSaved(options.save)[0]?.members ?? [];
    expect(members.map((m) => [m.videoId, m.offset])).toEqual([
      [VIDEO_A, 0],
      [VIDEO_B, 130.2],
      ["ccccccccccc", 4],
    ]);
    expect(saved.status().addable).toBe(0);
  });

  it("deletes a group, also the open one", async () => {
    const { saved, options } = await setUp([STORED, { ...STORED, id: "g2" }]);
    saved.handle({ type: "openSavedGroup", groupId: "g1" });
    saved.handle({ type: "deleteSavedGroup", groupId: "g1" });
    expect(lastSaved(options.save).map((g) => g.id)).toEqual(["g2"]);
    expect(saved.status().activeId).toBeUndefined();
    saved.handle({ type: "deleteSavedGroup", groupId: "g2" });
    expect(lastSaved(options.save)).toEqual([]);
  });

  it("leaves other requests alone", async () => {
    const { saved, options } = await setUp([STORED]);
    saved.handle({ type: "setInGroup", id: "1:0", inGroup: true });
    saved.handle({ type: "setInGroup", id: "1:0", inGroup: false });
    saved.handle({ type: "getStatus" });
    expect(options.save).not.toHaveBeenCalled();
  });
});
