import type { AudioStatus } from "../lib/messages.ts";

export interface AudioMessage {
  text: string;
  /** Offer to match again. */
  retry: boolean;
  /** 0–1 while listening. */
  progress?: number;
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
      return { text: "Listening to line up the audio…", retry: false, progress: status.progress };
    case "matching":
      return { text: "Comparing the audio…", retry: false };
    case "matched":
      return { text: "Lined up by audio.", retry: true };
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
