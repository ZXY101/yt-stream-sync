import type { PlayerStatus, PopupRequest, SavedStatus } from "../../lib/messages.ts";
import { createRestore } from "./restore.ts";
import { addToGroup, newMembers, removeSavedMember, renameGroup, setSavedOffset } from "./edits.ts";
import { isSaveable, refreshMembers, saveableMembers, sameMembers } from "./snapshot.ts";
import { capGroups, groupName, readSavedGroups, watchUrlAt, type SavedGroup } from "./stored.ts";

// How often an open saved group takes the sync group's offsets and positions.
const UPDATE_EVERY_MS = 10_000;

export interface SavedGroupsOptions {
  /** What storage holds (checked before use). */
  load: () => Promise<unknown>;
  save: (groups: SavedGroup[]) => void;
  /** Opens a tab in front and gives its id (undefined if it couldn't be opened). */
  openTab: (url: string) => Promise<number | undefined>;
  /** Brings a tab to the front. */
  focusTab: (tabId: number) => void;
  players: () => PlayerStatus[];
  setInGroup: (id: string, inGroup: boolean) => void;
  setOffset: (id: string, offset: number) => void;
  /** Empties the sync group without touching saved groups. */
  clearGroup: () => void;
  /** Wall-clock milliseconds. */
  now: () => number;
  newId: () => string;
}

interface Context {
  options: SavedGroupsOptions;
  restore: ReturnType<typeof createRestore>;
  groups: SavedGroup[];
  /** The saved group the sync group was opened from or saved as. */
  activeId?: string;
  lastUpdate: number;
}

/** Puts `group` first (newest) and stores the list. */
function put(context: Context, group: SavedGroup) {
  const others = context.groups.filter((other) => other.id !== group.id);
  context.groups = capGroups([group, ...others]);
  context.options.save(context.groups);
}

function active(context: Context): SavedGroup | undefined {
  return context.groups.find((group) => group.id === context.activeId);
}

function activate(context: Context, id: string | undefined) {
  context.activeId = id;
  context.lastUpdate = context.options.now();
  if (id === undefined) {
    context.restore.clear();
  }
}

function saveGroup(context: Context) {
  const { options } = context;
  const members = saveableMembers(options.players());
  if (members.length >= 2) {
    const id = options.newId();
    put(context, { id, name: groupName(members), updatedAt: options.now(), members });
    activate(context, id);
  }
}

/**
 * Opens each member's tab in front, one after the other, then goes back to the first. Firefox
 * won't start a video in a background tab until it has been shown, so every tab is shown once.
 */
async function openTabs(options: SavedGroupsOptions, members: SavedGroup["members"]) {
  const tabIds: (number | undefined)[] = [];
  for (const member of members) {
    // One at a time on purpose: each tab is in front once, and the tab order stays the group's.
    // oxlint-disable-next-line no-await-in-loop
    tabIds.push(await options.openTab(watchUrlAt(member.videoId, member.position)));
  }
  const first = tabIds[0];
  if (tabIds.length > 1 && first !== undefined) {
    options.focusTab(first);
  }
}

/** Opens tabs for the members that aren't open yet; they rejoin as their players report. */
function openGroup(context: Context, groupId: string) {
  const { options, restore } = context;
  const group = context.groups.find((other) => other.id === groupId);
  if (!group) {
    return;
  }
  options.clearGroup();
  // An embed of the video doesn't count: without a start time it can't rejoin.
  const open = new Set(
    options
      .players()
      .filter(isSaveable)
      .map((player) => player.videoId),
  );
  const toOpen = group.members.filter((member) => !open.has(member.videoId));
  void openTabs(options, toOpen);
  activate(context, group.id);
  restore.expect(group.members);
  restore.tick(options.players());
}

function deleteGroup(context: Context, groupId: string) {
  if (context.activeId === groupId) {
    activate(context, undefined);
  }
  context.groups = context.groups.filter((group) => group.id !== groupId);
  context.options.save(context.groups);
}

/** How many of `group`'s archives are in the sync group right now. */
function membersInSync(context: Context, group: SavedGroup): number {
  const videoIds = new Set(group.members.map((member) => member.videoId));
  const inSync = context.options
    .players()
    .filter((player) => player.inGroup && isSaveable(player) && videoIds.has(player.videoId));
  return new Set(inSync.map((player) => player.videoId)).size;
}

/**
 * Lets go of the open saved group once none of its streams are in the sync group any more
 * (their tabs closed or the user removed them) and none are still being opened.
 */
function releaseIfGone(context: Context) {
  const group = active(context);
  if (!group || context.restore.waiting() > 0) {
    return;
  }
  if (membersInSync(context, group) === 0) {
    activate(context, undefined);
  }
}

function update(context: Context) {
  const { options } = context;
  const group = active(context);
  if (!group || options.now() - context.lastUpdate < UPDATE_EVERY_MS) {
    return;
  }
  context.lastUpdate = options.now();
  const members = refreshMembers(group.members, saveableMembers(options.players()));
  if (!sameMembers(members, group.members)) {
    put(context, { ...group, members, updatedAt: options.now() });
  }
}

/** Acts on the popup requests that concern saved groups; the rest are the coordinator's. */
function handle(context: Context, request: PopupRequest) {
  if (request.type === "saveGroup") {
    saveGroup(context);
  } else if (request.type === "openSavedGroup") {
    openGroup(context, request.groupId);
  } else if (request.type === "deleteSavedGroup") {
    deleteGroup(context, request.groupId);
  } else if (request.type === "renameSavedGroup") {
    renameGroup(context, request.groupId, request.name);
  } else if (request.type === "removeSavedMember") {
    removeSavedMember(context, request.groupId, request.videoId);
  } else if (request.type === "setSavedOffset") {
    setSavedOffset(context, request.groupId, request.videoId, request.offset);
  } else if (request.type === "addToSavedGroup") {
    addToGroup(context, request.groupId);
  } else if (request.type === "clearGroup") {
    activate(context, undefined);
  }
}

function summary(group: SavedGroup) {
  const streams = group.members.map(({ videoId, title, channel, offset, position }) => ({
    videoId,
    title,
    channel,
    offset,
    position,
  }));
  const position = group.members[0]?.position ?? 0;
  return { id: group.id, name: group.name, updatedAt: group.updatedAt, position, streams };
}

function status(context: Context): SavedStatus {
  const open = active(context);
  return {
    addable: open ? newMembers(context, open).length : 0,
    inSync: open ? membersInSync(context, open) : 0,
    groups: context.groups.map(summary),
    activeId: active(context)?.id,
    canSave: saveableMembers(context.options.players()).length >= 2,
    opening: context.restore.waiting(),
  };
}

/**
 * Saved sync groups: saving the sync group's archives, opening a saved group again, keeping
 * the open one's offsets and positions up to date, and editing saved groups (rename, remove
 * an archive, delete).
 */
export function createSavedGroups(options: SavedGroupsOptions) {
  const context: Context = { options, restore: createRestore(options), groups: [], lastUpdate: 0 };
  // Unreadable storage leaves the list empty; saving later writes a fresh one.
  const ready = options.load().then(
    (stored) => {
      context.groups = readSavedGroups(stored);
      return undefined;
    },
    () => undefined,
  );

  function tick() {
    context.restore.tick(options.players());
    releaseIfGone(context);
    update(context);
  }

  return {
    ready,
    tick,
    handle: (request: PopupRequest) => handle(context, request),
    status: () => status(context),
  };
}
