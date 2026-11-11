import type { AudioClip, PlayerCommand, PlayerReport } from "../../lib/messages.ts";
import { createAudioSync } from "./audio-sync.ts";
import { createWaveforms } from "./waveforms.ts";

// A player within this many seconds of its spot counts as playing in sync.
const SETTLED_ERROR = 0.2;
// Low-latency streams' latency readings jitter by about 0.1 s, and the sync leaves them
// alone until 0.3 s off (`holdError`), so they're steady anywhere below that.
const PINNED_SETTLED_ERROR = 0.3;

export interface GroupAudioOptions {
  send: (id: string, command: PlayerCommand) => void;
  adjust: (id: string, seconds: number) => void;
  now: () => number;
}

export interface MemberView {
  id: string;
  report: PlayerReport;
  /** Seconds off its spot, from the last sync step; missing while not synced. */
  error: number | undefined;
  /** The sync can't move it any closer to its spot. */
  stuck?: boolean;
}

/**
 * Playing steadily, so its audio lines up the same way with the others' for a whole clip:
 * in sync, or stuck at normal speed (a low-latency stream that can't be held back further).
 * The gap a stuck player keeps is taken out of the match (see `audio-sync.ts`).
 */
function isSettled(member: MemberView): boolean {
  const { report, error } = member;
  if (report.state !== "playing" || error === undefined) {
    return false;
  }
  const steady = member.stuck === true && report.playbackRate === 1;
  const pinned = report.kind === "live" && report.pinned === true;
  const tolerance = pinned ? PINNED_SETTLED_ERROR : SETTLED_ERROR;
  return Math.abs(error) < tolerance || steady;
}

/** Audio for the sync group: matching by audio, and the waveforms the popup draws. */
export function createGroupAudio(options: GroupAudioOptions) {
  const sync = createAudioSync(options);
  const waveforms = createWaveforms();

  function afterTick(members: readonly MemberView[]) {
    const view = members.map((member) => ({
      id: member.id,
      settled: isSettled(member),
      error: member.error ?? 0,
      blocked: member.report.audio?.state === "blocked",
      unavailable: member.report.audio?.state === "unavailable",
    }));
    sync.update(view);
  }

  function onReport(id: string, report: PlayerReport | null) {
    if (report?.audio) {
      waveforms.add(id, report.audio);
    } else {
      waveforms.delete(id);
    }
  }

  return {
    afterTick,
    onReport,
    receiveClip: (id: string, clip: AudioClip) => sync.receiveClip(id, clip),
    setEnabled: sync.setEnabled,
    rematch: sync.rematch,
    status: sync.status,
    waveform: waveforms.get,
  };
}
