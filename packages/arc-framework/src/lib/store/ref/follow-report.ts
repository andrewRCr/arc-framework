/** Describe the known state a follow leaves before clearing its copied and acquired snapshots. */

import type { MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { readMoveReport, type MoveRemote, type RecordedFollow } from "./migrate-record.js";
import { readCopiedRemoteRefs, readRemoteCopyReport } from "./migrate-remote-copy.js";
import { readMigrationGathering } from "./migrate-remote-fetch.js";
import { appendCleanupReport } from "./migrate-report.js";

/** Keep the landed copy's actions and each remote's last acquired refs in an ended follow report. */
export async function describeEndedFollow(code: RefBackendContext, recorded: RecordedFollow): Promise<MigrateReport> {
  const report = await readRemoteCopyReport(code);
  const carried = await readMoveReport(code, recorded.tip);
  if (carried) appendCleanupReport(report, carried);
  await appendCopiedFollowRefs(code, recorded, report);
  for (const remote of [recorded.record.source, recorded.record.destination]) {
    appendFollowReadRefs(report, remote, await readMigrationGathering(code, remote));
  }
  return report;
}

/** Name the source refs this follow copied, without claiming they still stand after another move. */
export async function appendCopiedFollowRefs(code: RefBackendContext, recorded: RecordedFollow, report: MigrateReport): Promise<void> {
  appendKnownFollowRefs(report, recorded.record.source, await readCopiedRemoteRefs(code, "state"), "copied source view");
}

/** Preserve a successful remote observation when cleanup ends before deleting any of its refs. */
export function appendFollowReadRefs(report: MigrateReport, remote: MoveRemote, refs: ReadonlyMap<string, string>): void {
  appendKnownFollowRefs(report, remote, refs, "last read");
}

function appendKnownFollowRefs(report: MigrateReport, remote: MoveRemote, refs: ReadonlyMap<string, string>, observation: string): void {
  const known = new Set(report.notices.map(({ condition }) => condition));
  for (const ref of refs.keys()) {
    const condition = `The follow's ${observation} at ${remote.fetchUrl} held ${ref}.`;
    if (known.has(condition)) continue;
    report.notices.push({ condition }); known.add(condition);
  }
}
