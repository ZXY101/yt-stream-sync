import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PlayerStatus, SyncStatus } from "../lib/messages.ts";
import { App } from "./app.tsx";

const { sendMessage, query } = vi.hoisted(() => ({
  sendMessage: vi.fn<(message: unknown) => Promise<unknown>>(),
  query: vi.fn<(info: unknown) => Promise<{ id?: number }[]>>(),
}));
vi.mock("../lib/browser.ts", () => ({ ext: { runtime: { sendMessage }, tabs: { query } } }));

const CURRENT_TAB = 7;

function player(overrides: Partial<PlayerStatus>): PlayerStatus {
  return {
    id: `${CURRENT_TAB}:0`,
    tabId: CURRENT_TAB,
    videoId: "M8nW5BZOD4I",
    kind: "live",
    title: "Collab stream",
    channel: "Someone",
    latency: 4.2,
    state: "playing",
    playbackRate: 1,
    inGroup: false,
    offset: 0,
    ...overrides,
  };
}

function answer(
  players: PlayerStatus[],
  mixed = false,
  audio: SyncStatus["audio"] = { state: "waiting" },
): SyncStatus {
  return { players, mixed, audio };
}

const pair = [
  player({ id: "1:0", tabId: 1, title: "Stream A", inGroup: true, error: 0 }),
  player({ id: "2:0", tabId: 2, title: "Stream B", inGroup: true, error: 0 }),
];

/** Answers like the background: keeps group membership and nudges between requests. */
function fakeBackground(initial: PlayerStatus[]) {
  let players = initial;
  sendMessage.mockImplementation(async (message) => {
    const request = message as { type: string; id?: string; inGroup?: boolean; seconds?: number };
    players = players.map((item) => {
      if (item.id !== request.id) {
        return item;
      }
      if (request.type === "setInGroup") {
        return { ...item, inGroup: request.inGroup ?? false, error: 0 };
      }
      return { ...item, offset: item.offset + (request.seconds ?? 0) };
    });
    return answer(players);
  });
}

function groupList() {
  return screen.getByRole("list", { name: "Streams in sync" });
}

