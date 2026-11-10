import { initialArchiveState, stepArchive } from "../controller/archive/step.ts";
import { initialState, step } from "../controller/controller.ts";
import type { Action, SyncSettings } from "../controller/types.ts";
import type { PlayerReport } from "../lib/messages.ts";
import { toArchiveSample, toLiveSample } from "./convert.ts";

/** Both controllers and their state: live streams and archives each go to their own. */
export function createControllers() {
  let liveState = initialState();
  let archiveState = initialArchiveState();

  /** `reports` are [player id, report, seconds since it came in]. */
  function run(reports: [string, PlayerReport, number][], settings: SyncSettings) {
    const live = reports.flatMap(([id, r]) => (r.kind === "live" ? [toLiveSample(id, r)] : []));
    const archives = reports.flatMap(([id, r, age]) =>
      r.kind === "archive" ? [toArchiveSample(id, r, age)] : [],
    );
    const liveResult = step(liveState, live, settings);
    const archiveResult = stepArchive(archiveState, archives, settings);
    liveState = liveResult.state;
    archiveState = archiveResult.state;
    const actions: Action[] = [...liveResult.actions, ...archiveResult.actions];
    return { actions, errors: { ...liveResult.errors, ...archiveResult.errors } };
  }

  return { run };
}
