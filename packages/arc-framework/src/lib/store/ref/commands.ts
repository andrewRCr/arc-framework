/** Explicit ref-store commands and their clone-wide migration serialization. */

import type { Store } from "../contract.js";
import { StoreMigrateInputSchema, StoreRemoteInputSchema, combineMigrateReports, type StoreMigrateInput, type StoreMigrateResult,
  type StoreRemoteInput, type StoreRemoteResult, type MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { designatedStoreLayout, observeRefLayout } from "./layout-state.js";
import { readRefDesignation, refDesignationStop, type RefDesignation } from "./designation.js";
import { migrationCodeContext, readMoveRecord, type RecordedMove, type RecordedFollow } from "./migrate-record.js";
import { moveRefRemote } from "./migrate-remote.js";
import { layoutMoveLeftovers } from "./migrate-remote-switch.js";
import { clearRemoteGathering } from "./migrate-remote-copy.js";
import { moveRefLayout } from "./migrate-layout.js";
import { AdvisoryLockTimeoutError } from "../../advisory-lock.js";
import { applyRefRemoteSetting, remoteView } from "./remote-setting.js";
import { guardRefFollowSetting, readRefFollowDue } from "./follow-due.js";
import { resumeRefFollow } from "./follow.js";
import { judgeRefFollow } from "./follow-candidates.js";
import { leaveRefSource } from "./leave-source.js";

/** No-target migration reconciles the physical store with its explicitly recorded roles. */
export async function runRefMigrate(context: RefBackendContext, store: Store, input: StoreMigrateInput): Promise<StoreMigrateResult> {
  const parsed = StoreMigrateInputSchema.safeParse(input);
  if (!parsed.success) return invalidCommand("The migration request is invalid.");
  if (parsed.data.trial && (!parsed.data.to && !parsed.data.import || parsed.data.leaveSource)) return invalidCommand("--trial requires --to or --import and cannot accompany --leave-source.");
  if (parsed.data.import) return withMigrationLock(context, async () => {
    const { importTrackedState } = await import("./import/entry.js");
    return importTrackedState(context, store, parsed.data);
  });
  if (parsed.data.leaveSource) return withMigrationLock(context, () => leaveRefSource(context, store, parsed.data));
  return withMigrationLock(context, async () => {
    const code = await migrationCodeContext(context);
    const existing = await readMoveRecord(code);
    if (existing.status === "refused") return existing;
    if (existing.result?.record.kind === "leave-source") {
      return leaveRefSource(context, store, parsed.data, { record: existing.result.record, tip: existing.result.tip });
    }
    if (existing.result?.record.kind === "remote") return moveRefRemote(context, store, parsed.data.to, parsed.data.trial, { record: existing.result.record, tip: existing.result.tip });
    if (existing.result?.record.kind === "follow") return resumeFollowRequest(context, store, { record: existing.result.record, tip: existing.result.tip }, parsed.data);
    const layout = existing.result?.record.kind === "layout" ? { record: existing.result.record, tip: existing.result.tip } : undefined;
    const unsettled = parsed.data.to ? await unsettledLayout(context, layout !== undefined) : undefined;
    if (unsettled) return unsettled;
    // A move ended after removing its record leaves gathering no later move may read as its own.
    if (!existing.result && !parsed.data.trial) await clearRemoteGathering(code);
    if (parsed.data.to) return moveRefRemote(context, store, parsed.data.to, parsed.data.trial);
    if (layout) return moveRefLayout(context, store, layout.record.destination, layout.record.setting, layout);
    return reconcileNoTarget(context, store);
  });
}

/** A remote move or its trial starts only with no layout move recorded and the store where its designation puts it. */
async function unsettledLayout(context: RefBackendContext, layoutRecorded: boolean): Promise<Extract<StoreMigrateResult, { status: "refused" }> | undefined> {
  if (layoutRecorded) return { status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: "A layout move is recorded; finish it before requesting a remote migration or trial.",
    remedy: { text: "Run arc store migrate with no target to finish the recorded layout move, then retry the requested migration.", argv: ["arc", "store", "migrate"] } } };
  const designation = await readRefDesignation(context);
  const ambiguous = configuredLayoutRefusal(designation);
  if (ambiguous) return ambiguous;
  if (await layoutMoveLeftovers(await migrationCodeContext(context))) return { status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: "An interrupted layout build left its build directory or temporary refs; clear them before requesting a remote migration or trial.",
    remedy: { text: "Run arc store migrate with no target to clear the interrupted build, then retry the requested migration.", argv: ["arc", "store", "migrate"] } } };
  const { incomplete } = await observeRefLayout(context, designation);
  return incomplete ? { status: "refused", refusal: { code: "move-incomplete", class: "recoverable", condition: incomplete.condition, remedy: incomplete.remedy } } : undefined;
}

/** Shared designation stops retain their recovery route at the command boundary. */
function configuredLayoutRefusal(designation: RefDesignation): Extract<StoreMigrateResult, { status: "refused" }> | undefined {
  const stop = refDesignationStop(designation);
  if (stop?.status === "move-incomplete") return { status: "refused", refusal: { code: "move-incomplete", class: "recoverable",
    condition: stop.condition, remedy: stop.remedy } };
  return stop?.status === "designation-ambiguous" ? { status: "refused", refusal: { code: "role-conflict", class: "recoverable",
    condition: `Remotes ${stop.remotes.join(", ")} each carry push, so no one layout is designated.`, remedy: stop.remedy } } : undefined;
}

