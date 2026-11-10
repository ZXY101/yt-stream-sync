import type { AudioReport, Waveform } from "../../lib/messages.ts";

/** 20 s of loudness at 50 ms per value. */
const KEEP = 400;

/** The last seconds of each player's loudness, for the popup's waveforms. */
export function createWaveforms() {
  const waves = new Map<string, Waveform>();

  function add(id: string, audio: AudioReport) {
    const previous = waves.get(id)?.values ?? [];
    const values = [...previous, ...audio.envelope].slice(-KEEP);
    waves.set(id, { end: audio.end, values });
  }

  return { add, get: (id: string) => waves.get(id), delete: (id: string) => waves.delete(id) };
}
