import type { PlayerCommand } from "../lib/messages.ts";

export type MediaEvent = "seeked" | "play" | "pause" | "ratechange";

const EVENT_FOR: Record<PlayerCommand["type"], MediaEvent> = {
  seek: "seeked",
  play: "play",
  pause: "pause",
  setRate: "ratechange",
};

// A command's media event arrives within this many seconds, or it never will.
const OWN_EVENT_WINDOW = 3;

/**
 * Counts what the user does to a player (seek, play, pause, speed), leaving out the media
 * events our own commands cause, so they don't echo back as user actions.
 */
export function createUserActionTracker(now: () => number) {
  const expected: { event: MediaEvent; until: number }[] = [];
  let count = 0;

  /** Call before carrying out one of our commands. */
  function expectFrom(command: PlayerCommand) {
    expected.push({ event: EVENT_FOR[command.type], until: now() + OWN_EVENT_WINDOW });
  }

  /** Call for every media event; returns true when it was the user's doing. */
  function observe(event: MediaEvent): boolean {
    const time = now();
    const index = expected.findIndex((item) => item.event === event && item.until >= time);
    if (index >= 0) {
      expected.splice(index, 1);
      return false;
    }
    count += 1;
    return true;
  }

  return { expectFrom, observe, count: () => count };
}
