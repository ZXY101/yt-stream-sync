import type { PlayerStatus } from "../../lib/messages.ts";
import { isSaveable, saveableMembers } from "./snapshot.ts";
import { MAX_MEMBERS, type SavedGroup, type SavedMember } from "./stored.ts";

/** What editing saved groups needs from the saved groups' state. */
interface EditContext {
  options: {
    save: (groups: SavedGroup[]) => void;
    players: () => PlayerStatus[];
    setOffset: (id: string, offset: number) => void;
    now: () => number;
  };
  groups: SavedGroup[];
  activeId?: string;
}

type Context = EditContext;

function active(context: Context): SavedGroup | undefined {
  return context.groups.find((group) => group.id === context.activeId);
}

export function renameGroup(context: Context, groupId: string, name: string) {
  const group = context.groups.find((other) => other.id === groupId);
  const trimmed = name.trim();
  if (group && trimmed !== "" && trimmed !== group.name) {
    replace(context, { ...group, name: trimmed });
  }
}

/** A saved group is for syncing, so it keeps at least two archives. */
const MIN_MEMBERS = 2;

export function removeSavedMember(context: Context, groupId: string, videoId: string) {
  const group = context.groups.find((other) => other.id === groupId);
  if (!group || group.members.length <= MIN_MEMBERS) {
    return;
  }
  const members = group.members.filter((member) => member.videoId !== videoId);
  if (members.length < group.members.length) {
    replace(context, { ...group, members, updatedAt: context.options.now() });
  }
}

export function setSavedOffset(context: Context, groupId: string, videoId: string, offset: number) {
  const group = context.groups.find((other) => other.id === groupId);
  if (!group?.members.some((member) => member.videoId === videoId)) {
    return;
  }
  const members = group.members.map((member) =>
    member.videoId === videoId ? { ...member, offset } : member,
  );
  replace(context, { ...group, members, updatedAt: context.options.now() });
  // The open group's stream moves too, or the next update would put the old offset back.
  if (group.id === context.activeId) {
    const player = context.options
      .players()
      .find((other) => other.inGroup && isSaveable(other) && other.videoId === videoId);
    if (player) {
      context.options.setOffset(player.id, offset);
    }
  }
}

/** The sync group's archives that `group` doesn't have yet. */
export function newMembers(context: Context, group: SavedGroup) {
  const known = new Set(group.members.map((member) => member.videoId));
  return saveableMembers(context.options.players()).filter((member) => !known.has(member.videoId));
}

export function addToGroup(context: Context, groupId: string) {
  const group = active(context);
  if (group?.id !== groupId) {
    return;
  }
  const added = newMembers(context, group);
  if (added.length > 0) {
    const members = [...group.members, ...added].slice(0, MAX_MEMBERS);
    replace(context, { ...group, members, updatedAt: context.options.now() });
  }
}

/**
 * A new member for `videoId`. Its title, channel and place come from a tab that has it open,
 * if any (they fill in when the group is opened otherwise). Its offset is the sync group's
 * when `inSync` (the group is open and the stream is in it), else 0, which lines it up by
 * broadcast start like any newly added archive.
 */
function newMember(players: PlayerStatus[], videoId: string, inSync: boolean): SavedMember {
  const tabs = players.filter((player) => player.videoId === videoId);
  const synced = inSync ? saveableMembers(tabs)[0] : undefined;
  if (synced) {
    return synced;
  }
  const tab = tabs.find(isSaveable) ?? tabs[0];
  const position = Math.round((tab?.position ?? 0) * 10) / 10;
  return { videoId, title: tab?.title ?? "", channel: tab?.channel ?? "", offset: 0, position };
}

/** Adds one archive to a saved group by its video id (not twice, not past the limit). */
export function addSavedStream(context: Context, groupId: string, videoId: string) {
  const group = context.groups.find((other) => other.id === groupId);
  if (!group || group.members.length >= MAX_MEMBERS) {
    return;
  }
  if (group.members.some((member) => member.videoId === videoId)) {
    return;
  }
  const member = newMember(context.options.players(), videoId, group.id === context.activeId);
  const members = [...group.members, member];
  replace(context, { ...group, members, updatedAt: context.options.now() });
}

/** Stores an edited group where it is in the list (editing doesn't make it the newest). */
function replace(context: Context, group: SavedGroup) {
  context.groups = context.groups.map((other) => (other.id === group.id ? group : other));
  context.options.save(context.groups);
}
