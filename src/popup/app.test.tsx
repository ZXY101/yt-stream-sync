import { act, render, screen } from "@testing-library/react";

import type { PlayerStatus } from "../lib/messages.ts";
import { App } from "./app.tsx";

const { sendMessage } = vi.hoisted(() => ({
  sendMessage: vi.fn<(message: unknown) => Promise<unknown>>(),
}));
vi.mock("../lib/browser.ts", () => ({ ext: { runtime: { sendMessage } } }));

function player(overrides: Partial<PlayerStatus>): PlayerStatus {
  return {
    id: "1:0",
    title: "Collab stream",
    channel: "Someone",
    latency: 4.2,
    state: "playing",
    playbackRate: 1,
    error: 0,
    ...overrides,
  };
}

describe("App", () => {
  beforeEach(() => sendMessage.mockReset());

  it("shows the empty state when no players are in the group", async () => {
    sendMessage.mockResolvedValue([]);
    render(<App />);

    expect(await screen.findByText(/No players in the sync group yet/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "yt-stream-sync" })).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledWith({ type: "getStatus" });
  });

  it("lists the players and what the sync does to each", async () => {
    sendMessage.mockResolvedValue([
      player({ id: "1:0", title: "Stream A", playbackRate: 0.92, error: 1.25 }),
      player({ id: "2:0", title: "", channel: "B", latency: 6.5 }),
      player({ id: "3:0", title: "Stream C", state: "paused", error: 9 }),
      player({ id: "4:0", title: "Stream D", error: undefined }),
    ]);
    render(<App />);

    const list = await screen.findByRole("list", { name: "Players in the sync group" });
    expect(list.children).toHaveLength(4);
    expect(screen.getByText(/Slowed to 0\.92×, 1\.3 s ahead/)).toBeInTheDocument();
    expect(screen.getByText("Untitled stream")).toBeInTheDocument();
    expect(screen.getByText(/6\.5 s behind live · In sync/)).toBeInTheDocument();
    expect(screen.getByText(/Paused, 9\.0 s ahead/)).toBeInTheDocument();
    expect(screen.getByText(/Not synced/)).toBeInTheDocument();
  });

  it("refreshes every second and treats a missing answer as an empty group", async () => {
    vi.useFakeTimers();
    sendMessage.mockResolvedValueOnce([player({})]).mockResolvedValue(undefined);
    render(<App />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(screen.getByText("Collab stream")).toBeInTheDocument();

    await act(() => vi.advanceTimersByTimeAsync(1000));

    expect(screen.getByText(/No players in the sync group yet/)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
