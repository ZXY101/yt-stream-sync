import type { ArchiveReport, LiveReport, PlayerCommand } from "../lib/messages.ts";
import { createCoordinator } from "./coordinator.ts";

function report(overrides: Partial<LiveReport> = {}): LiveReport {
  return {
    kind: "live",
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
  function join(players: Record<string, Partial<LiveReport>>) {
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

    expect(coordinator.status().players).toEqual([
      expect.objectContaining({ id: "1:0", title: "A", inGroup: true, error: 2 }),
      expect.objectContaining({ id: "2:0", title: "B", inGroup: true, error: 0 }),
      expect.objectContaining({ id: "3:0", title: "C", inGroup: false, offset: 0 }),
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

    expect(coordinator.status().players.map((player) => player.id)).toEqual(["3:0"]);
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

    expect(coordinator.status().players[0]?.inGroup).toBe(false);
  });

  it("can't opt in a player it hasn't heard from", () => {
    const { coordinator } = setup();

    coordinator.setInGroup("9:0", true);
    coordinator.report("9:0", report());

    expect(coordinator.status().players[0]?.inGroup).toBe(false);
  });

  it("syncs archives and follows a user's seek straight away", () => {
    const { coordinator, send } = setup();
    coordinator.report("1:0", archive({ position: 100, startTime: 1_000_000_000 }));
    coordinator.report("2:0", archive({ position: 30, startTime: 1_000_000_070 }));
    coordinator.setInGroup("1:0", true);
    coordinator.setInGroup("2:0", true);
    coordinator.tick();
    send.mockClear();

    coordinator.report("2:0", archive({ position: 500, startTime: 1_000_000_070, userActions: 1 }));

    expect(send.mock.calls).toEqual([["1:0", { type: "seek", position: 570 }]]);
  });

  it("won't sync live streams and archives together", () => {
    const { coordinator, send, join } = setup();
    join({ "1:0": { latency: 4 }, "2:0": { latency: 6 } });
    coordinator.report("3:0", archive({}));
    coordinator.setInGroup("3:0", true);

    coordinator.tick();

    expect(send).not.toHaveBeenCalled();
    expect(coordinator.status().mixed).toBe(true);
  });

  it("keeps nudges for members only, and clears them when a player leaves", () => {
    const { coordinator, join } = setup();
    join({ "1:0": {}, "2:0": {} });
    coordinator.report("3:0", report());

    coordinator.nudge("1:0", 0.1);
    coordinator.nudge("1:0", 0.1);
    coordinator.nudge("3:0", 1);

    expect(coordinator.status().players.map((player) => player.offset)).toEqual([0.2, 0, 0]);
    coordinator.setInGroup("1:0", false);
    expect(coordinator.status().players[0]?.offset).toBe(0);
  });

  it("reports where archives are and whether their start time is known", () => {
    const { coordinator } = setup();
    coordinator.report("1:0", archive({ position: 42 }));

    expect(coordinator.status().players[0]).toMatchObject({
      kind: "archive",
      position: 42,
      hasStartTime: false,
    });
  });

  it("aims a jump at where a playing archive is now, not where it last reported", () => {
    const { coordinator, send, advance } = setup();
    coordinator.report("1:0", archive({ position: 100, startTime: 1_000_000_000 }));
    coordinator.report("2:0", archive({ position: 30, startTime: 1_000_000_070 }));
    coordinator.setInGroup("1:0", true);
    coordinator.setInGroup("2:0", true);
    coordinator.tick();
    send.mockClear();
    advance(0.8);

    coordinator.nudge("2:0", 1);

    // The reference has played on 0.8 s since its last report; without that this would be 31.
    expect(send.mock.calls).toEqual([
      ["2:0", { type: "seek", position: expect.closeTo(31.8, 5) as number }],
    ]);
  });
});

function archive(overrides: Partial<ArchiveReport>): ArchiveReport {
  return {
    kind: "archive",
    position: 0,
    duration: 10_000,
    userActions: 0,
    state: "playing",
    playbackRate: 1,
    title: "Archive",
    channel: "Someone",
    videoId: "v1",
    ...overrides,
  };
}
