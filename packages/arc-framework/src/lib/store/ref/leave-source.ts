/** Re-home a clone's last source view without contacting or deleting on the departed receiver. */
import type { Store } from "../contract.js";
import type { MigrateReport, StoreCommandResult, StoreMigrateInput } from "../commands.js";
import type { Remedy } from "../refusal.js";
import type { RefBackendContext } from "./context.js";
import { migrationCodeContext, readMoveRecord, saveMoveRecord, removeMoveRecord, type RecordedLeaveSource, type RecordedMove } from "./migrate-record.js";
import { MigrationRefusal } from "./migrate-refusal.js";
import { resolveLeaveSource, leaveSourceInvalid, type LeaveSourceView } from "./leave-source-target.js";
import { fetchMigrationRemote } from "./migrate-remote-fetch.js";
import { checkCopyProject, copyProjectId, prepareRemoteReCopy, remoteCopyChanges, atomicMigrationPush, migrationPushLanded,
  remoteCopyReport, retainCopiedTips, readRemoteCopyReport, clearRemoteGathering, clearUnrecordedGathering, registryHoldsMove } from "./migrate-remote-copy.js";
import { FORWARDING_REF, readForwardingRecord } from "./forwarding-record.js";
import { switchRefSource } from "./source-switch.js";
import { readMigrationRemote } from "./migration-read.js";
import { endRecordedSource } from "./leave-recorded.js";

/** The caller holds the clone's move lock; a recorded departure resumes only its already landed copy. */
export async function leaveRefSource(context: RefBackendContext, store: Store, input: Pick<StoreMigrateInput, "to" | "trial"> = {},
  resume?: RecordedLeaveSource, readRemedy?: Remedy): Promise<StoreCommandResult<MigrateReport>> {
  const code = await migrationCodeContext(context);
  const { to } = input;
  try {
    const held = await readDepartureRecord(code, resume);
    if (held.status === "refused") return held;
    if (held.result && held.result.record.kind !== "leave-source") {
      if (to) throw leaveSourceInvalid("--to cannot accompany --leave-source while a move or follow is recorded.");
      return await endRecordedSource(context, store, code, held.result);
    }
    resume = held.result?.record.kind === "leave-source" ? { record: held.result.record, tip: held.result.tip } : undefined;
    checkDepartureResume(resume, input);
    let report: MigrateReport;
    if (resume) report = await readRemoteCopyReport(code);
    else {
      const view = await resolveLeaveSource(context, code, to);
      await clearRemoteGathering(code, true);
      report = await copyLastSourceView(code, view, readRemedy);
      await code.migrateStep?.("leave.record");
      resume = await saveMoveRecord(code, view.record, null);
      await code.migrateStep?.("leave.recorded");
    }
    await code.migrateStep?.("leave.switch");
    await switchRefSource(context, store, resume);
    await code.migrateStep?.("leave.switched");
    await removeMoveRecord(code, resume);
    await clearRemoteGathering(code);
    return { status: "ok", result: report };
  } catch (error) {
    await clearUnrecordedGathering(code);
    if (!(error instanceof MigrationRefusal)) throw error;
    return { status: "refused", refusal: error.refusal };
  }
}

async function copyLastSourceView(code: RefBackendContext, view: LeaveSourceView, readRemedy?: Remedy): Promise<MigrateReport> {
  for (;;) {
    const destination = await readMigrationRemote(view.record.destination.name, readRemedy ?? departureReadRemedy(view),
      () => fetchMigrationRemote(code, view.record.destination, true));
    await checkLeaveDestination(code, view, destination);
    const prepared = await prepareRemoteReCopy(code, view.incoming, destination);
    const changes = remoteCopyChanges(prepared.refs, destination).filter(row => row.next !== row.expected);
    await code.migrateStep?.("leave.copy");
    if (changes.length) {
      const copied = await atomicMigrationPush(code, view.record.destination.pushUrl, changes);
      if (!await migrationPushLanded(code, view.record.destination.pushUrl, changes, copied)) continue;
    }
    const report = remoteCopyReport(prepared.refs, destination, prepared.notices);
    for (const ref of view.incoming.keys()) report.notices.push({
      condition: `The last view of ${view.record.source.fetchUrl} held ${ref}; leaving it does not delete or unpublish that state.` });
    await retainCopiedTips(code, view.incoming, view.heads, { registry: prepared.refs.get("refs/arc/project/registry"),
      report, destination, headBasis: prepared.refs });
    await code.migrateStep?.("leave.copied");
    return report;
  }
}

