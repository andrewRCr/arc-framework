/** Recoverable physical operations around one atomic lifecycle record batch. */
import { quoteShellArgument } from "../release/commit-message-retry.js";
import type { StoreResult, StoreRefusal } from "../store/refusal.js";
import type { BatchResult } from "../store/write.js";
import type { LifecycleGitStep, LifecycleGitContinuation, LifecycleRollbackRecovery } from "./store-transition-types.js";

/** Atomic write outcome, retaining physical recovery independently of record persistence. */
export type LifecycleWriteSequence =
  | { status: "written"; batch: BatchResult; continuation?: LifecycleGitContinuation }
  | { status: "refused"; refusal: StoreRefusal; rollbackFailure?: string; recovery?: LifecycleRollbackRecovery }
  | { status: "failed"; reason: string; recovery?: LifecycleRollbackRecovery };

/** Run supplied steps on the declared side, undoing preparation when persistence refuses.
 * @param input - The atomic write and the edge's physical ordering.
 * @returns The landed record result or the exact refusal and unfinished physical operation.
 */
export async function sequenceLifecycleWrite(input: {
  write: () => Promise<StoreResult<BatchResult>>;
  side: "none" | "before" | "after";
  steps: readonly LifecycleGitStep[];
}): Promise<LifecycleWriteSequence> {
  const prepared: LifecycleGitStep[] = [];
  try {
    if (input.side === "before") {
      for (const step of input.steps) {
        prepared.push(step);
        await step.run();
      }
    }
  } catch (error) {
    return failedPreparation(error, prepared);
  }
  let result: StoreResult<BatchResult>;
  try { result = await input.write(); }
  catch (error) {
    return failedPreparation(error, prepared);
  }
  if (result.status === "refused") {
    const recovery = await rollback(prepared);
    return { ...result, ...(recovery === undefined ? {} : { recovery, rollbackFailure: describeRecovery(recovery) }) };
  }
  if (input.side === "after") return finishSteps(input.steps, result.result);
  return { status: "written", batch: result.result };
}

async function failedPreparation(error: unknown, steps: readonly LifecycleGitStep[]): Promise<LifecycleWriteSequence> {
  const recovery = await rollback(steps);
  return { status: "failed", reason: `${String(error)}${recovery === undefined ? "" : `; rollback failed: ${describeRecovery(recovery)}`}`,
    ...(recovery === undefined ? {} : { recovery }) };
}
async function rollback(steps: readonly LifecycleGitStep[]): Promise<LifecycleRollbackRecovery | undefined> {
  const failures: { step: string; reason: string }[] = [];
  const retries = new Map<string, readonly string[]>();
  for (const step of [...steps].reverse()) {
    try { await step.rollback?.(); } catch (error) {
      failures.push({ step: step.name, reason: String(error) });
      retries.set(JSON.stringify(step.retryCommand), [...step.retryCommand]);
    }
  }
  return failures.length === 0 ? undefined : { kind: "rollback", failures,
    inspect: [["arc", "locus", "--json"], ["git", "worktree", "list", "--porcelain"]],
    repair: "Have the checkout owner inspect the stored work-unit state, checkout paths, branch, local edits, and ownership claim. Preserve all work and changed marker generations. The owner must restore the pre-operation checkout/branch/claim or finish the conflicting work before retrying.",
    retryAfterRepair: [...retries.values()] };
}
function describeRecovery(recovery: LifecycleRollbackRecovery): string {
  const command = (argv: readonly string[]): string => argv.map(quoteShellArgument).join(" ");
  return `${recovery.failures.map((failure) => `${failure.step}: ${failure.reason}`).join("; ")}\n`
    + `Physical rollback is incomplete. Inspect: ${recovery.inspect.map(command).join("; ")}\n`
    + `${recovery.repair}\nRetry only after the owner repairs the physical state: ${recovery.retryAfterRepair.map(command).join("; ")}`;
}

async function finishSteps(steps: readonly LifecycleGitStep[], batch: BatchResult): Promise<LifecycleWriteSequence> {
  for (const step of steps) {
    try { await step.run(); }
    catch (error) {
      return { status: "written", batch, continuation: {
        kind: "git-step", step: step.name, reason: String(error), argv: [...step.retryCommand],
      } };
    }
  }
  return { status: "written", batch };
}
