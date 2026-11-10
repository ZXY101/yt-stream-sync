import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { PlayerStatus, SyncStatus } from "../lib/messages.ts";
import { App } from "./app.tsx";

const { sendMessage } = vi.hoisted(() => ({
  sendMessage: vi.fn<(message: unknown) => Promise<unknown>>(),
}));
vi.mock("../lib/browser.ts", () => ({ ext: { runtime: { sendMessage } } }));

function player(overrides: Partial<PlayerStatus>): PlayerStatus {
  return {
    id: "1:0",
    kind: "live",
    title: "Collab stream",
    channel: "Someone",
    latency: 4.2,
    state: "playing",
    playbackRate: 1,
    inGroup: true,
    offset: 0,
    error: 0,
    ...overrides,
  };
}

function answer(players: PlayerStatus[], mixed = false): SyncStatus {
  return { players, mixed };
}

describe("App", () => {
  beforeEach(() => {
    sendMessage.mockReset();
  });

  it("explains what to do when no streams are open", async () => {
    sendMessage.mockResolvedValue(answer([]));
    render(<App />);

    expect(await screen.findByText(/No streams open/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "yt-stream-sync" })).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledWith({ type: "getStatus" });
  });

  it("lists live streams and what the sync does to each", async () => {
    sendMessage.mockResolvedValue(
      answer([
        player({ id: "1:0", title: "Stream A", playbackRate: 0.92, error: 1.25 }),
        player({ id: "2:0", title: "", channel: "B", latency: 6.5 }),
        player({ id: "3:0", title: "Stream C", state: "paused", error: 9 }),
        player({ id: "4:0", title: "Stream D", error: undefined }),
        player({ id: "5:0", title: "Stream E", inGroup: false, error: undefined }),
      ]),
    );
    render(<App />);

    const list = await screen.findByRole("list", { name: "Streams" });
    expect(list.children).toHaveLength(5);
    expect(screen.getByText(/Slowed to 0\.92×, 1\.3 s ahead/)).toBeInTheDocument();
    expect(screen.getByText("Untitled stream")).toBeInTheDocument();
    expect(screen.getByText(/6\.5 s behind live · In sync/)).toBeInTheDocument();
    expect(screen.getByText(/Paused, 9\.0 s ahead/)).toBeInTheDocument();
    expect(screen.getByText(/Waiting/)).toBeInTheDocument();
    expect(screen.getByText(/Not synced/)).toBeInTheDocument();
    expect(screen.queryByText(/Tick two or more/)).not.toBeInTheDocument();
  });

  it("shows archives by position and says when one is aligned by hand", async () => {
    sendMessage.mockResolvedValue(
      answer([
        player({ id: "1:0", kind: "archive", title: "POV A", position: 4521.3, error: 0 }),
        player({
          id: "2:0",
          kind: "archive",
          title: "POV B",
          position: 75,
          hasStartTime: true,
          error: -0.8,
        }),
      ]),
    );
    render(<App />);

    expect(await screen.findByText(/Archive at 1:15:21 · In sync/)).toBeInTheDocument();
    expect(screen.getByText(/Archive at 1:15 · Catching up, 0\.8 s behind/)).toBeInTheDocument();
    expect(screen.getAllByText(/aligned as it was when ticked/)).toHaveLength(1);
  });

  it("opts a stream in when its box is ticked", async () => {
    const user = userEvent.setup();
    const streamA = player({ id: "1:0", title: "Stream A", inGroup: false });
    sendMessage.mockImplementation(async (message) => {
      const request = message as { inGroup?: boolean };
      return answer([{ ...streamA, inGroup: request.inGroup ?? streamA.inGroup }]);
    });
    render(<App />);
    const box = await screen.findByRole("checkbox", { name: /Stream A/ });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/Tick two or more streams/)).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: /Nudge/ })).not.toBeInTheDocument();

    await user.click(box);

    expect(sendMessage).toHaveBeenCalledWith({ type: "setInGroup", id: "1:0", inGroup: true });
    expect(box).toBeChecked();
  });

  it("nudges a ticked stream and shows its nudge", async () => {
    const user = userEvent.setup();
    let offset = 0;
    sendMessage.mockImplementation(async (message) => {
      const request = message as { type: string; seconds?: number };
      offset += request.type === "nudge" ? (request.seconds ?? 0) : 0;
      return answer([player({ title: "Stream A", offset })]);
    });
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Move Stream A back 1 second" }));
    await user.click(screen.getByRole("button", { name: "Move Stream A ahead 0.1 seconds" }));

    expect(sendMessage).toHaveBeenCalledWith({ type: "nudge", id: "1:0", seconds: -1 });
    expect(screen.getByText("Nudge −0.9 s")).toBeInTheDocument();
  });

  it("warns that live streams and archives can't be synced together", async () => {
    sendMessage.mockResolvedValue(
      answer([player({ id: "1:0" }), player({ id: "2:0", kind: "archive", position: 3 })], true),
    );
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/can't be synced together/);
  });

  it("refreshes every second and treats a missing answer as no streams", async () => {
    vi.useFakeTimers();
    sendMessage.mockResolvedValueOnce(answer([player({})])).mockResolvedValue(undefined);
    render(<App />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("Collab stream")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(screen.getByText(/No streams open/)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
