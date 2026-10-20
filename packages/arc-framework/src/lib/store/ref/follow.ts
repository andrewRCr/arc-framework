/** Record and execute the person's answer to a freshly judged state follow. */
import type { Store } from "../contract.js";
import type { StoreCommandResult, MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import type { RefFollowDue } from "./follow-due.js";
import { dropStaleFollow, type RefFollowJudgment, type RefFollowCandidate } from "./follow-candidates.js";
import { RecordReferenceSchema } from "../identity.js";
import { readBatchObjects } from "./batch-read.js";
import { projectIdentityQueries, projectOwnerFromObjects } from "./project-identity.js";
import { readSyncRefs } from "./sync-graph.js";
import { migrationCodeContext, saveMoveRecord, removeMoveRecord, readMoveRecord, type RecordedFollow, type FollowMoveRecord } from "./migrate-record.js";
import { readRefRepository } from "./repository.js";
import { followSwitchComplete, switchRefFollow } from "./follow-switch.js";
import { clearRemoteGathering, remoteCopyReport, readRemoteCopyReport } from "./migrate-remote-copy.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { copyFollowState } from "./follow-copy.js";
import { deleteFollowSource } from "./follow-delete.js";

type DecidedFollow = Extract<RefFollowJudgment, { status: "decided" }>;

/** A follow's answer is persisted before its physical switch can expose a new designation. */
export async function answerRefFollow(context: RefBackendContext, store: Store, due: RefFollowDue, judged: DecidedFollow,
  candidate: RefFollowCandidate, answer: "push" | "read" | "off"): Promise<StoreCommandResult<MigrateReport> | { status: "stale" }> {
  const code = await migrationCodeContext(context);
  try {
    const physical = await readRefRepository(context);
    if (answer === "push") await requireFollowPublication(physical, judged.record.projectId);
    const sourceLayout = physical.repository?.gitDir ? "separate" : "default";
    const ownCodePush = due.designation.pushes.some(row => row.repository === "code" && row.name === due.designation.codeRemote && row.name !== due.remote.name);
    const destinationLayout = ownCodePush || answer === "push" && candidate.remote.repository === "code" && candidate.remote.name === due.designation.codeRemote ? "default" : "separate";
    const record: FollowMoveRecord = { kind: "follow", source: judged.source, destination: candidate.remote,
      answer, forwarding: judged.record, forwardingTip: judged.forwardingTip, sourceLayout, destinationLayout };
    if (answer === "push" && await copyFollowState(code, record) === null) {
      await dropStaleFollow(context, due); await clearRemoteGathering(code); return { status: "stale" };
    }
    await context.migrateStep?.("follow.record");
    const recorded = await saveMoveRecord(code, record, null);
    await context.migrateStep?.("follow.recorded");
    return await resumeRefFollow(context, store, recorded, true);
  } catch (error) {
    if (!(error instanceof MigrationRefusal)) throw error;
    const held = await readMoveRecord(code);
    if (held.status === "ok" && held.result === null) await clearRemoteGathering(code);
    return { status: "refused", refusal: error.refusal };
  }
}

/** Resume from the retained answer rather than asking again after an interrupted switch. */
export async function resumeRefFollow(context: RefBackendContext, store: Store, recorded: RecordedFollow, copied = false): Promise<StoreCommandResult<MigrateReport>> {
  try {
    const code = await migrationCodeContext(context);
    if (!copied && recorded.record.answer === "push" && !await followSwitchComplete(context, recorded) &&
        await copyFollowState(code, recorded.record) === null) return await endStaleRecordedFollow(context, code, recorded);
    const report = recorded.record.answer === "push" ? await readRemoteCopyReport(code) : remoteCopyReport(new Map(), new Map(), []);
    await switchRefFollow(context, store, recorded);
    if (recorded.record.answer === "push") await deleteFollowSource(code, recorded, report);
    await context.migrateStep?.("follow.finish");
    await removeMoveRecord(code, recorded);
    await clearRemoteGathering(code);
    return { status: "ok", result: report };
  } catch (error) { if (error instanceof MigrationRefusal) return { status: "refused", refusal: error.refusal }; throw error; }
}

async function endStaleRecordedFollow(context: RefBackendContext, code: RefBackendContext, recorded: RecordedFollow): Promise<StoreCommandResult<MigrateReport>> {
  const physical = await readRefRepository(context), trackingRef = `refs/arc-remotes/${recorded.record.source.name}/project/moved`;
  const tip = (await readSyncRefs(physical, trackingRef)).get(trackingRef);
  if (tip) await dropStaleFollow(context, { trackingRef, tip });
  await removeMoveRecord(code, recorded); await clearRemoteGathering(code);
  return { status: "ok", result: remoteCopyReport(new Map(), new Map(), [{ condition: "The old remote no longer carries the followed record; the stale follow ended without a switch or deletes." }]) };
}

async function requireFollowPublication(physical: RefBackendContext, projectId: string): Promise<void> {
  const refs = await readSyncRefs(physical, "refs/arc/project/registry");
  const owner = projectOwnerFromObjects(refs, await readBatchObjects(physical, projectIdentityQueries(refs)));
  if (owner.status === "refused") throw new MigrationRefusal({ code: "store", refusal: owner.refusal });
  const local = owner.result.type === "project" ? owner.result.uid : undefined;
  if (!local || local === projectId) return;
  const reference = (uid: string) => RecordReferenceSchema.parse({ kind: "project-registry/identity", owner: { type: "project", name: "project", uid } });
  throw new MigrationRefusal({ code: "store", refusal: { code: "identity-mismatch", class: "recoverable", expected: reference(local), actual: reference(projectId),
    condition: `The follow destination names project ${projectId}; this clone's store belongs to ${local}.`,
    remedy: { text: "Choose read or off to retain this clone's project locally; publish it through an appropriate remote separately." } } });
}
