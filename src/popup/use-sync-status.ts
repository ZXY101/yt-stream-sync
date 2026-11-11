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

/**
 * The streams the background script knows about, refreshed every second, and the actions
 * the popup offers on them.
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

  async function setInGroup(id: string, inGroup: boolean) {
    setStatus(await request({ type: "setInGroup", id, inGroup }));
  }

  async function setAudioSync(on: boolean) {
    setStatus(await request({ type: "setAudioSync", on }));
  }

  async function rematchAudio() {
    setStatus(await request({ type: "rematchAudio" }));
  }

  async function clearGroup() {
    setStatus(await request({ type: "clearGroup" }));
  }

  return {
    status: withPending(status, batch.pending),
    setInGroup,
    nudge: batch.nudge,
    setAudioSync,
    rematchAudio,
    clearGroup,
  };
}
