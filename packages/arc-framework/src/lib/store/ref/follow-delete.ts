/** Clear a followed source in freshly licensed rounds after the explicit designation switch. */
import { appendCleanupReport, retainCleanupDeleteBasis, settleCleanupDeletes } from "./migrate-cleanup-report.js";
import type { MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import type { RecordedFollow } from "./migrate-record.js";
import { fetchMigrationRemote } from "./migrate-remote-fetch.js";
import { readRefRepository } from "./repository.js";
import { fetchLayoutObjects, requireLayoutTransaction } from "./migrate-layout-build.js";
import { readSyncRefs } from "./sync-graph.js";
import { FORWARDING_REF, readForwardingRecord } from "./forwarding-record.js";
import { requireFollowDestination } from "./follow-copy.js";
import { prepareRemoteReCopy, remoteCopyChanges, atomicMigrationPush, migrationPushLanded,
  remoteCopyReport, retainRemoteCopiedState } from "./migrate-remote-copy.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { withRefFetchKeepers } from "./fetch-seen.js";
import { appendCopiedFollowRefs, appendFollowReadRefs } from "./follow-report.js";

/** A delete never starts until both remotes and the complete re-copy have been observed in this round. */
export async function deleteFollowSource(code: RefBackendContext, recorded: RecordedFollow, report: MigrateReport): Promise<void> {
  try {
    for (;;) {
      await code.migrateStep?.("follow.read-destination");
      const destination = await fetchMigrationRemote(code, recorded.record.destination, true);
      if (await retainLaterFollow(code, recorded, destination, report)) return;
      await requireFollowDestination(code, recorded.record, destination);
      await code.migrateStep?.("follow.list-source");
      const source = await fetchMigrationRemote(code, recorded.record.source, true);
      await settleCleanupDeletes(code, source, report);
      if (source.get(FORWARDING_REF) !== recorded.record.forwardingTip) {
        await retainChangedSourceFollow(code, recorded, { source, destination }, report); return;
      }
      const ordinary = new Map([...source].filter(([ref]) => ref !== FORWARDING_REF));
      if (!ordinary.size) return;
      if (!await recopyFollowRound(code, recorded, ordinary, destination, report)) continue;
      await retainCleanupDeleteBasis(code, ordinary);
      await code.migrateStep?.("follow.delete");
      const deletes = [...ordinary].map(([ref, expected]) => ({ ref, next: null, expected }));
      const deleted = await atomicMigrationPush(code, recorded.record.source.pushUrl, deletes);
      if (!await migrationPushLanded(code, recorded.record.source.pushUrl, deletes, deleted)) continue;
      await settleCleanupDeletes(code, new Map(), report);
      await code.migrateStep?.("follow.deleted");
    }
  } catch (error) { throw followCleanupFailure(error); }
}

function followCleanupFailure(error: unknown): unknown {
  if (!(error instanceof MigrationRefusal)) return error;
  if (error.refusal.code === "store" && error.refusal.refusal.code === "namespace-corrupt") return error;
  return new MigrationRefusal({ code: "move-unfinished", class: "recoverable", condition: `The recorded follow could not finish cleanup: ${error.message}`,
    remedy: { text: "Repair the reported remote, then retry arc store migrate with no target. Where the old remote is gone for good, end the follow without its deletes with arc store migrate --leave-source.",
      argv: ["arc", "store", "migrate"] } });
}

async function recopyFollowRound(code: RefBackendContext, recorded: RecordedFollow, ordinary: Map<string, string>,
  destination: Map<string, string>, report: MigrateReport): Promise<boolean> {
  await code.migrateStep?.("follow.recopy");
  const prepared = await prepareRemoteReCopy(code, ordinary, destination);
  const changes = remoteCopyChanges(prepared.refs, destination).filter(row => row.next !== row.expected);
  if (changes.length) {
    const copied = await atomicMigrationPush(code, recorded.record.destination.pushUrl, changes);
    if (!await migrationPushLanded(code, recorded.record.destination.pushUrl, changes, copied)) return false;
  }
  appendCleanupReport(report, { refs: remoteCopyReport(new Map(changes.flatMap(row => row.next ? [[row.ref, row.next] as const] : [])),
    destination, []).refs.filter(row => changes.some(change => change.ref === row.ref)), notices: prepared.notices });
  await retainRemoteCopiedState(code, ordinary, report);
  await code.migrateStep?.("follow.recopied");
  return true;
}

async function retainLaterFollow(code: RefBackendContext, recorded: RecordedFollow, destination: ReadonlyMap<string, string>, report: MigrateReport): Promise<boolean> {
  const tip = destination.get(FORWARDING_REF);
  if (!tip) return false;
  const moved = await readForwardingRecord(code, tip, recorded.record.destination.name);
  if (moved.status === "refused") throw new MigrationRefusal(moved.refusal);
  const physical = await readRefRepository(code.repository?.source ?? code);
  await withRefFetchKeepers(physical, recorded.record.destination.name, async () => {
    await fetchLayoutObjects(physical, code.repository?.commonDir ?? code.checkoutRoot, new Map([[FORWARDING_REF, tip]]));
    const ref = `refs/arc-remotes/${recorded.record.destination.name}/project/moved`, expected = (await readSyncRefs(physical, ref)).get(ref) ?? null;
    await requireLayoutTransaction(physical, [{ ref, next: tip, expected }]);
  });
  await appendCopiedFollowRefs(code, recorded, report);
  appendFollowReadRefs(report, recorded.record.destination, destination);
  report.notices.push({ condition: "A later move ended this follow's cleanup. No remaining source refs were deleted; follow the new forwarding record.",
    remedy: { text: "Bring in the latest tracked pointer, then run arc store migrate.", argv: ["arc", "store", "migrate"] } });
  return true;
}

async function retainChangedSourceFollow(code: RefBackendContext, recorded: RecordedFollow,
  observed: { source: ReadonlyMap<string, string>; destination: ReadonlyMap<string, string> }, report: MigrateReport): Promise<void> {
  appendFollowReadRefs(report, recorded.record.source, observed.source);
  appendFollowReadRefs(report, recorded.record.destination, observed.destination);
  const current = await fetchMigrationRemote(code, recorded.record.destination, false);
  appendFollowReadRefs(report, recorded.record.destination, current);
  if (await retainLaterFollow(code, recorded, current, report)) return;
  report.notices.push({ condition: "The old source's forwarding record changed or was withdrawn; this follow ended cleanup without further source deletes.",
    remedy: { text: "Review the state's current home and bring in its tracked pointer, then run arc store migrate if another follow is due.", argv: ["arc", "store", "migrate"] } });
}
