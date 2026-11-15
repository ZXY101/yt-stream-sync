import type { AudioStatus } from "../lib/messages.ts";

export interface AudioMessage {
  text: string;
  /** Offer to match again. */
  retry: boolean;
  /** 0–1 while listening. */
  progress?: number;
}

/**
 * Matching needs two streams playing steadily in sync for 30 s; until then nothing moves.
 * After a try that didn't match, say so rather than "waiting" again.
 */
function listeningMessage(status: Extract<AudioStatus, { state: "listening" }>): AudioMessage {
  const { progress } = status;
  if (status.tries !== undefined && status.tries > 0) {
    const text = "Couldn't match the audio yet. Listening again for another try…";
    return { text, retry: false, progress };
  }
  if (progress > 0) {
    return { text: "Listening to line up the audio…", retry: false, progress };
  }
  const text = "Waiting for two streams to play steadily in sync before listening…";
  return { text, retry: false, progress: 0 };
}

function matchedMessage(status: Extract<AudioStatus, { state: "matched" }>): AudioMessage {
  const waiting = status.waiting?.length ?? 0;
  if (waiting === 0) {
    return { text: "Lined up by audio.", retry: true };
  }
  const streams = waiting === 1 ? "1 more stream" : `${waiting} more streams`;
  return { text: `Lined up by audio. Waiting for ${streams} to play steadily.`, retry: true };
}

/** What to tell the user about audio matching. `undefined`: nothing worth saying. */
export function audioMessage(status: AudioStatus): AudioMessage | undefined {
  switch (status.state) {
    case "off":
      return {
        text: "Matching by audio is off. Line streams up with the nudge buttons.",
        retry: false,
      };
    case "listening":
      return listeningMessage(status);
    case "matching":
      return { text: "Comparing the audio…", retry: false };
    case "matched":
      return matchedMessage(status);
    case "failed":
      return status.reason === "no-shared-sound"
        ? { text: "Couldn't match the audio: these streams may not share any sound.", retry: true }
        : { text: "Couldn't hear enough audio to match.", retry: true };
    case "blocked":
      return {
        text: "Click once inside each stream's video, so the browser lets the add-on hear it.",
        retry: false,
      };
    case "unavailable":
      return {
        text: "One of the streams can't be heard, so it can't be matched by audio.",
        retry: false,
      };
    default:
      return undefined;
  }
}