function departureReadRemedy(view: LeaveSourceView): Remedy {
  const destination = view.record.destination, target = destination.repository === "backing" ? destination.url : destination.name;
  return { text: `Repair access to ${destination.name} (${destination.fetchUrl}), then retry arc store migrate --leave-source --to ${target}.`,
    argv: ["arc", "store", "migrate", "--leave-source", "--to", target] };
}

async function checkLeaveDestination(code: RefBackendContext, view: LeaveSourceView, destination: Map<string, string>): Promise<void> {
  const remote = view.record.destination;
  try { await checkCopyProject(code, view.local, destination, view.incoming, remote); }
  catch (error) {
    if (!(error instanceof MigrationRefusal) || error.refusal.code !== "moved") throw error;
    throw departedDestination(remote.name, error.refusal.condition);
  }
  const forwarding = await readForwardingRecord(code, destination.get(FORWARDING_REF), remote.name);
  if (forwarding.status === "refused") throw new MigrationRefusal(forwarding.refusal);
  if (forwarding.result) throw departedDestination(remote.name);
  const registry = destination.get("refs/arc/project/registry");
  if (remote.repository === "code" && !await copyProjectId(code, destination)) throw leaveSourceInvalid(
    `Remote ${remote.name} holds no project identity. Use arc store remote backing off where it carries push, then arc store remote ${remote.name} push to designate it explicitly.`,
    `Run arc store remote backing off where it carries push, then arc store remote ${remote.name} push to designate this clone's state explicitly.`);
  if (view.forwarding && (!registry || !await registryHoldsMove(code, view.forwarding.registryCommit, registry))) {
    throw departedDestination(remote.name, `Remote ${remote.name} does not hold the move's registry commit; choose the state's current home.`);
  }
}

function departedDestination(remote: string, condition = `The destination ${remote} carries a forwarding record; state moved again.`): MigrationRefusal {
  return new MigrationRefusal({ code: "moved", class: "recoverable", condition,
    remedy: { text: "Use arc store migrate --leave-source --to <remote> naming the state's current home. Where that home is the source this clone is leaving, have the mover run arc store migrate --leave-source to withdraw its record." } });
}

async function readDepartureRecord(code: RefBackendContext, resume?: RecordedLeaveSource): Promise<StoreCommandResult<RecordedMove | null>> {
  if (resume) return { status: "ok", result: resume };
  const existing = await readMoveRecord(code);
  if (existing.status === "refused") return existing;
  if (!existing.result) return { status: "ok", result: null };
  if (existing.result.record.kind !== "layout") return existing;
  return { status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: "A layout move is recorded; finish it before leaving the source.",
    remedy: { text: "Run arc store migrate with no target to finish the recorded layout move, then retry --leave-source.", argv: ["arc", "store", "migrate"] } } };
}

function checkDepartureResume(resume: RecordedLeaveSource | undefined, { to, trial }: Pick<StoreMigrateInput, "to" | "trial">): void {
  if (resume && (trial || to && ![resume.record.destination.name, resume.record.destination.url].includes(to))) {
    throw new MigrationRefusal({ code: "move-unfinished", class: "recoverable",
      condition: `A source departure to ${resume.record.destination.url} is recorded; finish it before another migration or trial.`,
      remedy: { text: "Run arc store migrate with no target to finish the recorded source departure, then retry.", argv: ["arc", "store", "migrate"] } });
  }
}