/** With no record standing, follow a due move, then bring the clone into its designated layout. */
async function reconcileNoTarget(context: RefBackendContext, store: Store): Promise<StoreMigrateResult> {
  const due = await readRefFollowDue(context);
  if (due) {
    const followed = await judgeRefFollow(context, due);
    if (followed.status === "refused") return followed;
    if (followed.status === "decided") return followed.result;
  }
  const designation = await readRefDesignation(context);
  const layout = designatedStoreLayout(designation);
  if (layout === null) {
    const stop = configuredLayoutRefusal(designation);
    if (!stop) throw new Error("An ambiguous layout has no designation stop");
    return stop;
  }
  return moveRefLayout(context, store, layout);
}

/** Apply a code remote's own setting in the order its layout switch requires. */
export async function runRefRemote(context: RefBackendContext, store: Store, input: StoreRemoteInput): Promise<StoreRemoteResult> {
  const parsed = StoreRemoteInputSchema.safeParse(input);
  if (!parsed.success) return invalidRemoteCommand("The remote request is invalid.");
  if (!input.remote && !input.role) return { status: "ok", result: await remoteView(context) };
  if (!input.remote || !input.role) return invalidRemoteCommand("A remote setting requires both a remote and a role.");
  const setting = { remote: input.remote, role: input.role };
  return withMigrationLock(context, async () => {
    const existing = await readMoveRecord(await migrationCodeContext(context));
    if (existing.status === "refused") return existing;
    let completed: MigrateReport | undefined;
    if (existing.result) {
      const resumed = await finishRecordedMove(context, store, existing.result);
      if (resumed.status === "refused") return resumed;
      completed = resumed.result;
    }
    const follow = await guardRefFollowSetting(context, store, setting.remote, setting.role);
    const applied = follow ?? await applyRefRemoteSetting(context, store, setting, input.ownState);
    if (!completed) return applied;
    if (applied.status !== "ok") return unappliedSetting(completed, applied);
    applied.result.report = applied.result.report ? combineMigrateReports(completed, applied.result.report) : completed;
    return applied;
  });
}

/** The finished move's record is already gone, so a setting that then refuses or asks keeps its own stop and carries the report. */
function unappliedSetting(completed: MigrateReport, applied: Exclude<StoreRemoteResult, { status: "ok" }>): StoreRemoteResult {
  if (applied.status === "confirmation-needed") return { ...applied, report: completed };
  return { status: "refused", refusal: applied.refusal.code === "import-refused" ? applied.refusal : { ...applied.refusal, report: completed } };
}

async function resumeFollowRequest(context: RefBackendContext, store: Store, recorded: RecordedFollow, { to, trial }: StoreMigrateInput): Promise<import("../commands.js").StoreCommandResult<MigrateReport>> {
  if (trial || to && ![recorded.record.destination.name, recorded.record.destination.url].includes(to)) return { status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: "A follow is recorded; finish its retained answer before requesting another remote migration or trial.",
    remedy: { text: "Run arc store migrate with no target to finish the recorded follow, then retry the requested migration.", argv: ["arc", "store", "migrate"] } } };
  return resumeRefFollow(context, store, recorded);
}

async function finishRecordedMove(context: RefBackendContext, store: Store, existing: RecordedMove): Promise<import("../commands.js").StoreCommandResult<MigrateReport>> {
  const { record, tip } = existing;
  if (record.kind === "leave-source") return leaveRefSource(context, store, {}, { record, tip });
  if (record.kind === "follow") return resumeRefFollow(context, store, { record, tip });
  if (record.kind === "layout") return moveRefLayout(context, store, record.destination, record.setting, { record, tip });
  const resumed = await moveRefRemote(context, store, undefined, false, { record, tip });
  return resumed.status === "designation-needed" ? invalidCommand("Finish the recorded move before setting a role.") : resumed;
}

async function withMigrationLock<T>(context: RefBackendContext, operation: () => Promise<T>): Promise<T | Extract<StoreRemoteResult, { status: "refused" }>> {
  try {
    const release = await context.lock("migrate");
    try { return await operation(); } finally { await release(); }
  } catch (error) {
    if (!(error instanceof AdvisoryLockTimeoutError) || error.phase !== "acquire") throw error;
    return { status: "refused", refusal: { code: "store", refusal: { code: "lock-held", class: "recoverable", lock: error.lockPath,
      condition: `The lock remained held for ${error.waitedMs}ms.`, remedy: { text: "Wait for the holder to finish, then retry the command." } } } };
  }
}

function invalidRemoteCommand(condition: string): Extract<StoreRemoteResult, { status: "refused" }> {
  return { status: "refused", refusal: { code: "request-invalid", class: "terminal", condition,
    remedy: { text: "Set one remote's role with arc store remote <remote> <push|read|off>, or run arc store remote alone to view the roles." } } };
}

function invalidCommand(condition: string): Extract<StoreMigrateResult, { status: "refused" }> {
  return { status: "refused", refusal: { code: "request-invalid", class: "terminal", condition,
    remedy: { text: "Correct the migration input and retry." } } };
}
