import type { AlignStatus } from "../../lib/messages.ts";
import { AlignError, type AlignClient, type AlignJobStatus } from "./client.ts";
import { alignedOffsets, type AlignMember } from "./offsets.ts";

// The server's progress moves slowly (downloads take a minute or two).
const POLL_SECONDS = 2;

interface AlignJobOptions {
  /** The client for the user's yt-dlp-z; undefined while alignment isn't set up. */
  client: () => AlignClient | undefined;
  /** Sets these sync-group offsets (seconds per player). */
  apply: (targets: Record<string, number>) => void;
  /** Seconds on a monotonic clock. */
  now: () => number;
}

interface Job {
  client: AlignClient;
  members: AlignMember[];
  id?: string;
  lastPoll: number;
  polling: boolean;
}

/** What the alignment is doing: the running job, or the last outcome. */
interface Tracker {
  job?: Job;
  last: AlignStatus;
  progress: number;
}

function message(error: unknown): string {
  return error instanceof AlignError ? error.message : "Alignment failed unexpectedly.";
}

/** Ends `current` (if it's still the running job) and always deletes it on the server. */
function finish(tracker: Tracker, current: Job, outcome: AlignStatus) {
  if (tracker.job !== current) {
    return;
  }
  if (current.id) {
    void current.client.remove(current.id);
  }
  tracker.job = undefined;
  tracker.last = outcome;
}

async function launch(tracker: Tracker, current: Job) {
  try {
    current.id = await current.client.start(current.members.map((member) => member.url));
  } catch (error) {
    finish(tracker, current, { state: "failed", message: message(error) });
    return;
  }
  // Cancelled while starting: the server still made the job, so delete it.
  if (tracker.job !== current) {
    void current.client.remove(current.id);
  }
}

function settle(tracker: Tracker, current: Job, result: AlignJobStatus, options: AlignJobOptions) {
  tracker.progress = result.progress;
  if (result.state === "failed") {
    const text = result.error ?? "yt-dlp-z couldn't align them.";
    finish(tracker, current, { state: "failed", message: text });
  } else if (result.state === "done") {
    const { targets, unmatched } = alignedOffsets(current.members, result.offsets);
    finish(tracker, current, { state: "done", unmatched });
    options.apply(targets);
  }
}

async function poll(tracker: Tracker, current: Job, options: AlignJobOptions) {
  current.polling = true;
  current.lastPoll = options.now();
  try {
    const result = await current.client.check(current.id as string);
    if (tracker.job === current) {
      settle(tracker, current, result, options);
    }
  } catch (error) {
    finish(tracker, current, { state: "failed", message: message(error) });
  } finally {
    current.polling = false;
  }
}

/**
 * One alignment at a time through yt-dlp-z: start it, poll until it's done, apply the
 * offsets, and always ask the server to delete it afterwards (it holds the streams' audio).
 */
export function createAlignJob(options: AlignJobOptions) {
  const tracker: Tracker = { last: { state: "ready" }, progress: 0 };

  function start(members: AlignMember[]) {
    const client = options.client();
    if (!client || tracker.job || members.length < 2) {
      return;
    }
    const current: Job = { client, members, lastPoll: options.now(), polling: false };
    tracker.job = current;
    tracker.progress = 0;
    void launch(tracker, current);
  }

  /** Called every second: polls the server when it's time. */
  function tick() {
    const current = tracker.job;
    const due = current && options.now() - current.lastPoll >= POLL_SECONDS;
    if (current?.id && !current.polling && due) {
      void poll(tracker, current, options);
    }
  }

  /** Stops a running alignment (deleting it on the server) and forgets the last result. */
  function cancel() {
    if (tracker.job) {
      finish(tracker, tracker.job, { state: "ready" });
    }
    tracker.last = { state: "ready" };
  }

  function status(): AlignStatus {
    if (!options.client()) {
      return { state: "off" };
    }
    return tracker.job ? { state: "running", progress: tracker.progress } : tracker.last;
  }

  /** The players a running alignment is for. */
  function runningFor(): string[] | undefined {
    return tracker.job?.members.map((member) => member.id);
  }

  return { start, tick, cancel, status, runningFor };
}
