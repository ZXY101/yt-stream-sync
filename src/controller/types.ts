export type PlayerState = "playing" | "paused" | "buffering" | "ad" | "ended";

export interface SyncSettings {
  enabled: boolean;
  /** Ids of the players the user opted in. Nothing outside this list is ever touched. */
  group: readonly string[];
  /** Manual nudge per player id: positive shows that player ahead of the others (newer). */
  offsets: Readonly<Record<string, number>>;
  /** Extra seconds of buffer every player keeps, for shaky streams (0–3). */
  safetyMargin: number;
}

export type Action =
  | { type: "setRate"; id: string; rate: number }
  | { type: "seek"; id: string; position: number }
  | { type: "skip"; id: string; seconds: number }
  | { type: "pause"; id: string }
  | { type: "play"; id: string };
