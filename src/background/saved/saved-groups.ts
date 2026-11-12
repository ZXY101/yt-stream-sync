import type { PlayerStatus, PopupRequest, SavedStatus } from "../../lib/messages.ts";
import { createRestore } from "./restore.ts";
import { isSaveable, mergeMembers, saveableMembers, sameMembers } from "./snapshot.ts";
import { capGroups, groupName, readSavedGroups, watchUrlAt, type SavedGroup } from "./stored.ts";

// How often an open saved group takes the sync group's offsets and positions.
const UPDATE_EVERY_MS = 10_000;

export interface SavedGroupsOptions {
  /** What storage holds (checked before use). */
  load: () => Promise<unknown>;
  save: (groups: SavedGroup[]) => void;
  openTab: (url: string, active: boolean) => void;
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
  toOpen.forEach((member, index) => {
    options.openTab(watchUrlAt(member.videoId, member.position), index === 0);
  });
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

/** The user took a stream out of the open group: it leaves the saved group too. */
function removeMember(context: Context, playerId: string) {
  const group = active(context);
  const player = context.options.players().find((other) => other.id === playerId);
  if (group && player) {
    const members = group.members.filter((member) => member.videoId !== player.videoId);
    put(context, { ...group, members, updatedAt: context.options.now() });
  }
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
  const videoIds = new Set(group.members.map((member) => member.videoId));
  const anyLeft = context.options
    .players()
    .some((player) => player.inGroup && videoIds.has(player.videoId));
  if (!anyLeft) {
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
  const members = mergeMembers(group.members, saveableMembers(options.players()));
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
  } else if (request.type === "setInGroup" && !request.inGroup) {
    removeMember(context, request.id);
  } else if (request.type === "clearGroup") {
    activate(context, undefined);
  }
}

function summary(group: SavedGroup) {
  const streams = group.members.map(({ videoId, title, channel }) => ({ videoId, title, channel }));
  const position = group.members[0]?.position ?? 0;
  return { id: group.id, name: group.name, updatedAt: group.updatedAt, position, streams };
}

function status(context: Context): SavedStatus {
  return {
    groups: context.groups.map(summary),
    activeId: active(context)?.id,
    canSave: saveableMembers(context.options.players()).length >= 2,
    opening: context.restore.waiting(),
  };
}

/**
 * Saved sync groups: saving the sync group's archives, opening a saved group again, and
 * keeping the open one up to date (offsets, positions, streams added or removed by the user).
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
