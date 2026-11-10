import type { PlayerState } from "../controller/types.ts";

/** What the page script reads from a live player once a second. */
export interface PlayerReport {
  latency: number;
  bufferAhead: number;
  state: PlayerState;
  playbackRate: number;
  title: string;
  channel: string;
}

export type PlayerCommand =
  { type: "setRate"; rate: number } | { type: "pause" } | { type: "play" };

// window.postMessage between the page script (page world) and the content script.
export const PAGE_TAG = "yt-stream-sync:page";
export const CONTENT_TAG = "yt-stream-sync:content";

/** Page script → content script. `null` when the frame has no live player (any more). */
export interface PageMessage {
  tag: typeof PAGE_TAG;
  report: PlayerReport | null;
}

/** Content script → page script. */
export interface ContentMessage {
  tag: typeof CONTENT_TAG;
  command: PlayerCommand;
}

// Port messages between the content script and the background script.
export const PLAYER_PORT = "player";
export type ToBackground = { type: "report"; report: PlayerReport | null };
export type ToContent = { type: "command"; command: PlayerCommand };

/** Popup → background, answered with `PlayerStatus[]`. */
export interface StatusRequest {
  type: "getStatus";
}

export interface PlayerStatus {
  id: string;
  title: string;
  channel: string;
  latency: number;
  state: PlayerState;
  playbackRate: number;
  /** Seconds ahead of the group; missing while the player isn't being synced. */
  error?: number;
}
