import type { PlayerReport } from "../../lib/messages.ts";
import type { YtdlpzSettings } from "../../lib/ytdlpz.ts";
import { createAlignJob } from "./align-job.ts";
import { createAlignClient, type AlignClient } from "./client.ts";
import { watchUrl, type AlignMember } from "./offsets.ts";

interface GroupView {
  ids: () => string[];
  offset: (id: string) => number;
  /** Moves a member's offset by this many seconds. */
  nudge: (id: string, seconds: number) => void;
  report: (id: string) => PlayerReport | undefined;
}

interface GroupAlignOptions {
  group: GroupView;
  /** After offsets were applied (audio matching then fine-tunes them). */
  onApplied: () => void;
  now: () => number;
  fetcher?: typeof fetch;
}

/** The group's members as alignment needs them: archives with a broadcast start time. */
function alignMembers(group: GroupView): AlignMember[] | undefined {
  const members: AlignMember[] = [];
  for (const id of group.ids()) {
    const report = group.report(id);
    if (report?.kind !== "archive" || report.startTime === undefined) {
      return undefined;
    }
    const url = watchUrl(report.videoId);
    members.push({ id, url, startTime: report.startTime, offset: group.offset(id) });
  }
  return members;
}

function sameMembers(running: string[], current: string[]): boolean {
  return running.length === current.length && running.every((id) => current.includes(id));
}

/** Lining the sync group's archives up through the user's yt-dlp-z, when they set it up. */
export function createGroupAlign(options: GroupAlignOptions) {
  const { group } = options;
  let client: AlignClient | undefined;

  function apply(targets: Record<string, number>) {
    for (const [id, target] of Object.entries(targets)) {
      group.nudge(id, target - group.offset(id));
    }
    options.onApplied();
  }

  const job = createAlignJob({ client: () => client, apply, now: options.now });

  function setSettings(settings: YtdlpzSettings | undefined) {
    job.cancel();
    client = settings?.enabled ? createAlignClient(settings, options.fetcher) : undefined;
  }

  function start() {
    const members = alignMembers(group);
    if (members) {
      job.start(members);
    }
  }

  /**
   * Called every second: polls. When the group changed, a running alignment stops and an
   * old outcome is forgotten, so the popup never shows one group's result for another.
   */
  function tick() {
    const shown = job.shownFor();
    if (shown.length > 0 && !sameMembers(shown, group.ids())) {
      job.cancel();
    }
    job.tick();
  }

  return { setSettings, start, cancel: job.cancel, tick, status: job.status };
}