describe("App", () => {
  beforeEach(() => {
    sendMessage.mockReset();
    query.mockReset().mockResolvedValue([{ id: CURRENT_TAB }]);
  });

  it("says when the tab has no stream and the group is empty", async () => {
    sendMessage.mockResolvedValue(answer([player({ id: "9:0", tabId: 9 })]));
    render(<App />);

    expect(await screen.findByText("No live stream or archive in this tab.")).toBeVisible();
    expect(screen.getByText(/Add the streams you want to keep in sync/)).toBeVisible();
    expect(screen.queryByText("Collab stream")).not.toBeInTheDocument();
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it("adds this tab's stream, then asks for the other one", async () => {
    const user = userEvent.setup();
    fakeBackground([player({ title: "Watame POV" })]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Add Watame POV to sync" }));

    expect(sendMessage).toHaveBeenCalledWith({
      type: "setInGroup",
      id: "7:0",
      inGroup: true,
    });
    expect(within(groupList()).getByText("Watame POV")).toBeVisible();
    expect(screen.getByText("This tab's stream is in the sync group.")).toBeVisible();
    expect(screen.getByText(/open the other stream's tab and add it too/)).toBeVisible();
  });

  it("lists the group with thumbnails and what the sync does to each", async () => {
    sendMessage.mockResolvedValue(
      answer([
        player({
          id: "1:0",
          tabId: 1,
          title: "Stream A",
          inGroup: true,
          playbackRate: 0.92,
          error: 1.25,
        }),
        player({ id: "2:0", tabId: 2, title: "", inGroup: true, latency: 6.5, error: 0 }),
        player({
          id: "3:0",
          tabId: 3,
          title: "Stream C",
          inGroup: true,
          state: "paused",
          error: 9,
        }),
        player({ id: "4:0", tabId: 4, title: "Stream D", inGroup: true, videoId: "bad id" }),
      ]),
    );
    const { container } = render(<App />);

    expect(await screen.findByText(/Slowed to 0\.92×, 1\.3 s ahead/)).toBeVisible();
    expect(screen.getByText("Untitled stream")).toBeVisible();
    expect(screen.getByText(/6\.5 s behind live · In sync/)).toBeVisible();
    expect(screen.getByText(/Paused, 9\.0 s ahead/)).toBeVisible();
    expect(screen.getByText(/Waiting/)).toBeVisible();
    expect(screen.getByText("Syncing")).toBeVisible();
    const thumbnails = [...container.querySelectorAll("img")].map((img) => img.src);
    expect(thumbnails).toHaveLength(3);
    expect(thumbnails[0]).toBe("https://i.ytimg.com/vi/M8nW5BZOD4I/mqdefault.jpg");
  });

  it("removes a stream from the group", async () => {
    const user = userEvent.setup();
    fakeBackground([player({ id: "1:0", tabId: 1, title: "Stream A", inGroup: true })]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Remove Stream A from sync" }));

    expect(sendMessage).toHaveBeenCalledWith({ type: "setInGroup", id: "1:0", inGroup: false });
    expect(screen.queryByRole("list", { name: "Streams in sync" })).not.toBeInTheDocument();
  });

  it("nudges a stream in the group and shows its nudge", async () => {
    const user = userEvent.setup();
    fakeBackground([player({ title: "Stream A", inGroup: true })]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Move Stream A back 1 second" }));
    await user.click(screen.getByRole("button", { name: "Move Stream A ahead 0.1 seconds" }));

    expect(sendMessage).toHaveBeenCalledWith({ type: "nudge", id: "7:0", seconds: -1 });
    expect(screen.getByText("Nudge −0.9 s")).toBeVisible();
  });

  it("shows archives by position and says when one is aligned by hand", async () => {
    sendMessage.mockResolvedValue(
      answer([
        player({
          id: "1:0",
          kind: "archive",
          title: "POV A",
          position: 4521.3,
          inGroup: true,
          error: 0,
        }),
        player({
          id: "2:0",
          kind: "archive",
          title: "POV B",
          position: 75,
          hasStartTime: true,
          inGroup: true,
          error: -0.8,
        }),
      ]),
    );
    render(<App />);

    expect(await screen.findByText(/Archive at 1:15:21 · In sync/)).toBeVisible();
    expect(screen.getByText(/Archive at 1:15 · Catching up, 0\.8 s behind/)).toBeVisible();
    expect(screen.getAllByText(/aligned as it was when added/)).toHaveLength(1);
  });

  it("says when all of a multiview tab's streams are in the group", async () => {
    sendMessage.mockResolvedValue(
      answer([player({ id: "7:1", inGroup: true }), player({ id: "7:2", inGroup: true })]),
    );
    render(<App />);

    expect(await screen.findByText("This tab's streams are in the sync group.")).toBeVisible();
  });

  it("warns that live streams and archives can't be synced together", async () => {
    sendMessage.mockResolvedValue(
      answer(
        [
          player({ id: "1:0", inGroup: true }),
          player({ id: "2:0", kind: "archive", position: 3, inGroup: true }),
        ],
        true,
      ),
    );
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/can't be synced together/);
    expect(screen.queryByText("Syncing")).not.toBeInTheDocument();
  });

  it("acts on the tab named in the address when opened as a page", async () => {
    window.history.replaceState(null, "", "?tab=3");
    sendMessage.mockResolvedValue(answer([player({ id: "3:0", tabId: 3, title: "Tab three" })]));
    render(<App />);

    expect(await screen.findByRole("button", { name: "Add Tab three to sync" })).toBeVisible();
    expect(query).not.toHaveBeenCalled();
    window.history.replaceState(null, "", "/");
  });

  it("refreshes every second and treats a missing answer as no streams", async () => {
    vi.useFakeTimers();
    sendMessage.mockResolvedValueOnce(answer([player({})])).mockResolvedValue(undefined);
    render(<App />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("Collab stream")).toBeVisible();

    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(screen.getByText("No live stream or archive in this tab.")).toBeVisible();
    vi.useRealTimers();
  });

  describe("audio panel", () => {
    it("only shows once two streams are in the group", async () => {
      sendMessage.mockResolvedValue(answer([player({ inGroup: true })]));
      render(<App />);

      await screen.findByText("Collab stream");
      expect(screen.queryByText("Auto-sync by audio")).not.toBeInTheDocument();
    });

    it("shows how long it still listens", async () => {
      sendMessage.mockResolvedValue(answer(pair, false, { state: "listening", progress: 0.4 }));
      render(<App />);

      expect(await screen.findByText("Listening to line up the audio…")).toBeVisible();
      expect(screen.getByRole("progressbar", { name: "Listening progress" })).toBeVisible();
      expect(screen.getByRole("switch", { name: "Auto-sync by audio" })).toBeChecked();
    });

    it("offers to match again once matched, and turns matching off", async () => {
      const user = userEvent.setup();
      sendMessage.mockResolvedValue(
        answer(pair, false, { state: "matched", lags: { "2:0": 0.4 } }),
      );
      render(<App />);

      await user.click(await screen.findByRole("button", { name: "Match again" }));
      await user.click(screen.getByRole("switch", { name: "Auto-sync by audio" }));

      expect(sendMessage).toHaveBeenCalledWith({ type: "rematchAudio" });
      expect(sendMessage).toHaveBeenCalledWith({ type: "setAudioSync", on: false });
    });

    it.each([
      [{ state: "failed", reason: "no-shared-sound" }, /may not share any sound/],
      [{ state: "failed", reason: "too-short" }, /Couldn't hear enough audio/],
      [{ state: "blocked" }, /Click once inside each stream's video/],
      [{ state: "unavailable" }, /can't be heard/],
      [{ state: "off" }, /Matching by audio is off/],
      [{ state: "matching" }, /Comparing the audio/],
    ] as [SyncStatus["audio"], RegExp][])("explains %j", async (audio, text) => {
      sendMessage.mockResolvedValue(answer(pair, false, audio));
      render(<App />);

      expect(await screen.findByText(text)).toBeVisible();
    });

    it("draws each stream's waveform on request", async () => {
      const user = userEvent.setup();
      const waveform = { end: 10_000, values: [0.1, 0.3, 0.05] };
      const withAudio = pair.map((item) => ({ ...item, waveform }));
      sendMessage.mockResolvedValue(answer(withAudio, false, { state: "matched", lags: {} }));
      render(<App />);
      expect(screen.queryAllByTestId("waveform")).toHaveLength(0);

      await user.click(await screen.findByRole("button", { name: "Show audio" }));

      expect(screen.getAllByTestId("waveform")).toHaveLength(2);
      expect(screen.getByRole("button", { name: "Hide audio" })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
    });

    it("says which stream can't be heard", async () => {
      const [first, second] = pair as [PlayerStatus, PlayerStatus];
      sendMessage.mockResolvedValue(
        answer(
          [
            { ...first, hearing: "unavailable" },
            { ...second, hearing: "blocked" },
          ],
          false,
          {
            state: "unavailable",
          },
        ),
      );
      render(<App />);

      expect(await screen.findByText(/Can't hear this stream yet/)).toBeVisible();
      expect(screen.getByText(/Click once inside this stream's video/)).toBeVisible();
    });
  });
});
