/** End overtaken migrations while retaining a route from every abandoned destination copy. */
import type { MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { FORWARDING_REF, readForwardingRecord } from "./forwarding-record.js";
import { removeMoveRecord, type RecordedRemote, type MoveRemote } from "./migrate-record.js";
import { commitMigrationRegistry } from "./migrate-registry.js";
import { atomicMigrationPush, clearRemoteGathering, lostCopyLease, migrationPushRefusal, readRemoteCopyVersion, registryHoldsMove, type RemoteCopy } from "./migrate-remote-copy.js";
import { MigrationRefusal } from "./migrate-refusal.js";

/** Preserve the winning move on a stranded copy only while its original copy lease still holds. */
export async function endRemoteMove(code: RefBackendContext, recorded: RecordedRemote, copy: RemoteCopy): Promise<MigrateReport | undefined> {
  const winner = await readForwardingRecord(code, copy.source.get(FORWARDING_REF), recorded.record.source.name);
  if (winner.status === "refused") throw new MigrationRefusal(winner.refusal);
  const destinationForward = await readForwardingRecord(code, copy.destination.get(FORWARDING_REF), recorded.record.destination.name);
  if (destinationForward.status === "refused") throw new MigrationRefusal(destinationForward.refusal);
  const sourceTip = copy.source.get(FORWARDING_REF), destinationTip = copy.destination.get(FORWARDING_REF);
  const sourceRegistry = copy.source.get("refs/arc/project/registry"), registry = copy.destination.get("refs/arc/project/registry");
  if (copy.ended === "destination-forwarded" && destinationForward.result && destinationTip && sourceRegistry) {
    if (!await preserveForwarding(code, recorded.record.source, destinationTip, sourceTip ?? null, sourceRegistry, sourceRegistry)) return undefined;
    copy.source.set(FORWARDING_REF, destinationTip);
  }
  if (winner.result && sourceTip && !destinationForward.result && registry && !await registryHoldsMove(code, winner.result.registryCommit, registry)) {
    const landed = await readRemoteCopyVersion(code, recorded.record.registryCommit);
    if (await preserveForwarding(code, recorded.record.destination, sourceTip, null, landed, landed)) copy.destination.set(FORWARDING_REF, sourceTip);
  }
  return finishEndedRemoteMove(code, recorded, copy, false);
}

/** Drop an overtaken move's journal while reporting its remaining published refs before clearing temporary data. */
export async function finishEndedRemoteMove(code: RefBackendContext, recorded: RecordedRemote, copy: RemoteCopy, switched: boolean): Promise<MigrateReport> {
  const notices = [...copy.report.notices, { condition: `Another move overtook this recorded move ${switched ? "after" : "before"} its switch. Run arc store migrate to follow the state's home.` }];
  const leftovers: [MoveRemote, Map<string, string>][] = [[recorded.record.source, copy.source]];
  if (!switched) leftovers.push([recorded.record.destination, copy.destination]);
  for (const [remote, refs] of leftovers) {
    for (const ref of refs.keys()) notices.push({ condition: `The ended move leaves ${ref} published at ${remote.fetchUrl}.` });
  }
  await removeMoveRecord(code, recorded);
  await clearRemoteGathering(code);
  return { ...copy.report, notices };
}

async function preserveForwarding(code: RefBackendContext, remote: MoveRemote, tip: string, expected: string | null,
  parent: string, registryLease: string): Promise<boolean> {
  const next = await commitMigrationRegistry(code, parent, "forward");
  const pushed = await atomicMigrationPush(code, remote.pushUrl, [
    { ref: FORWARDING_REF, next: tip, expected },
    { ref: "refs/arc/project/registry", next, expected: registryLease },
  ]);
  if (lostCopyLease(pushed)) return false;
  if (pushed.status !== "refs" || pushed.refs.some(row => row.status !== "ok")) throw new MigrationRefusal(migrationPushRefusal(pushed));
  return true;
}
