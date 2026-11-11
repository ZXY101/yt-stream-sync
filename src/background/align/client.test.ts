import { describe, expect, it, vi } from "vitest";

import { AlignError, createAlignClient } from "./client.ts";

const SETTINGS = { enabled: true, address: "https://server.test", token: "fake-token" };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function clientAnswering(...responses: Response[]) {
  const fetcher = vi.fn<typeof fetch>();
  for (const response of responses) {
    fetcher.mockResolvedValueOnce(response);
  }
  return { fetcher, client: createAlignClient(SETTINGS, fetcher) };
}

const DONE = {
  state: "done",
  progress: 1,
  offsets: { a: 0, b: 31.17 },
  error: null,
  streams: [{ url: "a", stage: "ready", downloaded: 1 }],
};

describe("createAlignClient", () => {
  it("starts an alignment with the token and the links", async () => {
    const { fetcher, client } = clientAnswering(json({ id: "job-1" }, 202));
    await expect(client.start(["a", "b"])).resolves.toBe("job-1");
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://server.test/api/align");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ urls: ["a", "b"] }));
    expect(init.headers).toMatchObject({ Authorization: "Bearer fake-token" });
  });

  it("checks an alignment and validates the answer", async () => {
    const { fetcher, client } = clientAnswering(json(DONE));
    await expect(client.check("job/1")).resolves.toEqual(DONE);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://server.test/api/align/job%2F1");
  });

  it("reads answers from servers without per-link stages", async () => {
    const { streams: _streams, ...older } = DONE;
    const { client } = clientAnswering(json(older));
    await expect(client.check("job-1")).resolves.toEqual({ ...older, streams: [] });
  });

  it.each([
    [{ ...DONE, state: "weird" }],
    [{ ...DONE, progress: 2 }],
    [{ ...DONE, offsets: { a: "far" } }],
    [{ ...DONE, offsets: { a: 1e9 } }],
    [{ ...DONE, error: 5 }],
    [{ ...DONE, streams: [{ url: "a", stage: "flying", downloaded: 1 }] }],
    [{ ...DONE, streams: "all" }],
    ["not an object"],
  ])("rejects answers it doesn't understand (%j)", async (body) => {
    const { client } = clientAnswering(json(body));
    await expect(client.check("job-1")).rejects.toThrow("doesn't understand");
  });

  it.each([
    [401, "didn't accept the API token"],
    [403, "can only send links"],
    [404, "can't align recordings yet"],
    [500, "error (500)"],
  ])("explains a %i when starting", async (status, text) => {
    const { client } = clientAnswering(json({ detail: ["not", "text"] }, status));
    await expect(client.start(["a", "b"])).rejects.toThrow(text);
  });

  it("passes the server's own explanation on", async () => {
    const detail = "Another alignment is running. Try again when it's done.";
    const { client } = clientAnswering(json({ detail }, 409));
    await expect(client.start(["a", "b"])).rejects.toThrow(detail);
  });

  it("says when the server lost the job", async () => {
    const { client } = clientAnswering(json({ detail: "gone" }, 404));
    await expect(client.check("job-1")).rejects.toThrow("no longer has this alignment");
  });

  it("explains an unreachable server and a bad start answer", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("offline"));
    const client = createAlignClient(SETTINGS, fetcher);
    await expect(client.start(["a", "b"])).rejects.toThrow(AlignError);
    const odd = clientAnswering(json({ id: 5 }, 202));
    await expect(odd.client.start(["a", "b"])).rejects.toThrow("doesn't understand");
  });

  it("deletes, and doesn't mind failures", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError("offline"));
    const client = createAlignClient(SETTINGS, fetcher);
    await expect(client.remove("job-1")).resolves.toBeUndefined();
    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.method).toBe("DELETE");
  });
});
