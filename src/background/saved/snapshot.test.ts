import { describe, expect, it } from "vitest";

import type { PlayerStatus } from "../../lib/messages.ts";
import { mergeMembers, saveableMembers, sameMembers } from "./snapshot.ts";

function archive(overrides: Partial<PlayerStatus> = {}): PlayerStatus {
  return {
    id: "1:0",
    tabId: 1,
    videoId: "aaaaaaaaaaa",
    kind: "archive",
    title: "A",
    channel: "Channel A",
    state: "playing",
    playbackRate: 1,
    position: 61.27,
    hasStartTime: true,
    inGroup: true,
    offset: 2.5,
    ...overrides,
  };
}

const A = { videoId: "aaaaaaaaaaa", title: "A", channel: "Channel A", offset: 2.5, position: 61.3 };
const B = { ...A, videoId: "bbbbbbbbbbb", title: "B", offset: 0, position: 10 };

describe("saveableMembers", () => {
  it("takes group archives on watch pages, once per video", () => {
    const players = [
      archive(),
      archive({ id: "2:0", inGroup: false, videoId: "ccccccccccc" }),
      archive({ id: "3:0", hasStartTime: false, videoId: "ddddddddddd" }),
      archive({ id: "4:0", kind: "live", videoId: "eeeeeeeeeee" }),
      archive({ id: "5:0" }),
    ];
    expect(saveableMembers(players)).toEqual([A]);
  });

  it("counts a missing position as the start", () => {
    expect(saveableMembers([archive({ position: undefined })])[0]?.position).toBe(0);
  });
});

describe("mergeMembers", () => {
  it("updates members still there, keeps closed ones and adds new ones", () => {
    const moved = { ...A, position: 900 };
    const added = { ...A, videoId: "ccccccccccc" };
    expect(mergeMembers([A, B], [moved, added])).toEqual([moved, B, added]);
  });
});

describe("sameMembers", () => {
  it("compares every field in order", () => {
    expect(sameMembers([A, B], [A, B])).toBe(true);
    expect(sameMembers([A, B], [B, A])).toBe(false);
    expect(sameMembers([A], [{ ...A, position: 62 }])).toBe(false);
    expect(sameMembers([A], [A, B])).toBe(false);
  });
});
