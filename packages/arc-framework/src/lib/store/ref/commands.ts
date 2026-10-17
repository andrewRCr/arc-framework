/** Explicit ref-store commands and their clone-wide migration serialization. */

import type { Store } from "../contract.js";
import { StoreMigrateInputSchema, StoreRemoteInputSchema, type StoreMigrateInput, type StoreMigrateResult,
  type StoreRemoteInput, type StoreRemoteResult, type StoreCommandResult, type MigrateReport } from "../commands.js";
import type { RefBackendContext } from "./context.js";
import { designatedStoreLayout } from "./layout-state.js";
import { readRefDesignation } from "./designation.js";
import { migrationCodeContext, readLayoutMoveRecord } from "./migrate-record.js";
import { moveRefLayout } from "./migrate-layout.js";
import { AdvisoryLockTimeoutError } from "../../advisory-lock.js";

/** No-target migration reconciles the physical store with its explicitly recorded roles. */
export async function runRefMigrate(context: RefBackendContext, store: Store, input: StoreMigrateInput): Promise<StoreMigrateResult> {
  const parsed = StoreMigrateInputSchema.safeParse(input);
  if (!parsed.success) return invalidCommand("The migration request is invalid.");
  if (parsed.data.trial && (!parsed.data.to && !parsed.data.import || parsed.data.leaveSource)) return invalidCommand("--trial requires --to or --import and cannot accompany --leave-source.");
  if (parsed.data.import) return unsupportedCommand("--import is not implemented.");
  if (parsed.data.leaveSource) return unsupportedCommand("--leave-source is not implemented.");
  if (parsed.data.to) {
    const designation = await readRefDesignation(context);
    if (!designation.pushes.length) return { status: "refused", refusal: { code: "no-state-remote", class: "recoverable",
      condition: "This clone has no state remote to move from.", remedy: { text: "Designate a code repository remote with arc store remote <remote> push, or change the backing pointer and run arc store remote backing push, then retry --to." } } };
    return unsupportedCommand("--to is not implemented.");
  }
  return withMigrationLock(context, async () => {
    const existing = await readLayoutMoveRecord(await migrationCodeContext(context));
    if (existing.status === "refused") return existing;
    let finished: MigrateReport | undefined;
    if (existing.result) {
      const resumed = await moveRefLayout(context, store, existing.result.record.destination, existing.result.record.setting, existing.result);
      if (resumed.status === "refused") return resumed;
      finished = resumed.result;
    }
    const designation = await readRefDesignation(context);
    const aligned = await moveRefLayout(context, store, designatedStoreLayout(designation));
    return aligned.status === "refused" || !finished ? aligned : { status: "ok", result: combineLayoutReports(finished, aligned.result) };
  });
}

/** Apply a code remote's own setting in the order its layout switch requires. */
export async function runRefRemote(context: RefBackendContext, store: Store, input: StoreRemoteInput): Promise<StoreRemoteResult> {
  const parsed = StoreRemoteInputSchema.safeParse(input);
  if (!parsed.success) return unsupportedCommand("The remote request is invalid.");
  const designation = await readRefDesignation(context);
  if (!input.remote || input.remote !== designation.codeRemote || !input.role || input.role === "read") return unsupportedCommand("This remote setting is not implemented.");
  const setting = { remote: input.remote, role: input.role };
  return withMigrationLock(context, async () => {
    const existing = await readLayoutMoveRecord(await migrationCodeContext(context));
    if (existing.status === "refused") return existing;
    if (existing.result) {
      const finished = await moveRefLayout(context, store, existing.result.record.destination, existing.result.record.setting, existing.result);
      if (finished.status === "refused") return finished;
    }
    const moved = await moveRefLayout(context, store, input.role === "push" ? "default" : "separate", setting);
    return moved.status === "refused" ? moved : { status: "ok", result: { remotes: (await readRefDesignation(context)).remotes, report: moved.result } };
  });
}

async function withMigrationLock<T>(context: RefBackendContext, operation: () => Promise<StoreCommandResult<T>>): Promise<StoreCommandResult<T>> {
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
