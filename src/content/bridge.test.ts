import { PAGE_TAG, type PlayerCommand, type PlayerReport } from "../lib/messages.ts";
import { createBridge, type BridgePort } from "./bridge.ts";

const report: PlayerReport = {
  latency: 4,
  bufferAhead: 3,
  state: "playing",
  playbackRate: 1,
  title: "Stream",
  channel: "Someone",
  videoId: "abc123",
};

function fakePort() {
  const messageListeners: ((message: unknown) => void)[] = [];
  const disconnectListeners: (() => void)[] = [];
  const port: BridgePort = {
    postMessage: vi.fn<BridgePort["postMessage"]>(),
    onMessage: { addListener: (listener) => messageListeners.push(listener) },
    onDisconnect: { addListener: (listener) => disconnectListeners.push(listener) },
  };
  return {
    port,
    receive: (message: unknown) => messageListeners.forEach((listener) => listener(message)),
    disconnect: () => disconnectListeners.forEach((listener) => listener()),
  };
}

function setup() {
  const ports: ReturnType<typeof fakePort>[] = [];
  const sendToPage = vi.fn<(command: PlayerCommand) => void>();
  const bridge = createBridge({
    connect: () => {
      const created = fakePort();
      ports.push(created);
      return created.port;
    },
    sendToPage,
  });
  return { bridge, ports, sendToPage };
}

describe("content bridge", () => {
  it("connects on the first live report and forwards reports", () => {
    const { bridge, ports } = setup();

    bridge.fromPage({ tag: PAGE_TAG, report });
    bridge.fromPage({ tag: PAGE_TAG, report: null });

    expect(ports).toHaveLength(1);
    expect(ports[0]?.port.postMessage).toHaveBeenNthCalledWith(1, { type: "report", report });
    expect(ports[0]?.port.postMessage).toHaveBeenNthCalledWith(2, { type: "report", report: null });
  });

  it("stays quiet for frames without a live player and for foreign messages", () => {
    const { bridge, ports } = setup();

    bridge.fromPage({ tag: PAGE_TAG, report: null });
    bridge.fromPage({ tag: "someone-else", report });
    bridge.fromPage({ tag: PAGE_TAG, report: { ...report, latency: -5 } });

    expect(ports).toHaveLength(0);
  });

  it("passes valid commands to the page and drops anything else", () => {
    const { bridge, ports, sendToPage } = setup();
    bridge.fromPage({ tag: PAGE_TAG, report });

    ports[0]?.receive({ type: "command", command: { type: "pause" } });
    ports[0]?.receive({ type: "command", command: { type: "setRate", rate: 3 } });
    ports[0]?.receive(null);

    expect(sendToPage.mock.calls).toEqual([[{ type: "pause" }]]);
  });

  it("reconnects after the background goes away", () => {
    const { bridge, ports } = setup();
    bridge.fromPage({ tag: PAGE_TAG, report });

    ports[0]?.disconnect();
    bridge.fromPage({ tag: PAGE_TAG, report });

    expect(ports).toHaveLength(2);
  });
});
