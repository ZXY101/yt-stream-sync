import { envelope } from "./pcm.ts";

export const AUDIO_RATE = 4000;
/** Waveform resolution: one loudness value per 50 ms. */
const ENVELOPE_STEP = 0.05;
const ENVELOPE_BLOCK = AUDIO_RATE * ENVELOPE_STEP;

export interface Clip {
  /** Wall-clock time (ms since 1970) of the first sample. */
  start: number;
  samples: Float32Array;
}

export interface EnvelopeChunk {
  /** Wall-clock time (ms) at the end of the last value. */
  end: number;
  values: number[];
}

/**
 * The last `seconds` of a player's audio at 4 kHz, with the wall-clock time of the newest
 * sample, so clips from different players can be lined up by when they played.
 */
export function createAudioRing(seconds = 36) {
  const buffer = new Float32Array(seconds * AUDIO_RATE);
  let written = 0;
  let newestWall = 0;
  let pending: number[] = [];
  let pendingEnd = 0;

  /** Adds 4 kHz samples whose last one played at `endWall` (ms). */
  function push(samples: Float32Array, endWall: number) {
    for (const sample of samples) {
      buffer[written % buffer.length] = sample;
      written += 1;
      pending.push(sample);
    }
    newestWall = endWall;
    pendingEnd = endWall;
  }

  /** The newest `clipSeconds` of audio, or less if not that much has been heard yet. */
  function clip(clipSeconds: number): Clip {
    const length = Math.min(written, buffer.length, Math.round(clipSeconds * AUDIO_RATE));
    const samples = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      samples[index] = buffer[(written - length + index) % buffer.length] as number;
    }
    return { start: newestWall - (length / AUDIO_RATE) * 1000, samples };
  }

  /** Loudness values for the audio heard since the last call, for the waveform. */
  function takeEnvelope(): EnvelopeChunk {
    const whole = pending.length - (pending.length % ENVELOPE_BLOCK);
    const values = envelope(Float32Array.from(pending.slice(0, whole)), ENVELOPE_BLOCK);
    const leftover = pending.length - whole;
    const end = pendingEnd - (leftover / AUDIO_RATE) * 1000;
    pending = pending.slice(whole);
    return { end, values };
  }

  return { push, clip, takeEnvelope, heardSeconds: () => written / AUDIO_RATE };
}
