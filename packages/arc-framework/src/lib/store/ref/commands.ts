/** Explicit ref-store commands and their clone-wide migration serialization. */

import type { Store } from "../contract.js";
import { StoreMigrateInputSchema, StoreRemoteInputSchema, type StoreMigrateInput, type StoreMigrateResult,
  type StoreRemoteInput, type StoreRemoteResult, type MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { designatedStoreLayout } from "./layout-state.js";
import { readRefDesignation } from "./designation.js";
import { migrationCodeContext, readMoveRecord, type RecordedMove, type RecordedFollow } from "./migrate-record.js";
import { moveRefRemote } from "./migrate-remote.js";
import { moveRefLayout } from "./migrate-layout.js";
import { AdvisoryLockTimeoutError } from "../../advisory-lock.js";
import { applyRefRemoteSetting, remoteView } from "./remote-setting.js";
import { guardRefFollowSetting, readRefFollowDue } from "./follow-due.js";
import { resumeRefFollow } from "./follow.js";
import { judgeRefFollow } from "./follow-candidates.js";

/** No-target migration reconciles the physical store with its explicitly recorded roles. */
export async function runRefMigrate(context: RefBackendContext, store: Store, input: StoreMigrateInput): Promise<StoreMigrateResult> {
  const parsed = StoreMigrateInputSchema.safeParse(input);
  if (!parsed.success) return invalidCommand("The migration request is invalid.");
  if (parsed.data.trial && (!parsed.data.to && !parsed.data.import || parsed.data.leaveSource)) return invalidCommand("--trial requires --to or --import and cannot accompany --leave-source.");
  if (parsed.data.import) return withMigrationLock(context, async () => {
    const { importTrackedState } = await import("./import/entry.js");
    return importTrackedState(context, store, parsed.data);
  });
  if (parsed.data.leaveSource) return unsupportedCommand("--leave-source is not implemented.");
  return withMigrationLock(context, async () => {
    const existing = await readMoveRecord(await migrationCodeContext(context));
    if (existing.status === "refused") return existing;
    if (existing.result?.record.kind === "remote") return moveRefRemote(context, store, parsed.data.to, parsed.data.trial, { record: existing.result.record, tip: existing.result.tip });
    if (existing.result?.record.kind === "follow") return resumeFollowRequest(context, store, { record: existing.result.record, tip: existing.result.tip }, parsed.data.to);
    let finished: MigrateReport | undefined;
    if (existing.result?.record.kind === "layout") {
      const resumed = await moveRefLayout(context, store, existing.result.record.destination, existing.result.record.setting, { record: existing.result.record, tip: existing.result.tip });
      if (resumed.status === "refused") return resumed;
      finished = resumed.result;
    }
    if (parsed.data.to) return moveRefRemote(context, store, parsed.data.to, parsed.data.trial);
    return reconcileNoTarget(context, store, finished);
  });
}

async function reconcileNoTarget(context: RefBackendContext, store: Store, finished?: MigrateReport): Promise<StoreMigrateResult> {
  const due = await readRefFollowDue(context);
  if (due) {
    const followed = await judgeRefFollow(context, due);
    if (followed.status === "refused") return followed;
    if (followed.status === "decided") return followed.result;
  }
  const designation = await readRefDesignation(context);
  const aligned = await moveRefLayout(context, store, designatedStoreLayout(designation));
  return aligned.status === "refused" || !finished ? aligned : { status: "ok", result: combineLayoutReports(finished, aligned.result) };
}

/** Apply a code remote's own setting in the order its layout switch requires. */
export async function runRefRemote(context: RefBackendContext, store: Store, input: StoreRemoteInput): Promise<StoreRemoteResult> {
  const parsed = StoreRemoteInputSchema.safeParse(input);
  if (!parsed.success) return unsupportedCommand("The remote request is invalid.");
  if (!input.remote && !input.role) return { status: "ok", result: await remoteView(context) };
  if (!input.remote || !input.role) return invalidCommand("A remote setting requires both a remote and a role.");
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
    if (follow) return follow;
    const applied = await applyRefRemoteSetting(context, store, setting, input.ownState);
    if (applied.status === "ok" && completed) applied.result.report = applied.result.report
      ? combineLayoutReports(completed, applied.result.report) : completed;
    return applied;
  });
}

async function resumeFollowRequest(context: RefBackendContext, store: Store, recorded: RecordedFollow, to?: string): Promise<import("../commands.js").StoreCommandResult<MigrateReport>> {
  if (to) return { status: "refused", refusal: { code: "move-unfinished", class: "recoverable",
    condition: "A follow is recorded; finish its retained answer before requesting another remote migration or trial.",
    remedy: { text: "Run arc store migrate with no target to finish the recorded follow, then retry the requested migration.", argv: ["arc", "store", "migrate"] } } };
  return resumeRefFollow(context, store, recorded);
}

async function finishRecordedMove(context: RefBackendContext, store: Store, existing: RecordedMove): Promise<import("../commands.js").StoreCommandResult<MigrateReport>> {
  const { record, tip } = existing;
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

function unsupportedCommand(condition: string): { status: "refused"; refusal: { code: "unsupported"; class: "terminal"; condition: string; remedy: { text: string } } } {
  return { status: "refused", refusal: { code: "unsupported", class: "terminal", condition,
    remedy: { text: "Use a supported store command input, then retry." } } };
}

function invalidCommand(condition: string): Extract<StoreMigrateResult, { status: "refused" }> {
  return { status: "refused", refusal: { code: "request-invalid", class: "terminal", condition,
    remedy: { text: "Correct the migration input and retry." } } };
}

function combineLayoutReports(first: MigrateReport, last: MigrateReport): MigrateReport {
  return { ...last, refs: [...first.refs, ...last.refs], refused: [...first.refused, ...last.refused],
    brokenChains: [...first.brokenChains, ...last.brokenChains], reviewMapping: [...first.reviewMapping, ...last.reviewMapping],
    differingNotes: [...first.differingNotes, ...last.differingNotes], notices: [...first.notices, ...last.notices] };
}
