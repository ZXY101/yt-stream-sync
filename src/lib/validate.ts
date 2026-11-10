import type { PlayerState } from "../controller/types.ts";
import {
  CONTENT_TAG,
  PAGE_TAG,
  type ContentMessage,
  type PageMessage,
  type PlayerCommand,
  type PlayerReport,
} from "./messages.ts";

// Anything in the page can post messages, so every field is checked before use.
const STATES: ReadonlySet<unknown> = new Set<PlayerState>([
  "playing",
  "paused",
  "buffering",
  "ad",
  "ended",
]);
const MAX_SECONDS = 24 * 60 * 60;
const MAX_TEXT = 500;

type Fields = Record<string, unknown>;

function isObject(value: unknown): value is Fields {
  return typeof value === "object" && value !== null;
}

function inRange(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT;
}

export function isPlayerReport(value: unknown): value is PlayerReport {
  if (!isObject(value)) {
    return false;
  }
  const timesOk = inRange(value.latency, MAX_SECONDS) && inRange(value.bufferAhead, MAX_SECONDS);
  const stateOk = STATES.has(value.state) && inRange(value.playbackRate, 16);
  return timesOk && stateOk && isText(value.title) && isText(value.channel);
}

export function isPlayerCommand(value: unknown): value is PlayerCommand {
  if (!isObject(value)) {
    return false;
  }
  if (value.type === "setRate") {
    return inRange(value.rate, 1) && value.rate > 0;
  }
  return value.type === "pause" || value.type === "play";
}

export function isPageMessage(value: unknown): value is PageMessage {
  if (!isObject(value) || value.tag !== PAGE_TAG) {
    return false;
  }
  return value.report === null || isPlayerReport(value.report);
}

export function isContentMessage(value: unknown): value is ContentMessage {
  return isObject(value) && value.tag === CONTENT_TAG && isPlayerCommand(value.command);
}
