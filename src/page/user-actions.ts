import type { PlayerCommand } from "../lib/messages.ts";

export type MediaEvent = "seeked" | "play" | "pause" | "ratechange";

const EVENT_FOR: Partial<Record<PlayerCommand["type"], MediaEvent>> = {
  seek: "seeked",
  play: "play",
  pause: "pause",
  setRate: "ratechange",
};

// A command's media event arrives within this many seconds, or it never will.
const OWN_EVENT_WINDOW = 3;
// Real YouTube can fire more than the one event a command causes (e.g. a pause/play around
// a seek), and a stray pause read as the user's pauses the whole group. So pause and play
// events this soon after one of our commands are ours. Seeks and speed changes still count:
// ignoring a real seek of the user's would be worse than a stray one.
const QUIET_AFTER_COMMAND = 1.5;
const QUIET_EVENTS: ReadonlySet<MediaEvent> = new Set(["pause", "play"]);

/**
 * Counts what the user does to a player (seek, play, pause, speed), leaving out the media
 * events our own commands cause, so they don't echo back as user actions.
 */
export function createUserActionTracker(now: () => number) {
  const expected: { event: MediaEvent; until: number }[] = [];
  let quietUntil = Number.NEGATIVE_INFINITY;
  let count = 0;

  /** Call before carrying out one of our commands. */
  function expectFrom(command: PlayerCommand) {
    const event = EVENT_FOR[command.type];
    if (event) {
      expected.push({ event, until: now() + OWN_EVENT_WINDOW });
      quietUntil = now() + QUIET_AFTER_COMMAND;
    }
  }

  /** Call for every media event; returns true when it was the user's doing. */
  function observe(event: MediaEvent): boolean {
    const time = now();
    const index = expected.findIndex((item) => item.event === event && item.until >= time);
    if (index >= 0) {
      expected.splice(index, 1);
      return false;
    }
    if (time <= quietUntil && QUIET_EVENTS.has(event)) {
      return false;
    }
    count += 1;
    return true;
  }

  return { expectFrom, observe, count: () => count };
}
