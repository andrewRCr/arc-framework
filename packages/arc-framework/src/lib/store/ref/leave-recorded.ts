/** End an explicitly abandoned remote cleanup without inferring a permanent outage. */
import type { Store } from "../contract.js";
import type { MigrateReport, StoreCommandResult } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { removeMoveRecord, type RecordedMove } from "./migrate-record.js";
import { switchRemoteMove } from "./migrate-remote-switch.js";
import { switchRefSource } from "./source-switch.js";
import { switchBegun } from "./migrate-switch-undo.js";
import { fetchMigrationRemote } from "./migrate-remote-fetch.js";
import { clearRemoteGathering, readRemoteCopyReport, readCopiedRemoteRefs, readCopiedDeletedRecord } from "./migrate-remote-copy.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { withdrawRecordedSource } from "./leave-recorded-withdraw.js";

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
    const kept = await readCopiedDeletedRecord(code);
    if (kept) report.notices.push({ condition: `An earlier copy removed forwarding record ${kept.tip} from ${recorded.record.destination.fetchUrl}; clones relying on it may sync with a stranded copy.`,
      remedy: { text: `Restore that record by hand: an admitted writer can push ${kept.tip} from ${kept.ref} in this clone to refs/arc/project/moved at ${recorded.record.destination.pushUrl}.` } });
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
  const { source, destination } = recorded.record;
  if (switched) report.notices.push({ condition: `The recorded destination ${destination.fetchUrl} could not be read; ending this record does not repair or re-home this clone.`,
    remedy: { text: "Restore the state's intended home, have the mover withdraw its forwarding record where needed, then leave the unavailable source to that restored home." } });
  else report.notices.push({ condition: `The recorded destination ${destination.fetchUrl} could not be read; this clone never switched to it and stays on its source ${source.fetchUrl}.`,
    ...recorded.record.kind === "follow" ? { remedy: { text: `Have the mover run arc store migrate --leave-source to withdraw its forwarding record at ${source.fetchUrl}, which keeps this follow due until then.` } } : {} });
  if (recorded.record.kind !== "remote") return;
  const restored = await withdrawRecordedSource(code, { record: recorded.record, tip: recorded.tip });
  if (restored && switched) report.notices.push({ condition: `The old remote ${recorded.record.source.fetchUrl} is the state's home again. Revert the tracked pointer change in this checkout and as code for followers.`,
    remedy: { text: recorded.record.source.repository === "backing"
      ? `Restore storage.backing_repository to ${recorded.record.source.url}, then run arc store migrate --leave-source to that pointer's home. Other clones may leave the deleted destination after this withdrawal.`
      : `Remove storage.backing_repository, then run arc store migrate --leave-source --to ${recorded.record.source.name}. Other clones may leave the deleted destination after this withdrawal.` } });
}

/** True once this clone is switched: a switch the record shows begun finishes from it, and one never begun leaves the clone as it was. */
async function finishBegunSwitch(context: RefBackendContext, store: Store, recorded: RecordedMove): Promise<boolean> {
  if (!await switchBegun(context, recorded)) return false;
  if (recorded.record.kind === "remote") await switchRemoteMove(context, store, { record: recorded.record, tip: recorded.tip });
  else if (recorded.record.kind === "follow") await switchRefSource(context, store, { record: recorded.record, tip: recorded.tip });
  else throw new Error("Expected a remote move or follow");
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
