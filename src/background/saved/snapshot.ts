import type { PlayerStatus } from "../../lib/messages.ts";
import type { SavedMember } from "./stored.ts";

/**
 * Whether a player can be saved: an archive on a watch page. Watch pages know the broadcast
 * start, which is what archive offsets are measured from, so the offsets still hold when the
 * group is opened again later. Live streams and embeds can't promise that.
 */
export function isSaveable(player: PlayerStatus): boolean {
  return player.kind === "archive" && player.hasStartTime === true;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The sync group's saveable archives, one per video. */
export function saveableMembers(players: PlayerStatus[]): SavedMember[] {
  const members = new Map<string, SavedMember>();
  for (const player of players) {
    if (player.inGroup && isSaveable(player) && !members.has(player.videoId)) {
      members.set(player.videoId, {
        videoId: player.videoId,
        title: player.title,
        channel: player.channel,
        offset: player.offset,
        position: roundToTenth(player.position ?? 0),
      });
    }
  }
  return [...members.values()];
}

/**
 * A saved group's members brought up to date with the sync group: members still there take
 * their current offset and position, new ones are added. Members whose tab was closed stay,
 * so closing the tabs at the end of a session doesn't empty the saved group.
 */
export function mergeMembers(saved: SavedMember[], current: SavedMember[]): SavedMember[] {
  const now = new Map(current.map((member) => [member.videoId, member]));
  const kept = saved.map((member) => now.get(member.videoId) ?? member);
  const known = new Set(saved.map((member) => member.videoId));
  return [...kept, ...current.filter((member) => !known.has(member.videoId))];
}

function sameMember(a: SavedMember, b: SavedMember | undefined): boolean {
  if (b === undefined) {
    return false;
  }
  const namesSame = a.videoId === b.videoId && a.title === b.title && a.channel === b.channel;
  return namesSame && a.offset === b.offset && a.position === b.position;
}

export function sameMembers(a: SavedMember[], b: SavedMember[]): boolean {
  return a.length === b.length && a.every((member, index) => sameMember(member, b[index]));
}
