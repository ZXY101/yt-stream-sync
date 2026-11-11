// Checks that an address and token reach a yt-dlp-z that can align recordings, before they're
// saved. It asks for an alignment that can't exist: yt-dlp-z answers "No such alignment" only
// when the token works and the align API is there.
const PROBE_PATH = "/api/align/connection-test";
const NOT_FOUND_HINT = "No such alignment";
const TIMEOUT_MS = 10_000;

async function detailOf(response: Response): Promise<string> {
  const body = (await response.json().catch(() => undefined)) as { detail?: unknown } | undefined;
  return typeof body?.detail === "string" ? body.detail : "";
}

/** Undefined when it works; otherwise what's wrong, in words for the user. */
export async function testConnection(
  address: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<string | undefined> {
  let response: Response;
  try {
    response = await fetcher(`${address}${PROBE_PATH}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return `Can't reach ${address}. Check the address, and that this computer can reach it.`;
  }
  if (response.status === 401) {
    return "yt-dlp-z didn't accept this API token.";
  }
  if (response.status === 403) {
    return "This token can only send links. Make a full-access token in yt-dlp-z.";
  }
  if (response.status === 404 && (await detailOf(response)).startsWith(NOT_FOUND_HINT)) {
    return undefined;
  }
  if (response.status === 404) {
    return "This server can't align recordings. Update yt-dlp-z, or check the address.";
  }
  return "That address doesn't answer like yt-dlp-z.";
}
