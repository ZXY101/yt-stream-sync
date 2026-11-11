import type { YtdlpzSettings } from "../../lib/ytdlpz.ts";

/** One link's part of an alignment, as yt-dlp-z reports it. */
export interface AlignJobStream {
  url: string;
  stage: "downloading" | "converting" | "ready";
  downloaded: number;
}

/** What yt-dlp-z reports for an alignment (`GET /api/align/{id}`), checked. */
export interface AlignJobStatus {
  state: "downloading" | "analysing" | "done" | "failed";
  /** 0–1 over the whole job. */
  progress: number;
  /** Each link's stage; empty from servers that don't report it. */
  streams: AlignJobStream[];
  /** Per link: seconds its content is later than the first link's; null when not found. */
  offsets: Record<string, number | null>;
  error: string | null;
}

/** A problem worth showing the user as it is. */
export class AlignError extends Error {}

const STATES: ReadonlySet<unknown> = new Set(["downloading", "analysing", "done", "failed"]);
const STAGES: ReadonlySet<unknown> = new Set(["downloading", "converting", "ready"]);
const MAX_STREAMS = 10;
// Two recordings of one event can't be more than a day apart.
const MAX_OFFSET = 86_400;
const MAX_TEXT = 500;
const TIMEOUT_MS = 15_000;

type Fetch = typeof fetch;

function isOffset(value: unknown): boolean {
  return value === null || (Number.isFinite(value) && Math.abs(value as number) <= MAX_OFFSET);
}

function isOffsets(value: unknown): boolean {
  return typeof value === "object" && value !== null && Object.values(value).every(isOffset);
}

function isProgress(value: unknown): boolean {
  return typeof value === "number" && value >= 0 && value <= 1;
}

function isError(value: unknown): boolean {
  return value === null || (typeof value === "string" && value.length <= MAX_TEXT);
}

function isStream(value: unknown): value is AlignJobStream {
  const { url, stage, downloaded } = (value ?? {}) as Record<string, unknown>;
  const urlOk = typeof url === "string" && url.length <= MAX_TEXT;
  return urlOk && STAGES.has(stage) && isProgress(downloaded);
}

/** Older servers don't send streams: that reads as none. */
function readStreams(value: unknown): AlignJobStream[] | undefined {
  if (value === undefined) {
    return [];
  }
  const valid = Array.isArray(value) && value.length <= MAX_STREAMS && value.every(isStream);
  return valid
    ? value.map(({ url, stage, downloaded }) => ({ url, stage, downloaded }))
    : undefined;
}

function readStatus(value: unknown): AlignJobStatus | undefined {
  const { state, progress, offsets, error, streams } = (value ?? {}) as Record<string, unknown>;
  const valid = STATES.has(state) && isProgress(progress) && isOffsets(offsets) && isError(error);
  const checkedStreams = readStreams(streams);
  if (!valid || !checkedStreams) {
    return undefined;
  }
  return { state, progress, offsets, error, streams: checkedStreams } as AlignJobStatus;
}

/** The server's own explanation (FastAPI's `detail`), if it gave a short one. */
async function detailOf(response: Response): Promise<string | undefined> {
  const body = (await response.json().catch(() => undefined)) as { detail?: unknown } | undefined;
  const detail = body?.detail;
  return typeof detail === "string" && detail.length <= MAX_TEXT ? detail : undefined;
}

const STATUS_HELP: Record<number, string> = {
  401: "yt-dlp-z didn't accept the API token. Check it in the add-on's settings.",
  403: "This API token can only send links. Make a full-access token in yt-dlp-z.",
  404: "This yt-dlp-z can't align recordings yet. Update it.",
};

async function problem(response: Response): Promise<AlignError> {
  const help = STATUS_HELP[response.status];
  if (help) {
    return new AlignError(help);
  }
  const detail = await detailOf(response);
  return new AlignError(detail ?? `yt-dlp-z answered with an error (${response.status}).`);
}

/** Talks to the user's yt-dlp-z: start, check and delete alignments. */
export function createAlignClient(settings: YtdlpzSettings, fetcher: Fetch = fetch) {
  async function call(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = { Authorization: `Bearer ${settings.token}`, ...init.headers };
    try {
      return await fetcher(`${settings.address}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AlignError(`Can't reach yt-dlp-z at ${settings.address}.`);
    }
  }

  async function start(urls: string[]): Promise<string> {
    const response = await call("/api/align", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
    if (!response.ok) {
      throw await problem(response);
    }
    const { id } = (await response.json().catch(() => ({}))) as { id?: unknown };
    if (typeof id !== "string" || id.length === 0 || id.length > MAX_TEXT) {
      throw new AlignError("yt-dlp-z gave an answer the add-on doesn't understand.");
    }
    return id;
  }

  async function check(id: string): Promise<AlignJobStatus> {
    const response = await call(`/api/align/${encodeURIComponent(id)}`);
    if (response.status === 404) {
      throw new AlignError("yt-dlp-z no longer has this alignment (it was restarted?).");
    }
    if (!response.ok) {
      throw await problem(response);
    }
    const status = readStatus(await response.json().catch(() => undefined));
    if (!status) {
      throw new AlignError("yt-dlp-z gave an answer the add-on doesn't understand.");
    }
    return status;
  }

  /** Asks the server to drop the job and its audio. Failures don't matter: it drops idle
   * jobs after an hour anyway. */
  async function remove(id: string): Promise<void> {
    await call(`/api/align/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => undefined);
  }

  return { start, check, remove };
}

export type AlignClient = ReturnType<typeof createAlignClient>;
