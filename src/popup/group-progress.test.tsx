import { render, screen } from "@testing-library/react";

import type { PlayerStatus } from "../lib/messages.ts";
import { GroupProgress } from "./group-progress.tsx";

function member(overrides: Partial<PlayerStatus> = {}): PlayerStatus {
  return {
    id: "1:0",
    tabId: 1,
    kind: "live",
    state: "playing",
    playbackRate: 1,
    title: "Stream",
    channel: "Channel",
    videoId: "aaaaaaaaaaa",
    latency: 5,
    inGroup: true,
    offset: 0,
    error: 0,
    ...overrides,
  } as PlayerStatus;
}

describe("GroupProgress", () => {
  it("says nothing with fewer than two streams", () => {
    const { container } = render(<GroupProgress members={[member()]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("says the sync is starting before every stream is measured", () => {
    render(<GroupProgress members={[member(), member({ id: "2:0", error: undefined })]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Starting the sync…");
  });

  it("shows how far apart the streams still are while lining them up", () => {
    const members = [member({ error: 2.4, playbackRate: 0.92 }), member({ id: "2:0", error: 0 })];
    render(<GroupProgress members={members} />);
    expect(screen.getByRole("status")).toHaveTextContent("Lining the streams up, 2.4 s apart");
  });

  it("says the streams are in sync once they meet", () => {
    render(<GroupProgress members={[member({ error: 0.4 }), member({ id: "2:0", error: 0 })]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Streams in sync");
  });

  it("keeps lining up while a stream is still slowed, even when they look close", () => {
    const members = [member({ error: 0.2, playbackRate: 0.92 }), member({ id: "2:0", error: 0 })];
    render(<GroupProgress members={members} />);
    expect(screen.getByRole("status")).toHaveTextContent("Lining the streams up, 0.2 s apart");
  });

  it("holds archives to a tighter gap", () => {
    const archives = [
      member({ kind: "archive", error: 0.5 }),
      member({ id: "2:0", kind: "archive", error: 0 }),
    ];
    render(<GroupProgress members={archives} />);
    expect(screen.getByRole("status")).toHaveTextContent("Lining the streams up, 0.5 s apart");
  });

  it("leaves a gap a low-latency stream keeps open to the low-latency note", () => {
    const members = [
      member({ pinned: true, stuck: true, error: 2 }),
      member({ id: "2:0", error: 0 }),
    ];
    const { container } = render(<GroupProgress members={members} />);
    expect(container).toBeEmptyDOMElement();
  });
});
