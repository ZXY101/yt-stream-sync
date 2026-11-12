// YouTube video ids are 11 characters from this set.
const VIDEO_ID = /^[\w-]{11}$/;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);

export function isVideoId(value: string): boolean {
  return VIDEO_ID.test(value);
}

/** The id in a YouTube link's path or query, if it's a link to a video. */
function idInUrl(url: URL): string | undefined {
  if (url.hostname === "youtu.be") {
    return url.pathname.split("/")[1];
  }
  if (!HOSTS.has(url.hostname)) {
    return undefined;
  }
  const [, kind, rest] = url.pathname.split("/");
  if (kind === "watch") {
    return url.searchParams.get("v") ?? undefined;
  }
  return kind === "live" || kind === "shorts" || kind === "embed" ? rest : undefined;
}

/**
 * The video id in what the user pasted: a bare id, a watch link, a youtu.be link, or a
 * /live/, /shorts/ or /embed/ link. Undefined if there's none.
 */
export function parseVideoId(text: string): string | undefined {
  const trimmed = text.trim();
  if (isVideoId(trimmed)) {
    return trimmed;
  }
  const url = URL.parse(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
  const id = url ? idInUrl(url) : undefined;
  return id !== undefined && isVideoId(id) ? id : undefined;
}
