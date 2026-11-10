import { initialArchiveState, stepArchive } from "./step.ts";
import type { ArchiveSample, ArchiveSettings, ArchiveState } from "./types.ts";

const settings: ArchiveSettings = { enabled: true, group: ["a", "b"], offsets: {} };

function sample(id: string, overrides: Partial<ArchiveSample> = {}): ArchiveSample {
  return {
    id,
    position: 100,
    duration: 10_000,
    startTime: 1_000_000_000,
    state: "playing",
    playbackRate: 1,
    userActions: 0,
    ...overrides,
  };
}

describe("stepArchive", () => {
  it("puts a trimmed player back to normal speed when the group breaks up", () => {
    const state: ArchiveState = { ...initialArchiveState(), trimming: { b: true } };

    const result = stepArchive(state, [sample("a"), sample("b", { playbackRate: 0.95 })], {
      ...settings,
      group: ["a"],
    });

    expect(result.actions).toEqual([{ type: "setRate", id: "b", rate: 1 }]);
    expect(result.errors).toEqual({});
  });

  it("holds while a member shows an ad", () => {
    const samples = [sample("a"), sample("b", { position: 400, state: "ad" })];

    expect(stepArchive(initialArchiveState(), samples, settings).actions).toEqual([]);
  });

  it("does nothing when turned off", () => {
    const samples = [sample("a"), sample("b", { position: 400 })];

    const result = stepArchive(initialArchiveState(), samples, { ...settings, enabled: false });

    expect(result.actions).toEqual([]);
  });

  it("leaves a buffering follower to settle before correcting it", () => {
    const samples = [sample("a"), sample("b", { position: 400, state: "buffering" })];

    expect(stepArchive(initialArchiveState(), samples, settings).actions).toEqual([]);
  });

  it("lets a follower that already ended stay ended", () => {
    const samples = [sample("a", { position: 9000 }), sample("b", { duration: 500 })];

    expect(stepArchive(initialArchiveState(), samples, settings).actions).toEqual([]);
  });

  it("keeps following the same reference until the user touches another player", () => {
    const first = stepArchive(
      initialArchiveState(),
      [sample("a"), sample("b", { userActions: 1 })],
      settings,
    );
    const second = stepArchive(
      first.state,
      [sample("a"), sample("b", { userActions: 1 })],
      settings,
    );

    expect(first.state.reference).toBe("b");
    expect(second.state.reference).toBe("b");
  });

  it("anchors an embed against a member with a start time when the embed is the reference", () => {
    const embed = sample("a", { startTime: undefined, position: 50, userActions: 1 });
    const result = stepArchive(initialArchiveState(), [embed, sample("b")], settings);

    expect(result.state.bases.a).toBe(1_000_000_000 + 100 - 50);
    expect(result.actions).toEqual([]);
  });
});
