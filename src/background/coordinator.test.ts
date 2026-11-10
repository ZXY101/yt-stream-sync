import type { PlayerCommand, PlayerReport } from "../lib/messages.ts";
import { createCoordinator } from "./coordinator.ts";

function report(overrides: Partial<PlayerReport> = {}): PlayerReport {
  return {
    latency: 5,
    bufferAhead: 3,
    state: "playing",
    playbackRate: 1,
    title: "Stream",
    channel: "Someone",
    videoId: "v1",
    ...overrides,
  };
}

function setup() {
  let clock = 0;
  const settings = { enabled: true, offsets: {}, safetyMargin: 0 };
  const send = vi.fn<(id: string, command: PlayerCommand) => void>();
  const coordinator = createCoordinator({ send, settings: () => settings, now: () => clock });
  function advance(seconds: number) {
    clock += seconds;
  }
  /** Reports players and opts them all in, like a user ticking them in the popup. */
  function join(players: Record<string, Partial<PlayerReport>>) {
    for (const [id, overrides] of Object.entries(players)) {
      coordinator.report(id, report(overrides));
      coordinator.setInGroup(id, true);
    }
  }
  return { coordinator, send, advance, join };
}

describe("coordinator", () => {
  it("slows the player that's ahead", () => {
    const { coordinator, send, join } = setup();
    join({ "1:0": { latency: 4 }, "2:0": { latency: 6 } });

    coordinator.tick();

    expect(send.mock.calls).toEqual([["1:0", { type: "setRate", rate: 0.92 }]]);
  });

  it("turns pause and play actions into commands, then slows the rest of the gap", () => {
    const { coordinator, send, join } = setup();
    join({ "1:0": { latency: 4 }, "2:0": { latency: 20 } });

    coordinator.tick();
    coordinator.report("1:0", report({ latency: 19.5, state: "paused" }));
    coordinator.tick();

    expect(send.mock.calls).toEqual([
      ["1:0", { type: "pause" }],
      ["1:0", { type: "play" }],
      ["1:0", { type: "setRate", rate: 0.92 }],
    ]);
  });

  it("lists every player with how far ahead it is", () => {
    const { coordinator, join } = setup();
    join({ "1:0": { latency: 4, title: "A" }, "2:0": { latency: 6, title: "B" } });
    coordinator.report("3:0", report({ title: "C" }));
    coordinator.tick();

    expect(coordinator.status()).toEqual([
      expect.objectContaining({ id: "1:0", title: "A", inGroup: true, error: 2 }),
      expect.objectContaining({ id: "2:0", title: "B", inGroup: true, error: 0 }),
      expect.objectContaining({ id: "3:0", title: "C", inGroup: false, error: undefined }),
    ]);
  });

  it("leaves out players that stopped reporting", () => {
    const { coordinator, send, advance, join } = setup();
    join({ "1:0": { latency: 4 } });
    advance(5);
    join({ "2:0": { latency: 6 } });

    coordinator.tick();

    expect(send).not.toHaveBeenCalled();
  });

  it("drops players that left or have no live video any more", () => {
    const { coordinator } = setup();
    coordinator.report("1:0", report());
    coordinator.report("2:0", report());
    coordinator.report("3:0", report());

    coordinator.remove("1:0");
    coordinator.report("2:0", null);

    expect(coordinator.status().map((player) => player.id)).toEqual(["3:0"]);
  });

  it("syncs nothing until the user opts players in", () => {
    const { coordinator, send } = setup();
    coordinator.report("1:0", report({ latency: 4 }));
    coordinator.report("2:0", report({ latency: 6 }));

    coordinator.tick();

    expect(send).not.toHaveBeenCalled();
  });

  it("hands a player back when the user takes it out", () => {
    const { coordinator, send, join } = setup();
    join({ "1:0": { latency: 4 }, "2:0": { latency: 6 }, "3:0": { latency: 6 } });
    coordinator.tick();
    coordinator.report("1:0", report({ latency: 4.1, playbackRate: 0.92 }));
    send.mockClear();

    coordinator.setInGroup("1:0", false);
    coordinator.tick();

    expect(send.mock.calls).toEqual([["1:0", { type: "setRate", rate: 1 }]]);
  });

  it("drops a player from the group when its frame moves on to another video", () => {
    const { coordinator, join } = setup();
    join({ "1:0": {}, "2:0": {} });

    coordinator.report("1:0", report({ videoId: "v2" }));
    coordinator.tick();
    coordinator.report("1:0", report({ videoId: "v1" }));

    expect(coordinator.status()[0]?.inGroup).toBe(false);
  });

  it("can't opt in a player it hasn't heard from", () => {
    const { coordinator } = setup();

    coordinator.setInGroup("9:0", true);
    coordinator.report("9:0", report());

    expect(coordinator.status()[0]?.inGroup).toBe(false);
  });
});
