/** End an explicitly abandoned remote cleanup without inferring a permanent outage. */
import type { Store } from "../contract.js";
import type { MigrateReport, StoreCommandResult } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { removeMoveRecord, type RecordedMove } from "./migrate-record.js";
import { remoteSwitchUndo, switchRemoteMove } from "./migrate-remote-switch.js";
import { followSwitchUndo, switchRefFollow } from "./follow-switch.js";
import { switchBegun } from "./migrate-switch-undo.js";
import { fetchMigrationRemote } from "./migrate-remote-fetch.js";
import { clearRemoteGathering, readRemoteCopyReport, readCopiedRemoteRefs } from "./migrate-remote-copy.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { withdrawRecordedSource } from "./leave-recorded-withdraw.js";
import { readSyncRefs } from "./sync-graph.js";

/** A responding destination, including an empty one, never licenses withdrawing its source's control; a begun switch finishes first. */
export async function endRecordedSource(context: RefBackendContext, store: Store, code: RefBackendContext,
  recorded: RecordedMove): Promise<StoreCommandResult<MigrateReport>> {
  if (recorded.record.kind !== "remote" && recorded.record.kind !== "follow") throw new Error("Expected a remote move or follow");
  try {
    const report = await readRemoteCopyReport(code);
    const switched = await finishBegunSwitch(context, store, recorded);
    if (!await destinationAnswers(code, recorded)) await reportUnreadDestination(code, recorded, switched, report);
    report.notices.push({ condition: `The recorded cleanup ended without deleting state at ${recorded.record.source.fetchUrl}; its existing publications remain there.` });
    for (const ref of (await readCopiedRemoteRefs(code, "state")).keys()) report.notices.push({ condition: `The captured source view held ${ref} at ${recorded.record.source.fetchUrl}; ending the record does not unpublish it.` });
    const keptRef = "refs/arc/tmp/migrate/deleted-record", kept = (await readSyncRefs(code, keptRef)).get(keptRef);
    if (kept) report.notices.push({ condition: `An earlier copy removed forwarding record ${kept} from ${recorded.record.destination.fetchUrl}; clones relying on it may sync with a stranded copy.`,
      remedy: { text: `Restore that record by hand: an admitted writer can push ${kept} from ${keptRef} in this clone to refs/arc/project/moved at ${recorded.record.destination.pushUrl}.` } });
    await removeMoveRecord(code, recorded);
    await clearRemoteGathering(code);
    return { status: "ok", result: report };
  } catch (error) {
    if (error instanceof MigrationRefusal) return { status: "refused", refusal: error.refusal };
    throw error;
  }
}

/** An unread destination re-homes nothing; a remote move withdraws its own forwarding, and only a switch's pointer needs reverting. */
async function reportUnreadDestination(code: RefBackendContext, recorded: RecordedMove, switched: boolean, report: MigrateReport): Promise<void> {
  if (recorded.record.kind !== "remote" && recorded.record.kind !== "follow") throw new Error("Expected a remote move or follow");
  report.notices.push({ condition: `The recorded destination ${recorded.record.destination.fetchUrl} could not be read; ending this record does not repair or re-home this clone.`,
    remedy: { text: "Restore the state's intended home, have the mover withdraw its forwarding record where needed, then leave the unavailable source to that restored home." } });
  if (recorded.record.kind !== "remote") return;
  const restored = await withdrawRecordedSource(code, { record: recorded.record, tip: recorded.tip });
  if (restored && switched) report.notices.push({ condition: `The old remote ${recorded.record.source.fetchUrl} is the state's home again. Revert the tracked pointer change in this checkout and as code for followers.`,
    remedy: { text: recorded.record.source.repository === "backing"
      ? `Restore storage.backing_repository to ${recorded.record.source.url}, then run arc store migrate --leave-source to that pointer's home. Other clones may leave the deleted destination after this withdrawal.`
      : `Remove storage.backing_repository, then run arc store migrate --leave-source --to ${recorded.record.source.name}. Other clones may leave the deleted destination after this withdrawal.` } });
}

/** True once this clone is switched: a switch the record shows begun finishes from it, and one never begun leaves the clone as it was. */
async function finishBegunSwitch(context: RefBackendContext, store: Store, recorded: RecordedMove): Promise<boolean> {
  if (recorded.record.kind === "remote") {
    const remote = { record: recorded.record, tip: recorded.tip };
    if (!await switchBegun(context, remoteSwitchUndo(remote))) return false;
    await switchRemoteMove(context, store, remote);
    return true;
  }
  if (recorded.record.kind !== "follow") throw new Error("Expected a remote move or follow");
  const follow = { record: recorded.record, tip: recorded.tip };
  if (!await switchBegun(context, followSwitchUndo(follow))) return false;
  await switchRefFollow(context, store, follow);
  return true;
}

async function destinationAnswers(code: RefBackendContext, recorded: RecordedMove): Promise<boolean> {
  if (recorded.record.kind !== "remote" && recorded.record.kind !== "follow") throw new Error("Expected a remote move or follow");
  try { await fetchMigrationRemote(code, recorded.record.destination, false); return true; }
  catch (error) {
    if (error instanceof MigrationRefusal && error.refusal.code === "store" && error.refusal.refusal.code === "unreachable") return false;
    throw error;
  }
}
