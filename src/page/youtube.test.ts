import { createFakePlayer } from "../test/fake-youtube.ts";
import { findPlayer, readBuffer, readLatency, readState } from "./youtube.ts";

describe("findPlayer", () => {
  afterEach(() => document.body.replaceChildren());

  it("finds the player element by its id and API", () => {
    const { element } = createFakePlayer();
    document.body.append(element);

    expect(findPlayer(document)).toBe(element);
  });

  it("ignores a look-alike element without the player API", () => {
    const element = document.createElement("div");
    element.id = "movie_player";
    document.body.append(element);

    expect(findPlayer(document)).toBeNull();
  });
});

describe("readState", () => {
  it.each([
    [0, "ended"],
    [1, "playing"],
    [2, "paused"],
    [3, "buffering"],
    [-1, "paused"],
    [5, "paused"],
  ])("maps player state %i to %s", (stateCode, expected) => {
    expect(readState(createFakePlayer({ stateCode }).element)).toBe(expected);
  });

  it.each(["ad-showing", "ad-interrupting"])("reports an ad when the player has %s", (name) => {
    const { element } = createFakePlayer();
    element.classList.add(name);

    expect(readState(element)).toBe("ad");
  });
});

describe("stats parsing", () => {
  it("reads latency and buffer from their text", () => {
    const stats = createFakePlayer({
      latencyText: "17.66s",
      bufferText: "16.02 s",
    }).element.getStatsForNerds();

    expect(readLatency(stats)).toBe(17.66);
    expect(readBuffer(stats)).toBe(16.02);
  });

  it("has no latency while YouTube hides that row", () => {
    expect(readLatency({ live_latency_style: "display:none", live_latency_secs: "3s" })).toBe(
      undefined,
    );
  });

  it("treats unreadable values as missing", () => {
    expect(readLatency({ live_latency_style: "", live_latency_secs: "n/a" })).toBeUndefined();
    expect(readBuffer({})).toBe(0);
  });
});
