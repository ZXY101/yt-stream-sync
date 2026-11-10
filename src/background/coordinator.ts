import type { Action, SyncSettings } from "../controller/types.ts";
import type { PlayerCommand, PlayerReport, SyncStatus } from "../lib/messages.ts";
import { createGroupAudio, type MemberView } from "./audio/group-audio.ts";
import { createControllers } from "./controllers.ts";
import { toCommand, toStatus, type SyncInfo } from "./convert.ts";
import { createGroup } from "./group.ts";
import { createReportStore } from "./reports.ts";

export interface CoordinatorOptions {
  send: (id: string, command: PlayerCommand) => void;
  /** Settings the user doesn't set per player (the group and nudges live here). */
  settings: () => Pick<SyncSettings, "enabled" | "safetyMargin">;
  /** Seconds on a monotonic clock. */
  now: () => number;
}

/** The user just seeked, played, paused or changed speed on this archive. */
function wasTouched(report: PlayerReport, previous: PlayerReport | undefined): boolean {
  if (report.kind !== "archive" || previous?.kind !== "archive") {
    return false;
  }
  return report.userActions > previous.userActions;
}

type Reports = ReturnType<typeof createReportStore>;

/** `change`, then `after`: for user actions that should take effect straight away. */
function thenRun<A extends unknown[]>(change: (...args: A) => void, after: () => void) {
  return (...args: A) => {
    change(...args);
    after();
  };
}

/** Sends each action, and assumes it done until the player reports back. */
function sendAll(actions: Action[], send: CoordinatorOptions["send"], reports: Reports) {
  for (const action of actions) {
    const command = toCommand(action);
    send(action.id, command);
    reports.assume(action.id, command);
  }
}

/** Live streams and archives are both in the group: they can't be synced together. */
function isMixed(ids: readonly string[], reports: Reports): boolean {
  return new Set(ids.map((id) => reports.get(id)?.kind)).size > 1;
}

function memberViews(ids: string[], reports: Reports, errors: Record<string, number>) {
  return ids.flatMap((id): MemberView[] => {
    const report = reports.get(id);
    return report ? [{ id, report, error: errors[id] }] : [];
  });
}

interface StatusParts {
  reports: Reports;
  group: ReturnType<typeof createGroup>;
  audio: ReturnType<typeof createGroupAudio>;
  errors: Record<string, number>;
}

function buildStatus({ reports, group, audio, errors }: StatusParts): Omit<SyncStatus, "mixed"> {
  const players = reports.all().map(([id, report]) => {
    const inGroup = group.has(id);
    const waveform = inGroup ? audio.waveform(id) : undefined;
    const sync: SyncInfo = { inGroup, offset: group.offset(id), error: errors[id], waveform };
    return toStatus(id, report, sync);
  });
  return { players, audio: audio.status() };
}

/**
 * Knows every frame with a live stream or archive, and runs the matching controller over the
 * players the user opted in. Live streams and archives can't be synced together.
 */
export function createCoordinator(options: CoordinatorOptions) {
  const reports = createReportStore(options.now);
  const group = createGroup((id) => reports.get(id)?.videoId);
  const controllers = createControllers();
  const audio = createGroupAudio({ send: options.send, adjust: group.nudge, now: options.now });
  let errors: Record<string, number> = {};

  function remove(id: string) {
    reports.delete(id);
    group.remove(id);
    audio.onReport(id, null);
  }

  function report(id: string, playerReport: PlayerReport | null) {
    if (!playerReport) {
      remove(id);
      return;
    }
    const previous = reports.set(id, playerReport);
    audio.onReport(id, playerReport);
    // The others follow what the user just did now, not on the next second.
    if (wasTouched(playerReport, previous) && group.has(id)) {
      tick();
    }
  }

  function tick() {
    const ids = group.ids();
    const groupIds = isMixed(ids, reports) ? [] : ids;
    const settings = { ...options.settings(), group: groupIds, offsets: group.offsets() };
    const result = controllers.run(reports.fresh(), settings);
    errors = result.errors;
    sendAll(result.actions, options.send, reports);
    audio.afterTick(memberViews(groupIds, reports, errors));
  }

  function status(): SyncStatus {
    return {
      ...buildStatus({ reports, group, audio, errors }),
      mixed: isMixed(group.ids(), reports),
    };
  }

  // Applied now, so the user sees each press take effect. Clearing hands everyone back.
  const nudge = thenRun(group.nudge, tick);
  const clearGroup = thenRun(group.clear, tick);

  const audioApi = {
    receiveClip: audio.receiveClip,
    setAudioSync: audio.setEnabled,
    rematchAudio: audio.rematch,
  };
  return { report, remove, setInGroup: group.set, clearGroup, nudge, tick, status, ...audioApi };
}
