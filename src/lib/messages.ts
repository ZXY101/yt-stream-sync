import type { PlayerState } from "../controller/types.ts";

/** While the add-on listens to a player: its state and the loudness heard since the last report. */
export interface AudioReport {
  /** "blocked": the browser hasn't let the page play audio yet (needs a click in the page). */
  state: "listening" | "blocked";
  /** Loudness (0–1) per 50 ms, oldest first. */
  envelope: number[];
  /** Wall-clock time (ms) at the end of the last envelope value. */
  end: number;
}

/** A recording of a player's last seconds of audio, for matching. */
export interface AudioClip {
  /** Which request this answers. */
  request: number;
  /** Wall-clock time (ms) of the first sample. */
  start: number;
  /** Always 4000. */
  rate: number;
  /** 16-bit PCM, base64. */
  pcm: string;
}

interface ReportBase {
  state: PlayerState;
  playbackRate: number;
  title: string;
  channel: string;
  /** YouTube's video id, so a frame that moved on to another video leaves the group. */
  videoId: string;
  audio?: AudioReport;
}

/** What the page script reads from a live player once a second. */
export interface LiveReport extends ReportBase {
  kind: "live";
  latency: number;
  bufferAhead: number;
}

/** What the page script reads from an archived stream's player. */
export interface ArchiveReport extends ReportBase {
  kind: "archive";
  position: number;
  duration: number;
  /** Seconds buffered ahead of the position. */
  bufferAhead: number;
  /** Broadcast start in Unix seconds; watch pages have it, embeds don't. */
  startTime?: number;
  /** Goes up each time the user seeks, plays, pauses or changes speed on this player. */
  userActions: number;
}

export type PlayerReport = LiveReport | ArchiveReport;

export type PlayerCommand =
  | { type: "setRate"; rate: number }
  | { type: "seek"; position: number }
  | { type: "pause" }
  | { type: "play" }
  /** Start or stop listening to the player's audio. */
  | { type: "listen"; on: boolean }
  /** Send back the last `seconds` of audio heard. */
  | { type: "clip"; request: number; seconds: number };

// window.postMessage between the page script (page world) and the content script.
export const PAGE_TAG = "yt-stream-sync:page";
export const CONTENT_TAG = "yt-stream-sync:content";

/**
 * Page script → content script: a report (`null` when the frame has no stream player any
 * more), or an audio clip that was asked for.
 */
export type PageMessage =
  { tag: typeof PAGE_TAG; report: PlayerReport | null } | { tag: typeof PAGE_TAG; clip: AudioClip };

/** Content script → page script. */
export interface ContentMessage {
  tag: typeof CONTENT_TAG;
  command: PlayerCommand;
}

/** A player is one frame: `<tab id>:<frame id>`. */
export function playerId(tabId: number, frameId: number): string {
  return `${tabId}:${frameId}`;
}

export function tabOf(id: string): number {
  return Number(id.split(":")[0]);
}

// Port messages between the content script and the background script.
export const PLAYER_PORT = "player";
export type ToBackground =
  { type: "report"; report: PlayerReport | null } | { type: "clip"; clip: AudioClip };
export type ToContent = { type: "command"; command: PlayerCommand };

/** Popup → background requests, each answered with a `SyncStatus`. */
export type PopupRequest =
  | { type: "getStatus" }
  /** The user added a player to the sync group or removed it. */
  | { type: "setInGroup"; id: string; inGroup: boolean }
  /** The user nudged a player: positive moves it ahead (newer), negative back. */
  | { type: "nudge"; id: string; seconds: number };

export interface PlayerStatus {
  id: string;
  /** The browser tab the player is in. */
  tabId: number;
  videoId: string;
  kind: PlayerReport["kind"];
  title: string;
  channel: string;
  state: PlayerState;
  playbackRate: number;
  /** Live: seconds behind live. */
  latency?: number;
  /** Archive: seconds into the video. */
  position?: number;
  /** Archive: whether the broadcast start time is known (watch pages) or not (embeds). */
  hasStartTime?: boolean;
  /** The user opted this player in. */
  inGroup: boolean;
  /** The user's nudge in seconds. */
  offset: number;
  /** Seconds ahead of the group (negative: behind); missing while it isn't being synced. */
  error?: number;
}

export interface SyncStatus {
  players: PlayerStatus[];
  /** Live streams and archives are both in the group: they can't be synced together. */
  mixed: boolean;
}
