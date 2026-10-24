/** End overtaken migrations while retaining a route from every abandoned destination copy. */
import type { MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { FORWARDING_REF, readForwardingRecord } from "./forwarding-record.js";
import { removeMoveRecord, type RecordedRemote, type MoveRemote } from "./migrate-record.js";
import { commitMigrationRegistry } from "./migrate-registry.js";
import { atomicMigrationPush, clearRemoteGathering, migrationPushLanded, readRemoteCopyVersion, registryHoldsMove, type RemoteCopy } from "./migrate-remote-copy.js";
import { MigrationRefusal } from "./migrate-refusal.js";

/** Where an overtaken move ended: before its switch, inside it and undone, or after it. */
export type EndedSwitch = "before" | "during" | "after";

/** Preserve the winning move on a stranded copy only while its original copy lease still holds, then undo a begun switch. */
export async function endRemoteMove(code: RefBackendContext, recorded: RecordedRemote, copy: RemoteCopy,
  undo: () => Promise<boolean>): Promise<MigrateReport | undefined> {
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
  return finishEndedRemoteMove(code, recorded, copy, await undo() ? "during" : "before");
}

/** Drop an overtaken move's journal while reporting its remaining published refs before clearing temporary data. */
export async function finishEndedRemoteMove(code: RefBackendContext, recorded: RecordedRemote, copy: RemoteCopy, ended: EndedSwitch): Promise<MigrateReport> {
  const report = describeEndedRemoteMove(recorded, copy, ended);
  await removeMoveRecord(code, recorded);
  await clearRemoteGathering(code);
  return report;
}

/** Describe known leftovers without changing either receiver, the recorded move, or its retained heads. */
export function describeEndedRemoteMove(recorded: RecordedRemote, copy: RemoteCopy, ended: EndedSwitch, trial = false): MigrateReport {
  const undone = trial ? "; a run undoes its switch" : "; its switch was undone";
  const notices = [...copy.report.notices, { condition: `Another move overtook this recorded move ${ended} its switch${ended === "during" ? undone : ""}. Run arc store migrate to follow the state's home.` }];
  const leftovers: [MoveRemote, Map<string, string>][] = [[recorded.record.source, copy.source]];
  if (ended !== "after") leftovers.push([recorded.record.destination, copy.destination]);
  for (const [remote, refs] of leftovers) {
    for (const ref of refs.keys()) notices.push({ condition: `The ended move leaves ${ref} published at ${remote.fetchUrl}.` });
  }
  return { ...copy.report, notices };
}

async function preserveForwarding(code: RefBackendContext, remote: MoveRemote, tip: string, expected: string | null,
  parent: string, registryLease: string): Promise<boolean> {
  const next = await commitMigrationRegistry(code, parent, "forward");
  const changes = [{ ref: FORWARDING_REF, next: tip, expected }, { ref: "refs/arc/project/registry", next, expected: registryLease }];
  return migrationPushLanded(code, remote.pushUrl, changes, await atomicMigrationPush(code, remote.pushUrl, changes));
}
