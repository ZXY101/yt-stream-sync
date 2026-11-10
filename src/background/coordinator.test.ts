import type { SyncSettings } from "../controller/types.ts";
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
    ...overrides,
  };
}

function setup() {
  let clock = 0;
  const settings: SyncSettings = { enabled: true, offsets: {}, safetyMargin: 0 };
  const send = vi.fn<(id: string, command: PlayerCommand) => void>();
  const coordinator = createCoordinator({ send, settings: () => settings, now: () => clock });
  function advance(seconds: number) {
    clock += seconds;
  }
  return { coordinator, send, advance, settings };
}

describe("coordinator", () => {
  it("slows the player that's ahead", () => {
    const { coordinator, send } = setup();
    coordinator.report("1:0", report({ latency: 4 }));
    coordinator.report("2:0", report({ latency: 6 }));

    coordinator.tick();

    expect(send.mock.calls).toEqual([["1:0", { type: "setRate", rate: 0.92 }]]);
  });

  it("turns pause and play actions into commands, then slows the rest of the gap", () => {
    const { coordinator, send } = setup();
    coordinator.report("1:0", report({ latency: 4 }));
    coordinator.report("2:0", report({ latency: 20 }));

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
    const { coordinator } = setup();
    coordinator.report("1:0", report({ latency: 4, title: "A" }));
    coordinator.report("2:0", report({ latency: 6, title: "B" }));
    coordinator.tick();

    expect(coordinator.status()).toEqual([
      expect.objectContaining({ id: "1:0", title: "A", error: 2 }),
      expect.objectContaining({ id: "2:0", title: "B", error: 0 }),
    ]);
  });

  it("leaves out players that stopped reporting", () => {
    const { coordinator, send, advance } = setup();
    coordinator.report("1:0", report({ latency: 4 }));
    advance(5);
    coordinator.report("2:0", report({ latency: 6 }));

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
});
