import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const FAKE_TOKEN = "fake-e2e-token";

export interface FakeYtdlpz {
  address: string;
  /** Links of every alignment started. */
  started: string[][];
  /** Ids of alignments deleted. */
  deleted: string[];
  close: () => Promise<void>;
}

/**
 * Per link, how many seconds its content is later than some common point. The fake reports
 * each link's offset relative to the first link it was sent, like yt-dlp-z.
 */
export type FakeOffsets = Record<string, number | null>;

function send(response: ServerResponse, status: number, body?: unknown) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(body === undefined ? undefined : JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<{ urls?: string[] }> {
  let text = "";
  for await (const chunk of request) {
    text += String(chunk);
  }
  return JSON.parse(text || "{}") as { urls?: string[] };
}

interface FakeState {
  offsets: FakeOffsets;
  /** Links of every alignment started. */
  started: string[][];
  deleted: string[];
  /** Job id → how often it was checked. */
  checks: Map<string, number>;
}

async function start(state: FakeState, request: IncomingMessage, response: ServerResponse) {
  state.started.push((await readBody(request)).urls ?? []);
  const id = `job-${state.started.length}`;
  state.checks.set(id, 0);
  send(response, 202, { id });
}

function relativeOffsets(shifts: FakeOffsets, urls: string[]): FakeOffsets {
  const first = shifts[urls[0] ?? ""] ?? 0;
  return Object.fromEntries(
    urls.map((url) => {
      const shift = shifts[url];
      return [url, typeof shift === "number" ? shift - first : null];
    }),
  );
}

function check(state: FakeState, id: string, response: ServerResponse) {
  const count = (state.checks.get(id) ?? 0) + 1;
  state.checks.set(id, count);
  const urls = state.started[Number(id.replace("job-", "")) - 1] ?? [];
  if (count === 1) {
    const streams = urls.map((url) => ({ url, stage: "downloading", downloaded: 0.5 }));
    send(response, 200, {
      state: "downloading",
      progress: 0.45,
      offsets: {},
      error: null,
      streams,
    });
    return;
  }
  const streams = urls.map((url) => ({ url, stage: "ready", downloaded: 1 }));
  const offsets = relativeOffsets(state.offsets, urls);
  send(response, 200, { state: "done", progress: 1, offsets, error: null, streams });
}

function remove(state: FakeState, id: string, response: ServerResponse) {
  state.deleted.push(id);
  state.checks.delete(id);
  send(response, 204);
}

async function handle(state: FakeState, request: IncomingMessage, response: ServerResponse) {
  if (request.headers.authorization !== `Bearer ${FAKE_TOKEN}`) {
    send(response, 401, { detail: "Not authenticated" });
    return;
  }
  if (request.method === "POST" && request.url === "/api/align") {
    await start(state, request, response);
    return;
  }
  const id = request.url?.match(/^\/api\/align\/([\w-]+)$/)?.[1] ?? "";
  if (!state.checks.has(id)) {
    send(response, 404, { detail: "No such alignment" });
  } else if (request.method === "DELETE") {
    remove(state, id, response);
  } else {
    check(state, id, response);
  }
}

/**
 * A stand-in for yt-dlp-z's align API on localhost: checks the token, says "downloading"
 * once, then "done" with `offsets`.
 */
export async function startFakeYtdlpz(offsets: FakeOffsets): Promise<FakeYtdlpz> {
  const state: FakeState = { offsets, started: [], deleted: [], checks: new Map() };
  const server = createServer((request, response) => void handle(state, request, response));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    address: `http://127.0.0.1:${port}`,
    started: state.started,
    deleted: state.deleted,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
