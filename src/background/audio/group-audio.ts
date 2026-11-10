import type { AudioClip, PlayerCommand, PlayerReport } from "../../lib/messages.ts";
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

function isSettled(member: MemberView): boolean {
  const inSync = member.error !== undefined && Math.abs(member.error) < SETTLED_ERROR;
  return member.report.state === "playing" && inSync;
}

/** Audio for the sync group: matching by audio, and the waveforms the popup draws. */
export function createGroupAudio(options: GroupAudioOptions) {
  const sync = createAudioSync(options);
  const waveforms = createWaveforms();

  function afterTick(members: readonly MemberView[]) {
    const view = members.map((member) => ({
      id: member.id,
      settled: isSettled(member),
      blocked: member.report.audio?.state === "blocked",
      unavailable: member.report.audio?.state === "unavailable",
    }));
    sync.update(view, undefined);
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
