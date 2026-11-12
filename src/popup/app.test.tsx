import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PlayerStatus, SyncStatus } from "../lib/messages.ts";
import { App } from "./app.tsx";

const { sendMessage, query, create } = vi.hoisted(() => ({
  sendMessage: vi.fn<(message: unknown) => Promise<unknown>>(),
  query: vi.fn<(info: unknown) => Promise<{ id?: number }[]>>(),
  create: vi.fn<(info: unknown) => Promise<unknown>>(),
}));
vi.mock("../lib/browser.ts", () => ({
  ext: {
    runtime: { sendMessage, getURL: (path: string) => `moz-extension://id/${path}` },
    tabs: { query, create },
  },
}));

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

const NO_SAVED: SyncStatus["saved"] = {
  groups: [],
  canSave: false,
  opening: 0,
  addable: 0,
  inSync: 0,
};

function answer(
  players: PlayerStatus[],
  mixed = false,
  audio: SyncStatus["audio"] = { state: "waiting" },
  align: SyncStatus["align"] = { state: "off" },
): SyncStatus {
  return { players, mixed, audio, align, saved: NO_SAVED };
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

  it("opens the settings page on its settings tab", async () => {
    const user = userEvent.setup();
    sendMessage.mockResolvedValue(answer([]));
    create.mockResolvedValue({});
    const close = vi.spyOn(window, "close").mockImplementation(() => undefined);
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Settings" }));
    expect(create).toHaveBeenCalledWith({ url: "moz-extension://id/options/index.html#settings" });
    expect(close).toHaveBeenCalled();
  });

  it("offers yt-dlp-z alignment for archives once it's set up", async () => {
    const user = userEvent.setup();
    const archives = [
      player({
        id: "1:0",
        tabId: 1,
        title: "A",
        kind: "archive",
        hasStartTime: true,
        inGroup: true,
      }),
      player({
        id: "2:0",
        tabId: 2,
        title: "B",
        kind: "archive",
        hasStartTime: true,
        inGroup: true,
      }),
    ];
    sendMessage.mockResolvedValue(answer(archives, false, { state: "off" }, { state: "ready" }));
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Align with yt-dlp-z" }));
    expect(sendMessage).toHaveBeenCalledWith({ type: "alignArchives" });
  });

  it("only offers Add to saved group while the saved group is playing", async () => {
    const archive = player({ title: "Third POV", kind: "archive", hasStartTime: true });
    const group = { id: "g1", name: "Collab", updatedAt: 0, position: 0, streams: [] };
    const saved = { ...NO_SAVED, groups: [group], activeId: "g1", inSync: 1 };
    sendMessage.mockResolvedValue({ ...answer([archive]), saved });
    render(<App />);
    expect(await screen.findByRole("button", { name: "Add Third POV to sync" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /to the saved group$/ })).not.toBeInTheDocument();
  });

  it("adds this tab's archive to the playing saved group in one click; a live stream just to sync", async () => {
    const user = userEvent.setup();
    const archive = player({ title: "Third POV", kind: "archive", hasStartTime: true });
    const live = player({ id: "7:1", title: "Live POV" });
    const group = { id: "g1", name: "Collab", updatedAt: 0, position: 0, streams: [] };
    const saved = { ...NO_SAVED, groups: [group], activeId: "g1", inSync: 2 };
    sendMessage.mockResolvedValue({ ...answer([archive, live, ...pair]), saved });
    render(<App />);

    expect(await screen.findByRole("button", { name: "Add Live POV to sync" })).toBeVisible();
    expect(screen.getByText(/Add also saves it to/)).toHaveTextContent(
      "Add also saves it to Collab.",
    );
    await user.click(screen.getByRole("button", { name: "Add Third POV to the saved group" }));
    expect(sendMessage).toHaveBeenCalledWith({ type: "setInGroup", id: "7:0", inGroup: true });
    expect(sendMessage).toHaveBeenLastCalledWith({ type: "addToSavedGroup", groupId: "g1" });
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

    const field = screen.getByRole("textbox", { name: "Offset of Stream A (seconds or m:ss)" });
    expect(field).toHaveValue("-0.9");
    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: "nudge", id: "7:0", seconds: -0.9 });
    });
    // Quick clicks go out as one nudge, so the archive sync seeks once.
    expect(sendMessage).not.toHaveBeenCalledWith({ type: "nudge", id: "7:0", seconds: -1 });
    expect(field).toHaveValue("-0.9");
  });

  it("sets a big offset typed as m:ss in one nudge", async () => {
    const user = userEvent.setup();
    fakeBackground([player({ title: "Stream A", inGroup: true })]);
    render(<App />);

    const field = await screen.findByRole("textbox", { name: /Offset of Stream A/ });
    await user.clear(field);
    await user.type(field, "-2:05.3{Enter}");

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({ type: "nudge", id: "7:0", seconds: -125.3 });
    });
    expect(field).toHaveValue("-2:05.3");
  });

  it("ignores an offset it can't read", async () => {
    const user = userEvent.setup();
    fakeBackground([player({ title: "Stream A", inGroup: true })]);
    render(<App />);

    const field = await screen.findByRole("textbox", { name: /Offset of Stream A/ });
    await user.clear(field);
    await user.type(field, "soon{Enter}");

    expect(field).toHaveValue("+0.0");
    await user.type(field, "5{Escape}");
    expect(field).toHaveValue("+0.0");
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

    it("shows each stream's waveform by default and hides them on request", async () => {
      const user = userEvent.setup();
      const waveform = { end: 10_000, values: [0.1, 0.3, 0.05] };
      const withAudio = pair.map((item) => ({ ...item, waveform }));
      sendMessage.mockResolvedValue(answer(withAudio, false, { state: "matched", lags: {} }));
      render(<App />);
      expect(await screen.findAllByTestId("waveform")).toHaveLength(2);

      await user.click(screen.getByRole("button", { name: "Hide audio" }));

      expect(screen.queryAllByTestId("waveform")).toHaveLength(0);
      expect(screen.getByRole("button", { name: "Show audio" })).toHaveAttribute(
        "aria-pressed",
        "false",
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

    it("hides waveforms and their button while matching by audio is off", async () => {
      const waveform = { end: 10_000, values: [0.1] };
      const withAudio = pair.map((item) => ({ ...item, waveform }));
      sendMessage.mockResolvedValue(answer(withAudio, false, { state: "off" }));
      render(<App />);

      await screen.findByText(/Matching by audio is off/);
      expect(screen.queryAllByTestId("waveform")).toHaveLength(0);
      expect(screen.queryByRole("button", { name: /audio$/ })).not.toBeInTheDocument();
    });
  });

  it("clears the whole group", async () => {
    const user = userEvent.setup();
    sendMessage.mockResolvedValue(answer(pair));
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Clear" }));

    expect(sendMessage).toHaveBeenCalledWith({ type: "clearGroup" });
  });

  it("copies the debug log", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    sendMessage.mockImplementation(async (message) =>
      (message as { type: string }).type === "getDebugLog" ? { log: "the log" } : answer([]),
    );
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Copy debug log" }));

    expect(writeText).toHaveBeenCalledWith("the log");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeVisible();
  });
  it("marks low-latency streams and explains a gap the sync can't close", async () => {
    sendMessage.mockResolvedValue(
      answer([
        player({ id: "1:0", channel: "Gigi", inGroup: true, pinned: true, stuck: true, error: 5 }),
        player({ id: "2:0", tabId: 2, channel: "Kyoko", inGroup: true, error: -2 }),
        player({ id: "3:0", tabId: 3, channel: "Mumei", inGroup: true, error: 0.2 }),
        player({ id: "7:0", tabId: 7, title: "Next one", pinned: true }),
      ]),
    );
    render(<App />);

    expect(await screen.findByText(/behind live · 5\.0 s ahead/)).toBeVisible();
    expect(screen.getByText(/Jumping ahead, 2\.0 s behind/)).toBeVisible();
    expect(screen.getByText(/Can't get closer/)).toBeVisible();
    const badges = screen.getAllByText("Low latency");
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveAttribute("title", expect.stringMatching(/can't be slowed/));
    expect(screen.getByText(/Still 5\.0 s apart: the Gigi stream is ultra-low/)).toBeVisible();
    expect(screen.getByText(/The others have jumped as far ahead/)).toBeVisible();
  });

  it("names every low-latency stream in the gap note", async () => {
    sendMessage.mockResolvedValue(
      answer([
        player({ id: "1:0", channel: "A", inGroup: true, pinned: true, stuck: true, error: 2 }),
        player({ id: "2:0", channel: "B", inGroup: true, pinned: true, stuck: true, error: 3 }),
        player({ id: "3:0", channel: "C", inGroup: true, pinned: true, error: 0 }),
      ]),
    );
    render(<App />);

    expect(await screen.findByText(/the A and B streams are ultra-low latency/)).toBeVisible();
    expect(screen.queryByText(/The others have jumped/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/In sync/)).toHaveLength(1);
  });

  it("says in sync and shows no note once a low-latency stream is caught up", async () => {
    sendMessage.mockResolvedValue(
      answer([
        player({ id: "1:0", tabId: 1, inGroup: true, pinned: true, error: 0.2 }),
        player({ id: "2:0", tabId: 2, inGroup: true, error: 0 }),
      ]),
    );
    render(<App />);

    expect(await screen.findAllByText(/In sync/)).toHaveLength(2);
    expect(screen.queryByText(/apart/)).not.toBeInTheDocument();
  });

  it("says when a low-latency stream is being held back, without the gap note", async () => {
    sendMessage.mockResolvedValue(
      answer([
        player({ id: "1:0", tabId: 1, inGroup: true, pinned: true, error: 1.2 }),
        player({ id: "2:0", tabId: 2, inGroup: true, pinned: true, error: 0 }),
      ]),
    );
    render(<App />);

    expect(await screen.findByText(/Holding back, 1\.2 s ahead/)).toBeVisible();
    expect(screen.queryByText(/apart/)).not.toBeInTheDocument();
  });
});
