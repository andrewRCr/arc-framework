/** Clear a followed source in freshly licensed rounds after the explicit designation switch. */
import { readFollowRemote } from "./follow-candidates.js";
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
      if (source.get(FORWARDING_REF) !== recorded.record.forwardingTip) {
        await retainChangedSourceFollow(code, recorded, report); return;
      }
      const ordinary = new Map([...source].filter(([ref]) => ref !== FORWARDING_REF));
      if (!ordinary.size) return;
      if (!await recopyFollowRound(code, recorded, ordinary, destination, report)) continue;
      await code.migrateStep?.("follow.delete");
      const deletes = [...ordinary].map(([ref, expected]) => ({ ref, next: null, expected }));
      const deleted = await atomicMigrationPush(code, recorded.record.source.pushUrl, deletes);
      if (!await migrationPushLanded(code, recorded.record.source.pushUrl, deletes, deleted)) continue;
      report.refs.push(...remoteCopyReport(ordinary, new Map(), []).refs.map(row => ({ ...row, action: "delete" as const })));
      await code.migrateStep?.("follow.deleted");
    }
  } catch (error) {
    if (!(error instanceof MigrationRefusal)) throw error;
    throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable", condition: `The recorded follow could not finish cleanup: ${error.message}`,
      remedy: { text: "Repair the reported remote, then retry arc store migrate with no target.", argv: ["arc", "store", "migrate"] } });
  }
}

async function recopyFollowRound(code: RefBackendContext, recorded: RecordedFollow, ordinary: Map<string, string>,
  destination: Map<string, string>, report: MigrateReport): Promise<boolean> {
  await code.migrateStep?.("follow.recopy");
  const prepared = await readFollowRemote(recorded.record.destination.name, () => prepareRemoteReCopy(code, ordinary, destination));
  const changes = remoteCopyChanges(prepared.refs, destination).filter(row => row.next !== row.expected);
  if (changes.length) {
    const copied = await atomicMigrationPush(code, recorded.record.destination.pushUrl, changes);
    if (!await migrationPushLanded(code, recorded.record.destination.pushUrl, changes, copied)) return false;
  }
  await retainRemoteCopiedState(code, ordinary);
  report.notices.push(...prepared.notices);
  await code.migrateStep?.("follow.recopied");
  return true;
}

async function retainLaterFollow(code: RefBackendContext, recorded: RecordedFollow, destination: ReadonlyMap<string, string>, report: MigrateReport): Promise<boolean> {
  const tip = destination.get(FORWARDING_REF);
  if (!tip) return false;
  const moved = await readForwardingRecord(code, tip, recorded.record.destination.name);
  if (moved.status === "refused") throw new MigrationRefusal(moved.refusal);
  const physical = await readRefRepository(code.repository?.source ?? code);
  await fetchLayoutObjects(physical, code.repository?.commonDir ?? code.checkoutRoot, new Map([[FORWARDING_REF, tip]]));
  const ref = `refs/arc-remotes/${recorded.record.destination.name}/project/moved`, expected = (await readSyncRefs(physical, ref)).get(ref) ?? null;
  await requireLayoutTransaction(physical, [{ ref, next: tip, expected }]);
  report.notices.push({ condition: "A later move ended this follow's cleanup. No remaining source refs were deleted; follow the new forwarding record.",
    remedy: { text: "Bring in the latest tracked pointer, then run arc store migrate.", argv: ["arc", "store", "migrate"] } });
  return true;
}

async function retainChangedSourceFollow(code: RefBackendContext, recorded: RecordedFollow, report: MigrateReport): Promise<void> {
  const current = await fetchMigrationRemote(code, recorded.record.destination, false);
  await retainLaterFollow(code, recorded, current, report);
}
