import type { PlayerState } from "../controller/types.ts";
import {
  CONTENT_TAG,
  PAGE_TAG,
  type ContentMessage,
  type PageMessage,
  type PlayerCommand,
  type PlayerReport,
  type PopupRequest,
} from "./messages.ts";

// Anything in the page can post messages, so every field is checked before use.
const STATES: ReadonlySet<unknown> = new Set<PlayerState>([
  "playing",
  "paused",
  "buffering",
  "ad",
  "ended",
]);
const MAX_SECONDS = 7 * 24 * 60 * 60;
const MAX_RATE = 16;
const MAX_NUDGE = 60;
const MAX_TEXT = 500;
// Unix seconds between 2005 (YouTube's start) and 2100.
const MIN_START = 1_104_537_600;
const MAX_START = 4_102_444_800;

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

function isRate(value: unknown): value is number {
  return inRange(value, MAX_RATE) && value > 0;
}

function hasBaseFields(value: Fields): boolean {
  const stateOk = STATES.has(value.state) && isRate(value.playbackRate);
  return stateOk && isText(value.title) && isText(value.channel) && isText(value.videoId);
}

function isStartTime(value: unknown): boolean {
  return value === undefined || (inRange(value, MAX_START) && value >= MIN_START);
}

function hasKindFields(value: Fields): boolean {
  if (value.kind === "live") {
    return inRange(value.latency, MAX_SECONDS) && inRange(value.bufferAhead, MAX_SECONDS);
  }
  if (value.kind !== "archive") {
    return false;
  }
  const timesOk = [value.position, value.duration, value.bufferAhead].every((seconds) =>
    inRange(seconds, MAX_SECONDS),
  );
  const actionsOk = Number.isSafeInteger(value.userActions) && (value.userActions as number) >= 0;
  return timesOk && actionsOk && isStartTime(value.startTime);
}

export function isPlayerReport(value: unknown): value is PlayerReport {
  return isObject(value) && hasBaseFields(value) && hasKindFields(value);
}

export function isPlayerCommand(value: unknown): value is PlayerCommand {
  if (!isObject(value)) {
    return false;
  }
  if (value.type === "setRate") {
    return isRate(value.rate);
  }
  if (value.type === "seek") {
    return inRange(value.position, MAX_SECONDS);
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

function isNudge(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_NUDGE;
}

export function isPopupRequest(value: unknown): value is PopupRequest {
  if (!isObject(value)) {
    return false;
  }
  if (value.type === "getStatus") {
    return true;
  }
  if (value.type === "setInGroup") {
    return isText(value.id) && typeof value.inGroup === "boolean";
  }
  return value.type === "nudge" && isText(value.id) && isNudge(value.seconds);
}
