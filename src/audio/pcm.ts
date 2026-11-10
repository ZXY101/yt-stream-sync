/** Averages blocks of `factor` samples: a cheap low-pass and downsample in one. */
export function decimate(samples: Float32Array, factor: number): Float32Array {
  const out = new Float32Array(Math.floor(samples.length / factor));
  for (let index = 0; index < out.length; index += 1) {
    let sum = 0;
    for (let offset = 0; offset < factor; offset += 1) {
      sum += samples[index * factor + offset] as number;
    }
    out[index] = sum / factor;
  }
  return out;
}

/** Loudness (RMS) of each block of `size` samples, for drawing a waveform. */
export function envelope(samples: Float32Array, size: number): number[] {
  const values: number[] = [];
  for (let start = 0; start + size <= samples.length; start += size) {
    let sum = 0;
    for (let index = start; index < start + size; index += 1) {
      sum += (samples[index] as number) ** 2;
    }
    values.push(Math.min(1, Math.sqrt(sum / size)));
  }
  return values;
}

// Messages between scripts are JSON in Chrome, so clips travel as base64-encoded 16-bit PCM.
export function encodePcm(samples: Float32Array): string {
  const ints = new Int16Array(samples.length);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index] as number));
    ints[index] = Math.round(clamped * 32767);
  }
  const bytes = new Uint8Array(ints.buffer);
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

export function decodePcm(text: string): Float32Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length - (binary.length % 2));
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const ints = new Int16Array(bytes.buffer);
  return Float32Array.from(ints, (value) => value / 32767);
}
