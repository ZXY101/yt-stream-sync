import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { AlignStatus, PlayerStatus, SyncStatus } from "../lib/messages.ts";
import { AlignPanel } from "./align-panel.tsx";

function archive(id: string, title: string, hasStartTime = true): PlayerStatus {
  return {
    id,
    tabId: Number(id.split(":")[0]),
    videoId: "M8nW5BZOD4I",
    kind: "archive",
    title,
    channel: "Channel",
    state: "playing",
    playbackRate: 1,
    position: 100,
    hasStartTime,
    inGroup: true,
    offset: 0,
  };
}

const PAIR = [archive("1:0", "Tsuzuri POV"), archive("2:0", "Kyoko POV")];

function status(align: AlignStatus, mixed = false): SyncStatus {
  return { players: PAIR, mixed, audio: { state: "off" }, align };
}

function renderPanel(align: AlignStatus, members = PAIR) {
  const onAlign = vi.fn<() => void>();
  const onCancel = vi.fn<() => void>();
  const view = render(
    <AlignPanel status={status(align)} members={members} onAlign={onAlign} onCancel={onCancel} />,
  );
  return { onAlign, onCancel, view };
}

describe("AlignPanel", () => {
  it.each<[string, AlignStatus, PlayerStatus[]]>([
    ["not set up", { state: "off" }, PAIR],
    ["one stream", { state: "ready" }, [archive("1:0", "Solo")]],
    [
      "a live stream",
      { state: "ready" },
      [archive("1:0", "A"), { ...archive("2:0", "B"), kind: "live" }],
    ],
  ])("stays hidden: %s", (_case, align, members) => {
    expect(renderPanel(align, members).view.container).toBeEmptyDOMElement();
  });

  it("starts an alignment", async () => {
    const user = userEvent.setup();
    const { onAlign } = renderPanel({ state: "ready" });
    await user.click(screen.getByRole("button", { name: "Align with yt-dlp-z" }));
    expect(onAlign).toHaveBeenCalledOnce();
  });

  it("shows the step, the time so far and each stream's stage, and can cancel", async () => {
    const user = userEvent.setup();
    const { onCancel } = renderPanel({
      state: "running",
      phase: "fetching",
      progress: 0.4,
      elapsed: 83,
      streams: [
        { id: "1:0", stage: "downloading", downloaded: 0.456 },
        { id: "2:0", stage: "converting", downloaded: 1 },
      ],
    });
    expect(screen.getByRole("progressbar", { name: "Alignment progress" })).toBeVisible();
    expect(screen.getByText("Step 1 of 2 · Getting the audio")).toBeVisible();
    expect(screen.getByLabelText("Time so far")).toHaveTextContent("1:23");
    const steps = screen.getByRole("list", { name: "Alignment steps per stream" });
    expect(steps).toHaveTextContent("Tsuzuri POVDownloading 46%");
    expect(steps).toHaveTextContent("Kyoko POVConverting…");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it.each([
    ["starting", "Asking yt-dlp-z…"],
    ["comparing", "Step 2 of 2 · Comparing"],
  ] as const)("names the %s step, even without per-stream details", (phase, text) => {
    renderPanel({ state: "running", phase, progress: 0.95, elapsed: 5, streams: [] });
    expect(screen.getByText(text)).toBeVisible();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("says when it's done, naming streams without a match", () => {
    renderPanel({ state: "done", unmatched: ["2:0"] });
    expect(screen.getByText("Aligned, except: Kyoko POV (no reliable match).")).toBeVisible();
    expect(screen.getByRole("button", { name: "Align again" })).toBeVisible();
  });

  it("says plainly when everything matched", () => {
    renderPanel({ state: "done", unmatched: [] });
    expect(screen.getByText("Aligned.")).toBeVisible();
  });

  it("shows the server's problem", () => {
    renderPanel({ state: "failed", message: "Can't reach yt-dlp-z at https://server.test." });
    expect(screen.getByText("Can't reach yt-dlp-z at https://server.test.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Align again" })).toBeVisible();
  });

  it("needs watch pages: embeds have no start time", () => {
    renderPanel({ state: "ready" }, [PAIR[0] as PlayerStatus, archive("2:0", "Embed", false)]);
    expect(screen.getByRole("button", { name: "Align with yt-dlp-z" })).toBeDisabled();
    expect(screen.getByText(/embeds have no start time/)).toBeVisible();
  });
});
