import { describe, expect, it, vi } from "vitest";

import { testConnection } from "./connection-test.ts";

function answering(status: number, body: unknown = {}) {
  return vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

const NOT_FOUND = { detail: "No such alignment (finished ones are dropped after an hour)" };

describe("testConnection", () => {
  it("works when the server knows the align API and accepts the token", async () => {
    const fetcher = answering(404, NOT_FOUND);
    await expect(testConnection("https://server.test", "fake", fetcher)).resolves.toBeUndefined();
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://server.test/api/align/connection-test");
    expect(init.headers).toEqual({ Authorization: "Bearer fake" });
  });

  it.each([
    [401, {}, "didn't accept this API token"],
    [403, {}, "can only send links"],
    [404, { detail: "Not Found" }, "can't align recordings"],
    [200, {}, "doesn't answer like yt-dlp-z"],
  ])("explains a %i", async (status, body, text) => {
    const result = await testConnection("https://server.test", "fake", answering(status, body));
    expect(result).toContain(text);
  });

  it("explains an unreachable server", async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
    expect(await testConnection("https://server.test", "fake", fetcher)).toContain(
      "Can't reach https://server.test",
    );
  });
});
