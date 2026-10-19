/** Finish remote moves through freshly licensed, leased re-copy and delete rounds. */
import type { PushOutcome } from "../../git/push.js";
import type { MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import type { RecordedRemote } from "./migrate-record.js";
import { removeMoveRecord } from "./migrate-record.js";
import { fetchMigrationRemote } from "./migrate-remote-fetch.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { FORWARDING_REF, readForwardingRecord } from "./forwarding-record.js";
import { atomicMigrationPush, clearRemoteGathering, lostCopyLease, migrationPushRefusal, prepareRemoteReCopy,
  registryHoldsMove, remoteCopyChanges, remoteCopyReport, retainRemoteCopiedState } from "./migrate-remote-copy.js";

/** Every round proves both move versions before any remote write; interruptions retain the move record. */
export async function deleteRemoteSource(code: RefBackendContext, recorded: RecordedRemote): Promise<MigrateReport> {
  const report = remoteCopyReport(new Map(), new Map(), []);
  try {
    for (;;) {
      await code.migrateStep?.("remote.read-destination");
      await requireDestination(code, recorded, await fetchMigrationRemote(code, recorded.record.destination, false));
      await code.migrateStep?.("remote.list-source");
      const source = await fetchMigrationRemote(code, recorded.record.source, true);
      await requireSource(code, recorded, source);
      const ordinary = new Map([...source].filter(([ref]) => ref !== FORWARDING_REF));
      if (!ordinary.size) {
        await code.migrateStep?.("remote.finish");
        await removeMoveRecord(code, recorded);
        await clearRemoteGathering(code);
        return report;
      }
      const destination = await fetchMigrationRemote(code, recorded.record.destination, true);
      await requireDestination(code, recorded, destination);
      await code.migrateStep?.("remote.recopy");
      const prepared = await prepareRemoteReCopy(code, ordinary, destination);
      const changes = remoteCopyChanges(prepared.refs, destination).filter(change => change.next !== change.expected);
      if (changes.length) {
        const copied = await atomicMigrationPush(code, recorded.record.destination.pushUrl, changes);
        if (!roundPushLanded(copied)) continue;
      }
      await retainRemoteCopiedState(code, ordinary);
      report.notices.push(...prepared.notices);
      await code.migrateStep?.("remote.recopied");
      await code.migrateStep?.("remote.delete");
      const deleted = await atomicMigrationPush(code, recorded.record.source.pushUrl,
        [...ordinary].map(([ref, expected]) => ({ ref, next: null, expected })));
      if (!roundPushLanded(deleted)) continue;
      report.refs.push(...remoteCopyReport(ordinary, new Map(), []).refs.map(row => ({ ...row, action: "delete" as const })));
      await code.migrateStep?.("remote.deleted");
    }
  } catch (error) {
    if (!(error instanceof MigrationRefusal)) throw error;
    throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable", condition: `The recorded remote move could not finish cleanup: ${error.message}`,
      remedy: { text: "Repair the reported remote or receiver condition, then retry arc store migrate with no target.", argv: ["arc", "store", "migrate"] } });
  }
}

async function requireDestination(code: RefBackendContext, recorded: RecordedRemote, refs: ReadonlyMap<string, string>): Promise<void> {
  const forwarding = await readForwardingRecord(code, refs.get(FORWARDING_REF), recorded.record.destination.name);
  if (forwarding.status === "refused") throw new MigrationRefusal(forwarding.refusal);
  if (forwarding.result) throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable", condition: "The new remote carries a later forwarding record.", remedy: { text: "Run arc store migrate to reconcile the recorded move before deleting its source." } });
  const registry = refs.get("refs/arc/project/registry");
  if (!registry || !await registryHoldsMove(code, recorded.record.registryCommit, registry)) throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable",
    condition: "The new remote no longer holds the recorded move's registry commit; the old remote may hold the only remaining copy.",
    remedy: { text: "Restore the new remote from a clone holding that registry commit, then retry arc store migrate." } });
}

async function requireSource(code: RefBackendContext, recorded: RecordedRemote, refs: ReadonlyMap<string, string>): Promise<void> {
  const forwarding = await readForwardingRecord(code, refs.get(FORWARDING_REF), recorded.record.source.name);
  if (forwarding.status === "refused") throw new MigrationRefusal(forwarding.refusal);
  if (forwarding.result?.registryCommit !== recorded.record.registryCommit) throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable",
    condition: "The old remote no longer carries this move's forwarding record.", remedy: { text: "Run arc store migrate to reconcile the recorded move before deleting its source." } });
}

function roundPushLanded(outcome: PushOutcome): boolean {
  if (lostCopyLease(outcome)) return false;
  if (outcome.status !== "refs" || outcome.refs.some(row => row.status !== "ok")) throw new MigrationRefusal(migrationPushRefusal(outcome));
  return true;
}
