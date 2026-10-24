/** Finish remote moves through freshly licensed, leased re-copy and delete rounds. */
import type { MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import type { RecordedRemote } from "./migrate-record.js";
import { removeMoveRecord } from "./migrate-record.js";
import { fetchMigrationRemote } from "./migrate-remote-fetch.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { finishEndedRemoteMove } from "./migrate-remote-end.js";
import { FORWARDING_REF, readForwardingRecord } from "./forwarding-record.js";
import { atomicMigrationPush, clearRemoteGathering, migrationPushLanded, prepareRemoteReCopy,
  registryHoldsMove, remoteCopyChanges, remoteCopyReport, retainRemoteCopiedState } from "./migrate-remote-copy.js";

/** Every round proves both move versions before any remote write; interruptions retain the move record. */
export async function deleteRemoteSource(code: RefBackendContext, recorded: RecordedRemote): Promise<MigrateReport> {
  const report = remoteCopyReport(new Map(), new Map(), []);
  try {
    for (;;) {
      await code.migrateStep?.("remote.read-destination");
      const controls = await fetchMigrationRemote(code, recorded.record.destination, false);
      const currentDestination = await readDestinationLicense(code, recorded, controls);
      await code.migrateStep?.("remote.list-source");
      const source = await fetchMigrationRemote(code, recorded.record.source, true);
      const currentSource = await readSourceLicense(code, recorded, source);
      if (!currentDestination || !currentSource) return await finishEndedRemoteMove(code, recorded, { report, source, destination: controls }, "after");
      const ordinary = new Map([...source].filter(([ref]) => ref !== FORWARDING_REF));
      if (!ordinary.size) {
        await code.migrateStep?.("remote.finish");
        await removeMoveRecord(code, recorded);
        await clearRemoteGathering(code);
        return report;
      }
      const destination = await fetchMigrationRemote(code, recorded.record.destination, true);
      if (!await readDestinationLicense(code, recorded, destination)) return await finishEndedRemoteMove(code, recorded, { report, source, destination }, "after");
      if (!await recopyDeleteRound(code, recorded, ordinary, destination, report)) continue;
      await code.migrateStep?.("remote.delete");
      const deletes = [...ordinary].map(([ref, expected]) => ({ ref, next: null, expected }));
      const deleted = await atomicMigrationPush(code, recorded.record.source.pushUrl, deletes);
      if (!await migrationPushLanded(code, recorded.record.source.pushUrl, deletes, deleted)) continue;
      report.refs.push(...remoteCopyReport(ordinary, new Map(), []).refs.map(row => ({ ...row, action: "delete" as const })));
      await code.migrateStep?.("remote.deleted");
    }
  } catch (error) {
    if (!(error instanceof MigrationRefusal)) throw error;
    throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable", condition: `The recorded remote move could not finish cleanup: ${error.message}`,
      remedy: { text: "Repair the reported remote or receiver condition, then retry arc store migrate with no target. Where the old remote is gone for good, end the move without its deletes with arc store migrate --leave-source.",
        argv: ["arc", "store", "migrate"] } });
  }
}

async function recopyDeleteRound(code: RefBackendContext, recorded: RecordedRemote, ordinary: Map<string, string>, destination: Map<string, string>, report: MigrateReport): Promise<boolean> {
  await code.migrateStep?.("remote.recopy");
  const prepared = await prepareRemoteReCopy(code, ordinary, destination);
  const changes = remoteCopyChanges(prepared.refs, destination).filter(change => change.next !== change.expected);
  if (changes.length) {
    const copied = await atomicMigrationPush(code, recorded.record.destination.pushUrl, changes);
    if (!await migrationPushLanded(code, recorded.record.destination.pushUrl, changes, copied)) return false;
  }
  await retainRemoteCopiedState(code, ordinary);
  report.notices.push(...prepared.notices);
  await code.migrateStep?.("remote.recopied");
  return true;
}

async function readDestinationLicense(code: RefBackendContext, recorded: RecordedRemote, refs: ReadonlyMap<string, string>): Promise<boolean> {
  const forwarding = await readForwardingRecord(code, refs.get(FORWARDING_REF), recorded.record.destination.name);
  if (forwarding.status === "refused") throw new MigrationRefusal(forwarding.refusal);
  if (forwarding.result) return false;
  const registry = refs.get("refs/arc/project/registry");
  if (!registry || !await registryHoldsMove(code, recorded.record.registryCommit, registry)) throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable",
    condition: "The new remote no longer holds the recorded move's registry commit; the old remote may hold the only remaining copy.",
    remedy: { text: "Restore the new remote from a clone holding that registry commit, then retry arc store migrate." } });
  return true;
}

async function readSourceLicense(code: RefBackendContext, recorded: RecordedRemote, refs: ReadonlyMap<string, string>): Promise<boolean> {
  const forwarding = await readForwardingRecord(code, refs.get(FORWARDING_REF), recorded.record.source.name);
  if (forwarding.status === "refused") throw new MigrationRefusal(forwarding.refusal);
  return forwarding.result?.registryCommit === recorded.record.registryCommit;
}
