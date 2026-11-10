import type { Waveform as WaveformData } from "../lib/messages.ts";

/** Seconds of audio shown. */
const WINDOW = 15;
const STEP_MS = 50;
const WIDTH = 300;
const HEIGHT = 28;

interface WaveformProps {
  waveform: WaveformData | undefined;
  /** Wall-clock ms at the right edge, the same for every card so they line up. */
  now: number;
}

/**
 * The player's recent loudness on a shared time axis, to line streams up by eye. A visual
 * aid only, so it's hidden from screen readers; the card's text says where the stream is.
 */
export function Waveform({ waveform, now }: WaveformProps) {
  const start = now - WINDOW * 1000;
  const values = waveform?.values ?? [];
  const bars = values.map((level, index) => {
    const time = (waveform?.end ?? now) - (values.length - 1 - index) * STEP_MS;
    const x = ((time - start) / (WINDOW * 1000)) * WIDTH;
    const height = Math.max(1, Math.min(1, level * 4) * HEIGHT);
    return `M${x.toFixed(1)} ${((HEIGHT - height) / 2).toFixed(1)}v${height.toFixed(1)}`;
  });
  return (
    <svg
      aria-hidden="true"
      data-testid="waveform"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="mt-2 h-7 w-full rounded-sm bg-muted text-muted-foreground"
    >
      <path d={bars.join("")} stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}
