import type { AudioClip, PlayerCommand, PlayerReport } from "../../lib/messages.ts";
import { createAudioSync } from "./audio-sync.ts";
import { createWaveforms } from "./waveforms.ts";

// A player within this many seconds of its spot counts as playing in sync.
const SETTLED_ERROR = 0.2;
// Low-latency streams' latency readings jitter by about 0.1 s, and the sync leaves them
// alone until 0.3 s off (`holdError`), so they're steady anywhere below that.
const PINNED_SETTLED_ERROR = 0.3;
// A stream that can't reach its spot still counts when it's this close: the match searches
// 15 s either way, and the gap the sync knows about is taken out of the result. At 2 s, a real
// ultra-low-latency stream sat right on the limit (2.0 s ahead) and never got matched.
const STEADY_MAX_GAP = 5;
// Steady playback moves a gap by hundredths of a second per step; a skip moves it by tenths.
const MOVED_ERROR = 0.25;

export interface GroupAudioOptions {
  send: (id: string, command: PlayerCommand) => void;
  adjust: (id: string, seconds: number) => void;
  now: () => number;
  /** Debug log for how matching goes. */
  log?: (line: string) => void;
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
 * in sync, or stuck at normal speed (a low-latency stream that can't be held back further),
 * or a no-rewind stream close to its spot at normal speed. The gap such a player keeps is
 * taken out of the match (see `known-gaps.ts`). `moved`: its gap just jumped (a skip), so
 * the audio it played before no longer lines up the same way.
 */
export function isSettled(member: MemberView, moved = false): boolean {
  const { report, error } = member;
  if (report.state !== "playing" || error === undefined || moved) {
    return false;
  }
  // A no-rewind stream often sits a second or so off (a real one stayed 1.4 s behind for
  // minutes) and never counted, so audio matching never ran with it.
  if (report.kind === "live" && report.noRewind === true && report.pinned !== true) {
    return report.playbackRate === 1 && Math.abs(error) <= STEADY_MAX_GAP;
  }
  return inSyncOrSteady(member, error);
}

function inSyncOrSteady(member: MemberView, error: number): boolean {
  const { report } = member;
  // A stuck player further off than this would put the match outside what it can measure
  // (a 14 s gap gave a 19.7 s "lag" on a real group); it waits until it's closer.
  const steady =
    member.stuck === true && report.playbackRate === 1 && Math.abs(error) <= STEADY_MAX_GAP;
  // Streams that can't be held back jitter like pinned ones and are left alone below holdError.
  const pinned = report.kind === "live" && (report.pinned === true || report.noRewind === true);
  const tolerance = pinned ? PINNED_SETTLED_ERROR : SETTLED_ERROR;
  return Math.abs(error) < tolerance || steady;
}

/** Audio for the sync group: matching by audio, and the waveforms the popup draws. */
export function createGroupAudio(options: GroupAudioOptions) {
  const sync = createAudioSync(options);
  const waveforms = createWaveforms();
  const lastErrors = new Map<string, number>();

  /** The player's gap jumped since the last step: the sync skipped it, or YouTube moved it. */
  function moved(member: MemberView): boolean {
    const last = lastErrors.get(member.id);
    const now = member.error;
    lastErrors.set(member.id, now ?? 0);
    return last !== undefined && now !== undefined && Math.abs(now - last) > MOVED_ERROR;
  }

  function afterTick(members: readonly MemberView[]) {
    const view = members.map((member) => ({
      id: member.id,
      settled: isSettled(member, moved(member)),
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
    /** Seconds each member has played steadily, for the debug log. */
    steady: () => Object.fromEntries(sync.readiness.seconds()),
    waveform: waveforms.get,
  };
}
