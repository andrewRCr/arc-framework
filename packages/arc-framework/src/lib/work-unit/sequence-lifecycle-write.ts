/** Recoverable physical operations around one atomic lifecycle record batch. */
import type { StoreResult, StoreRefusal } from "../store/refusal.js";
import type { BatchResult } from "../store/write.js";
import type { LifecycleGitStep, LifecycleGitContinuation } from "./store-transition-types.js";

/** Atomic write outcome, retaining physical recovery independently of record persistence. */
export type LifecycleWriteSequence =
  | { status: "written"; batch: BatchResult; continuation?: LifecycleGitContinuation }
  | { status: "refused"; refusal: StoreRefusal; rollbackFailure?: string }
  | { status: "failed"; reason: string };

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
    const undo = await rollback(prepared);
    return { status: "failed", reason: `${String(error)}${undo === undefined ? "" : `; rollback failed: ${undo}`}` };
  }
  let result: StoreResult<BatchResult>;
  try { result = await input.write(); }
  catch (error) {
    const undo = await rollback(prepared);
    return { status: "failed", reason: `${String(error)}${undo === undefined ? "" : `; rollback failed: ${undo}`}` };
  }
  if (result.status === "refused") {
    const rollbackFailure = await rollback(prepared);
    return { ...result, ...(rollbackFailure === undefined ? {} : { rollbackFailure }) };
  }
  if (input.side === "after") return finishSteps(input.steps, result.result);
  return { status: "written", batch: result.result };
}

async function rollback(steps: readonly LifecycleGitStep[]): Promise<string | undefined> {
  const errors: string[] = [];
  for (const step of [...steps].reverse()) {
    try { await step.rollback?.(); } catch (error) { errors.push(`${step.name}: ${String(error)}`); }
  }
  return errors.length === 0 ? undefined : errors.join("; ");
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
