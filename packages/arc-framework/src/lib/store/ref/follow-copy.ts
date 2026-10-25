/** Copy late source publications only while the judged forwarding record and destination still license it. */
import { followReadRemedy } from "./follow-candidates.js";
import { readMigrationRemote } from "./migration-read.js";
import type { MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import type { FollowMoveRecord } from "./migrate-record.js";
import { fetchMigrationRemote } from "./migrate-remote-fetch.js";
import { FORWARDING_REF, readForwardingRecord } from "./forwarding-record.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { captureMoveHeads, retainCopiedTips, prepareRemoteReCopy, remoteCopyChanges, remoteCopyReport,
  atomicMigrationPush, migrationPushLanded, registryHoldsMove } from "./migrate-remote-copy.js";
import { projectIdentityQueries, projectOwnerFromObjects } from "./project-identity.js";
import { readBatchObjects } from "./batch-read.js";

/** The source is incoming; destination state is the local side of every lifecycle merge; a recorded rerun reports another move rather than refusing. */
export async function copyFollowState(code: RefBackendContext, record: FollowMoveRecord, recorded = false): Promise<MigrateReport | null | "moved"> {
  try { return await copyLicensedFollowState(code, record); }
  catch (error) { if (recorded && error instanceof FollowMovedRefusal) return "moved"; throw error; }
}

async function copyLicensedFollowState(code: RefBackendContext, record: FollowMoveRecord): Promise<MigrateReport | null> {
  for (;;) {
    const heads = await captureMoveHeads(code, record.source);
    await code.migrateStep?.("follow.fetch-source");
    const source = await readMigrationRemote(record.source.name, followReadRemedy(record.source.name, record.source.name), () => fetchMigrationRemote(code, record.source, true));
    if (!source.has(FORWARDING_REF)) return null;
    if (source.get(FORWARDING_REF) !== record.forwardingTip) throw followMoved(record.source.name);
    await code.migrateStep?.("follow.fetch-destination");
    const destination = await readMigrationRemote(record.destination.name, followReadRemedy(record.destination.name, record.source.name), () => fetchMigrationRemote(code, record.destination, true));
    await requireFollowDestination(code, record, destination);
    const prepared = await prepareRemoteReCopy(code, source, destination);
    const changes = remoteCopyChanges(prepared.refs, destination).filter(row => row.next !== row.expected);
    await code.migrateStep?.("follow.copy");
    if (changes.length) {
      const copied = await atomicMigrationPush(code, record.destination.pushUrl, changes);
      if (!await migrationPushLanded(code, record.destination.pushUrl, changes, copied)) continue;
    }
    const report = remoteCopyReport(prepared.refs, destination, prepared.notices);
    await retainCopiedTips(code, source, heads, { registry: record.forwarding.registryCommit, report, destination, headBasis: prepared.refs });
    await code.migrateStep?.("follow.copied");
    return report;
  }
}

/** No follow writes to a remote another move left or whose current registry no longer holds this move. */
export async function requireFollowDestination(code: RefBackendContext, record: FollowMoveRecord, refs: ReadonlyMap<string, string>): Promise<void> {
  const forwarding = await readForwardingRecord(code, refs.get(FORWARDING_REF), record.destination.name);
  if (forwarding.status === "refused") throw new MigrationRefusal(forwarding.refusal);
  if (forwarding.result) throw followMoved(record.destination.name);
  const owner = projectOwnerFromObjects(refs, await readBatchObjects(code, projectIdentityQueries(refs)));
  if (owner.status === "refused") throw new MigrationRefusal({ code: "store", refusal: owner.refusal });
  const registry = refs.get("refs/arc/project/registry");
  if (owner.result.type !== "project" || owner.result.uid !== record.forwarding.projectId || !registry ||
      !await registryHoldsMove(code, record.forwarding.registryCommit, registry)) {
    throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable",
      condition: `The destination ${record.destination.name} no longer holds this project's recorded move; the old remote may hold the only remaining copy.`,
      remedy: { text: "Restore the destination's project and move commit, then retry arc store migrate." } });
  }
}

/** Another move's forwarding state, which a first run refuses and a recorded rerun ends on. */
class FollowMovedRefusal extends MigrationRefusal {}

/** A newer move requires fresh candidate judgment before any further copy. */
function followMoved(remote: string): MigrationRefusal {
  return new FollowMovedRefusal({ code: "moved", class: "recoverable", condition: `The forwarding record on ${remote} changed during the follow.`,
    remedy: { text: "Bring in the latest tracked pointer and retry arc store migrate to follow the current move.", argv: ["arc", "store", "migrate"] } });
}
