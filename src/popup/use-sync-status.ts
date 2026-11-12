import { useEffect, useRef, useState } from "react";

import { ext } from "../lib/browser.ts";
import type { PopupRequest, SyncStatus } from "../lib/messages.ts";

const REFRESH_MS = 1000;
/**
 * Clicks this close together go out as one nudge: each nudge makes the archive sync seek and
 * wait for buffers, so ten quick clicks would mean ten stutters instead of one.
 */
const NUDGE_BATCH_MS = 400;
const EMPTY: SyncStatus = {
  players: [],
  mixed: false,
  audio: { state: "waiting" },
  align: { state: "off" },
  saved: { groups: [], canSave: false, opening: 0, addable: 0, inSync: 0 },
};

function request(message: PopupRequest): Promise<SyncStatus> {
  const response = ext.runtime.sendMessage(message) as Promise<SyncStatus | undefined>;
  return response.then((status) => status ?? EMPTY);
}

function roundToMillisecond(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** The status with nudges not yet sent added in, so the popup shows them straight away. */
function withPending(status: SyncStatus | undefined, pending: Record<string, number>) {
  if (status === undefined) {
    return undefined;
  }
  const players = status.players.map((player) => {
    const extra = pending[player.id] ?? 0;
    return extra === 0 ? player : { ...player, offset: roundToMillisecond(player.offset + extra) };
  });
  return { ...status, players };
}

/** Nudges summed per player until the clicks stop for `NUDGE_BATCH_MS`. */
function useNudgeBatch(setStatus: (status: SyncStatus) => void) {
  const [pending, setPending] = useState<Record<string, number>>({});
  const sums = useRef(new Map<string, number>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  async function flush(id: string) {
    const seconds = sums.current.get(id) ?? 0;
    sums.current.delete(id);
    timers.current.delete(id);
    const status = await request({ type: "nudge", id, seconds });
    // Both in one go: the new offset arrives as the pending part goes, without a flicker.
    setStatus(status);
    setPending((current) => {
      const { [id]: _sent, ...rest } = current;
      return sums.current.has(id) ? current : rest;
    });
  }

  function nudge(id: string, seconds: number) {
    const sum = roundToMillisecond((sums.current.get(id) ?? 0) + seconds);
    sums.current.set(id, sum);
    setPending((current) => ({ ...current, [id]: sum }));
    clearTimeout(timers.current.get(id));
    timers.current.set(
      id,
      setTimeout(() => void flush(id), NUDGE_BATCH_MS),
    );
  }

  return { pending, nudge };
}

/** The popup's actions: each sends a request and shows the status it's answered with. */
function actions(setStatus: (status: SyncStatus) => void) {
  function send(message: PopupRequest) {
    return request(message).then((status) => {
      setStatus(status);
      return undefined;
    });
  }
  return {
    setInGroup: (id: string, inGroup: boolean) => send({ type: "setInGroup", id, inGroup }),
    setAudioSync: (on: boolean) => send({ type: "setAudioSync", on }),
    rematchAudio: () => send({ type: "rematchAudio" }),
    clearGroup: () => send({ type: "clearGroup" }),
    alignArchives: () => send({ type: "alignArchives" }),
    cancelAlign: () => send({ type: "cancelAlign" }),
    saveGroup: () => send({ type: "saveGroup" }),
    openSavedGroup: (groupId: string) => send({ type: "openSavedGroup", groupId }),
    deleteSavedGroup: (groupId: string) => send({ type: "deleteSavedGroup", groupId }),
    renameSavedGroup: (groupId: string, name: string) =>
      send({ type: "renameSavedGroup", groupId, name }),
    removeSavedMember: (groupId: string, videoId: string) =>
      send({ type: "removeSavedMember", groupId, videoId }),
    setSavedOffset: (groupId: string, videoId: string, offset: number) =>
      send({ type: "setSavedOffset", groupId, videoId, offset }),
    addSavedStream: (groupId: string, videoId: string) =>
      send({ type: "addSavedStream", groupId, videoId }),
    /** With `playerId`, that player joins the sync group first. */
    addToSavedGroup: async (groupId: string, playerId?: string) => {
      if (playerId !== undefined) {
        await send({ type: "setInGroup", id: playerId, inGroup: true });
      }
      return send({ type: "addToSavedGroup", groupId });
    },
  };
}

/**
 * The streams the background script knows about, refreshed every second, and the actions
 * the popup (and the saved groups page) offer on them.
 */
export function useSyncStatus() {
  const [status, setStatus] = useState<SyncStatus>();
  const batch = useNudgeBatch(setStatus);

  useEffect(() => {
    let active = true;
    async function refresh() {
      const latest = await request({ type: "getStatus" });
      if (active) {
        setStatus(latest);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return { status: withPending(status, batch.pending), nudge: batch.nudge, ...actions(setStatus) };
}
