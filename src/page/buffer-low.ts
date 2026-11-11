// Long enough to cover a few of the 5 s segments normal-latency streams arrive in.
const WINDOW_SECONDS = 15;

/**
 * The lowest buffer a live player had over the last 15 s. Buffers rise and fall by a whole
 * segment (a saw-tooth); a jump ahead by the lowest point leaves enough at the next dip.
 */
export function createBufferLowTracker() {
  const readings: { buffer: number; at: number }[] = [];

  function update(buffer: number, now: number): number {
    readings.push({ buffer, at: now });
    while (readings.length > 0 && (readings[0]?.at ?? now) < now - WINDOW_SECONDS) {
      readings.shift();
    }
    return Math.min(...readings.map((reading) => reading.buffer));
  }

  /** After a jump the old readings no longer apply. */
  function reset() {
    readings.length = 0;
  }

  return { update, reset };
}
