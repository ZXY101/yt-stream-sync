// Saved sync groups as kept in storage.local. Read back through `readSavedGroups`, which drops
// anything not in the expected shape (an older version, a hand-edited profile).

export const SAVED_GROUPS_KEY = "savedGroups";

/** One archive of a saved group. */
export interface SavedMember {
  videoId: string;
  title: string;
  channel: string;
  /** Its offset in the sync group (seconds). */
  offset: number;
  /** Seconds into the video when last saved. */
  position: number;
}

export interface SavedGroup {
  id: string;
  name: string;
  /** Wall-clock time (ms) it was last saved or updated. */
  updatedAt: number;
  members: SavedMember[];
}

const MAX_GROUPS = 100;
const MAX_MEMBERS = 16;
const MAX_TEXT = 500;
const MAX_OFFSET = 3600;
const MAX_POSITION = 7 * 24 * 60 * 60;
// Wall-clock milliseconds before 2100.
const MAX_WALL_TIME = 4_102_444_800_000;
// YouTube video ids: 11 characters of base64url. They go into the links tabs open.
const VIDEO_ID = /^[\w-]{11}$/;

type Fields = Record<string, unknown>;

function isObject(value: unknown): value is Fields {
  return typeof value === "object" && value !== null;
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT;
}

function isNumberIn(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isMember(value: unknown): value is SavedMember {
  if (!isObject(value)) {
    return false;
  }
  const { videoId, title, channel, offset, position } = value;
  const textOk = typeof videoId === "string" && VIDEO_ID.test(videoId);
  const namesOk = isText(title) && isText(channel);
  return (
    textOk &&
    namesOk &&
    isNumberIn(offset, -MAX_OFFSET, MAX_OFFSET) &&
    isNumberIn(position, 0, MAX_POSITION)
  );
}

function isGroup(value: unknown): value is SavedGroup {
  if (!isObject(value)) {
    return false;
  }
  const { id, name, updatedAt, members } = value;
  const fieldsOk =
    isText(id) && id !== "" && isText(name) && isNumberIn(updatedAt, 0, MAX_WALL_TIME);
  const membersOk = Array.isArray(members) && members.length <= MAX_MEMBERS;
  return fieldsOk && membersOk && members.every(isMember);
}

/** Stored groups that are in the expected shape; the rest are left out. */
export function readSavedGroups(value: unknown): SavedGroup[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isGroup).slice(0, MAX_GROUPS);
}

/** Keeps the list within what `readSavedGroups` accepts back. */
export function capGroups(groups: SavedGroup[]): SavedGroup[] {
  return groups.slice(0, MAX_GROUPS);
}

const MAX_NAME = 80;

/** "Channel A + Channel B", from the members' channels. */
export function groupName(members: Pick<SavedMember, "channel">[]): string {
  const channels = [...new Set(members.map((member) => member.channel.trim()).filter(Boolean))];
  const name = channels.join(" + ");
  if (name === "") {
    return "Saved group";
  }
  return name.length > MAX_NAME ? `${name.slice(0, MAX_NAME - 1)}…` : name;
}

export function watchUrlAt(videoId: string, position: number): string {
  const seconds = Math.max(0, Math.floor(position));
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${seconds}s`;
}
