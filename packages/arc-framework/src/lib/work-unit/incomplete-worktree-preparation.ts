/** Physical preparation that failed to restore its checkout before returning a receipt. */
import { quoteShellArgument } from "../release/commit-message-retry.js";

/** Carries only established rollback failures, leaving repair to the checkout owner. */
export class IncompleteWorktreePreparationError extends AggregateError {
  constructor(
    readonly checkoutPaths: readonly string[],
    readonly rollbackFailures: readonly unknown[],
    cause?: unknown,
  ) {
    const primary = cause ?? rollbackFailures[0];
    super(cause === undefined ? rollbackFailures : [cause, ...rollbackFailures],
      primary instanceof Error ? primary.message : String(primary), { cause: primary });
    this.name = "IncompleteWorktreePreparationError";
  }

  /** Exact retained residue for the composing lifecycle recovery result. */
  get recoveryReason(): string {
    return `Checkout preparation at ${this.checkoutPaths.join(", ")} has incomplete rollback: ${this.rollbackFailures.map(String).join("; ")}`;
  }

  /** Describe established residue and the owner repair required before the original command can retry. */
  describeRecovery(retryCommand: readonly string[]): string {
    return `${this.message}; ${this.recoveryReason}\n`
      + "Inspect: arc locus --json; git worktree list --porcelain\n"
      + "Have the checkout owner inspect the stored work-unit state, checkout path, branch, local edits, and ownership claim. Preserve all work and changed marker generations. The owner must restore the pre-operation checkout/branch/claim or finish the conflicting work before retrying.\n"
      + `Retry only after the owner repairs the physical state: ${retryCommand.map(quoteShellArgument).join(" ")}`;
  }
}

/** Preserve provider-established residue while leaving ordinary failures unchanged. */
export function describeWorktreePreparationFailure(error: unknown, retryCommand: readonly string[]): string {
  return error instanceof IncompleteWorktreePreparationError
    ? error.describeRecovery(retryCommand) : error instanceof Error ? error.message : String(error);
}
