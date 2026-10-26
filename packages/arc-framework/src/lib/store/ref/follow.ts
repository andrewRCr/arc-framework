/** Record and execute the person's answer to a freshly judged state follow. */
import type { Store } from "../contract.js";
import type { StoreCommandResult, StoreCommandRefusal, MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import type { RefFollowDue } from "./follow-due.js";
import { dropStaleFollow, type RefFollowJudgment, type RefFollowCandidate } from "./follow-candidates.js";
import { RecordReferenceSchema } from "../identity.js";
import { readBatchObjects } from "./batch-read.js";
import { projectIdentityQueries, projectOwnerFromObjects } from "./project-identity.js";
import { readSyncRefs } from "./sync-graph.js";
import { migrationCodeContext, saveMoveRecord, removeMoveRecord, type RecordedFollow, type FollowMoveRecord } from "./migrate-record.js";
import { readRefRepository } from "./repository.js";
import { publisherLayout } from "./layout-state.js";
import { sourceSwitchComplete, followSwitchUndo, switchRefSource } from "./source-switch.js";
import { clearRemoteGathering, clearUnrecordedGathering, remoteCopyReport, readRemoteCopyReport } from "./migrate-remote-copy.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { undoSwitch } from "./migrate-switch-undo.js";
import { copyFollowState } from "./follow-copy.js";
import { deleteFollowSource } from "./follow-delete.js";
import { describeEndedFollow } from "./follow-report.js";
import { releaseCopyJournal, requireNoPendingCopy } from "./migrate-copy-journal.js";

type DecidedFollow = Extract<RefFollowJudgment, { status: "decided" }>;

/** A follow's answer is persisted before its physical switch can expose a new designation. */
export async function answerRefFollow(context: RefBackendContext, store: Store, due: RefFollowDue, judged: DecidedFollow,
  candidate: RefFollowCandidate, answer: "push" | "read" | "off"): Promise<StoreCommandResult<MigrateReport> | { status: "stale" }> {
  const conflict = followPublicationConflict(due, candidate, answer);
  if (conflict) return { status: "refused", refusal: conflict };
  const code = await migrationCodeContext(context);
  try {
    const physical = await readRefRepository(context);
    if (answer === "push") await requireFollowPublication(physical, judged.record.projectId);
    const sourceLayout = physical.repository?.gitDir ? "separate" : "default";
    const ownCodePush = independentPublishers(due, candidate).find(row => row.repository === "code" && row.name === due.designation.codeRemote);
    const destinationLayout = publisherLayout(ownCodePush ?? (answer === "push" ? candidate.remote : undefined), due.designation.codeRemote);
    const sourceRole = due.remote.role;
    if (sourceRole !== "push" && sourceRole !== "read") throw new Error("A due follow's old remote carries neither push nor read");
    const record: FollowMoveRecord = { kind: "follow", source: judged.source, destination: candidate.remote,
      answer, sourceRole, forwarding: judged.record, forwardingTip: judged.forwardingTip, sourceLayout, destinationLayout };
    if (answer !== "push") await requireNoPendingCopy(code);
    await clearRemoteGathering(code, true);
    if (answer === "push" && await copyFollowState(code, record) === null) {
      await dropStaleFollow(context, due); await clearRemoteGathering(code); return { status: "stale" };
    }
    await context.migrateStep?.("follow.record");
    const recorded = await saveMoveRecord(code, record, null);
    await releaseCopyJournal(code);
    await context.migrateStep?.("follow.recorded");
    return await resumeRefFollow(context, store, recorded, true);
  } catch (error) {
    await clearUnrecordedGathering(code);
    if (!(error instanceof MigrationRefusal)) throw error;
    return { status: "refused", refusal: error.refusal };
  }
}

function followPublicationConflict(due: RefFollowDue, candidate: RefFollowCandidate, answer: "push" | "read" | "off"): StoreCommandRefusal | undefined {
  if (answer !== "push") return undefined;
  const other = independentPublishers(due, candidate)[0];
  if (!other) return undefined;
  return { code: "role-conflict", class: "recoverable",
    condition: `${other.name} already carries push; answering push for ${candidate.remote.name} would add another state publisher.`,
    remedy: { text: `Choose read with arc store remote ${candidate.remote.name} read to follow while keeping the existing publisher.`,
      argv: ["arc", "store", "remote", candidate.remote.name, "read"] } };
}

function independentPublishers(due: RefFollowDue, candidate: RefFollowCandidate): RefFollowDue["designation"]["pushes"] {
  return due.designation.pushes.filter(remote => (remote.name !== due.remote.name || remote.repository !== due.remote.repository)
    && (remote.name !== candidate.remote.name || remote.repository !== candidate.remote.repository));
}

/** Resume from the retained answer rather than asking again after an interrupted switch. */
export async function resumeRefFollow(context: RefBackendContext, store: Store, recorded: RecordedFollow, copied = false): Promise<StoreCommandResult<MigrateReport>> {
  try {
    const code = await migrationCodeContext(context);
    if (!copied && recorded.record.answer === "push" && !await sourceSwitchComplete(context, recorded)) {
      const copiedState = await copyFollowState(code, recorded.record, true);
      if (copiedState === null || copiedState === "moved") return await endRecordedFollow(context, store, code, recorded, copiedState ?? "stale");
    }
    const report = recorded.record.answer === "push" ? await readRemoteCopyReport(code) : remoteCopyReport(new Map(), new Map(), []);
    await switchRefSource(context, store, recorded);
    if (recorded.record.answer === "push") await deleteFollowSource(code, recorded, report);
    await context.migrateStep?.("follow.finish");
    await removeMoveRecord(code, recorded);
    await clearRemoteGathering(code);
    return { status: "ok", result: report };
  } catch (error) { if (error instanceof MigrationRefusal) return { status: "refused", refusal: error.refusal }; throw error; }
}

/** End a recorded follow another move overtook, undoing a begun switch; a changed record stays due for the next run to judge. */
async function endRecordedFollow(context: RefBackendContext, store: Store, code: RefBackendContext, recorded: RecordedFollow,
  cause: "stale" | "moved"): Promise<StoreCommandResult<MigrateReport>> {
  const report = await describeEndedFollow(code, recorded);
  const undone = await undoSwitch(context, store, followSwitchUndo(recorded));
  if (cause === "stale") {
    const physical = await readRefRepository(context), trackingRef = `refs/arc-remotes/${recorded.record.source.name}/project/moved`;
    const tip = (await readSyncRefs(physical, trackingRef)).get(trackingRef);
    if (tip) await dropStaleFollow(context, { trackingRef, tip });
  }
  report.notices.push(endedFollowNotice(cause, undone));
  await removeMoveRecord(code, recorded); await clearRemoteGathering(code);
  return { status: "ok", result: report };
}

function endedFollowNotice(cause: "stale" | "moved", undone: boolean): MigrateReport["notices"][number] {
  if (cause === "stale") return { condition: undone
    ? "The old remote no longer carries the followed record: another move overtook this follow during its switch, which was undone, and the follow ended without deletes."
    : "The old remote no longer carries the followed record; the stale follow ended without a switch or deletes." };
  return { condition: undone
    ? "Another move has taken the state since this follow judged it, overtaking the follow during its switch, which was undone; the follow ended without deletes."
    : "Another move has taken the state since this follow judged it; the follow ended without a switch or deletes.",
  remedy: { text: "Bring in the latest tracked pointer, then run arc store migrate to follow the current move.", argv: ["arc", "store", "migrate"] } };
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
