import { AUDIO_RATE } from "../audio/ring.ts";
import type { PlayerState } from "../controller/types.ts";
import {
  CONTENT_TAG,
  PAGE_TAG,
  type AudioClip,
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
const MAX_ENVELOPE = 200;
const AUDIO_STATES: ReadonlySet<unknown> = new Set(["listening", "blocked", "unavailable"]);
const MAX_CLIP_SECONDS = 30;
const MAX_SKIP_SECONDS = 120;
// 30 s of 2 kHz 16-bit PCM in base64, with room to spare.
const MAX_PCM_TEXT = 200_000;
// Wall-clock milliseconds before 2100.
const MAX_WALL_TIME = 4_102_444_800_000;
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

function hasLiveFields(value: Fields): boolean {
  const lowOk = value.bufferLow === undefined || inRange(value.bufferLow, MAX_SECONDS);
  const pinnedOk = value.pinned === undefined || typeof value.pinned === "boolean";
  const timesOk = inRange(value.latency, MAX_SECONDS) && inRange(value.bufferAhead, MAX_SECONDS);
  return timesOk && lowOk && pinnedOk;
}

function hasKindFields(value: Fields): boolean {
  if (value.kind === "live") {
    return hasLiveFields(value);
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

function isAudioReport(value: unknown): boolean {
  if (value === undefined) {
    return true;
  }
  if (!isObject(value) || !AUDIO_STATES.has(value.state)) {
    return false;
  }
  const envelope = value.envelope;
  const valuesOk =
    Array.isArray(envelope) &&
    envelope.length <= MAX_ENVELOPE &&
    envelope.every((level) => inRange(level, 1));
  const noteOk = value.note === undefined || isText(value.note);
  return valuesOk && noteOk && inRange(value.end, MAX_WALL_TIME);
}

export function isPlayerReport(value: unknown): value is PlayerReport {
  const fieldsOk = isObject(value) && hasBaseFields(value) && hasKindFields(value);
  return fieldsOk && isAudioReport(value.audio);
}

export function isAudioClip(value: unknown): value is AudioClip {
  if (!isObject(value) || value.rate !== AUDIO_RATE) {
    return false;
  }
  const textOk = typeof value.pcm === "string" && value.pcm.length <= MAX_PCM_TEXT;
  const requestOk = Number.isSafeInteger(value.request) && (value.request as number) >= 0;
  return textOk && requestOk && inRange(value.start, MAX_WALL_TIME);
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
  if (value.type === "skip") {
    return inRange(value.seconds, MAX_SKIP_SECONDS);
  }
  if (value.type === "listen") {
    return typeof value.on === "boolean";
  }
  if (value.type === "clip") {
    return Number.isSafeInteger(value.request) && inRange(value.seconds, MAX_CLIP_SECONDS);
  }
  return value.type === "pause" || value.type === "play";
}

export function isPageMessage(value: unknown): value is PageMessage {
  if (!isObject(value) || value.tag !== PAGE_TAG) {
    return false;
  }
  if ("clip" in value) {
    return isAudioClip(value.clip);
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
  if (value.type === "setAudioSync") {
    return typeof value.on === "boolean";
  }
  if (["rematchAudio", "clearGroup", "getDebugLog"].includes(value.type as string)) {
    return true;
  }
  return value.type === "nudge" && isText(value.id) && isNudge(value.seconds);
}
