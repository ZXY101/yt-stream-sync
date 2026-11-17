import type { AudioClip, AudioStatus, PlayerCommand, PlayerReport } from "../../lib/messages.ts";
import { createAudioSync } from "./audio-sync.ts";
import { createWaveforms } from "./waveforms.ts";

// A player within this many seconds of its spot counts as playing in sync.
const SETTLED_ERROR = 0.2;

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
}

/** Playing in sync, so its audio lines up the same way with the others' for a whole clip. */
function isSettled(member: MemberView): boolean {
  const { report, error } = member;
  return report.state === "playing" && error !== undefined && Math.abs(error) < SETTLED_ERROR;
}

/** Audio for the sync group: matching by audio, and the waveforms the popup draws. */
export function createGroupAudio(options: GroupAudioOptions) {
  const sync = createAudioSync(options);
  const waveforms = createWaveforms();

  // Live groups sync by latency only: buffering threw audio matches off too often (hand
  // tests, 2026-11-15/17), and v0.1.2's latency-only sync did better. Archives still match.
  let live = false;

  function afterTick(members: readonly MemberView[]) {
    live = members.some((member) => member.report.kind === "live");
    if (live) {
      sync.update([]);
      return;
    }
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
    status: (): AudioStatus => (live ? { state: "off" } : sync.status()),
    waveform: waveforms.get,
  };
}
