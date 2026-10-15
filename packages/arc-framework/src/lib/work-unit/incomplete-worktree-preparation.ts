/** Physical preparation that failed to restore its checkout before returning a receipt. */

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
}
