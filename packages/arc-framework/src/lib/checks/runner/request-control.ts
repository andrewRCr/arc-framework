/** Own request-wide interruption while each selected check retains its facade lifetime. */
import { prepareSelectedCheckExecution, type CheckExecutionAttempt, type CheckExecutionPreparation,
  type PreparedCheckExecution, type RetainedCheckExecution } from "./execution.js";

/** One invocation's runner attempts, including preparations that have no context yet. */
export interface CheckRunnerRequestControl {
  readonly interrupted: boolean;
  readonly prepare: typeof prepareSelectedCheckExecution;
  finish(cancelPending: boolean): Promise<readonly RetainedCheckExecution[]>;
}

interface OwnedAttempt { attempt: CheckExecutionAttempt; completed: Promise<void>; complete(): void }

/** Attach signal handling only when a configured runner is actually prepared. */
export function createCheckRunnerRequestControl(): CheckRunnerRequestControl { return new RunnerRequestControl(); }

class RunnerRequestControl implements CheckRunnerRequestControl {
  private readonly active = new Set<OwnedAttempt>();
  private readonly retained: RetainedCheckExecution[] = [];
  private interruptedValue = false;
  private finished = false;
  private listening = false;
  private interrupts = 0;

  get interrupted(): boolean { return this.interruptedValue || this.finished; }

  readonly prepare: typeof prepareSelectedCheckExecution = (input, io) => {
    if (this.finished) throw new Error("Check request is closed; retry explicitly with a fresh request.");
    this.listen();
    const attempt = prepareSelectedCheckExecution(input, io);
    const owned = ownAttempt(attempt);
    this.active.add(owned);
    if (this.interruptedValue) this.cancel(owned);
    const preparation = attempt.then(result => this.prepared(owned, result), (cause: unknown) => {
      this.remember(attempt.retained);
      this.release(owned);
      throw cause;
    });
    return Object.defineProperties(preparation, { planId: { value: attempt.planId },
      retained: { get: () => attempt.retained }, cancel: { value: () => attempt.cancel() },
      terminate: { value: () => { attempt.terminate(); } } }) as CheckExecutionAttempt;
  };

  async finish(cancelPending: boolean): Promise<readonly RetainedCheckExecution[]> {
    this.finished = true;
    if (cancelPending) {
      this.interruptedValue = true;
      for (const owned of this.active) this.cancel(owned);
    }
    try { await Promise.all([...this.active].map(owned => owned.completed)); }
    finally { this.detach(); }
    return [...new Map(this.retained.map(retained => [retained.planId, retained])).values()];
  }

  private prepared(owned: OwnedAttempt, result: CheckExecutionPreparation): CheckExecutionPreparation {
    if (result.status === "ready") return { status: "ready", execution: this.ownExecution(owned, result.execution) };
    if (result.status === "uncertain") this.remember(result.retained);
    this.release(owned);
    return result;
  }

  private ownExecution(owned: OwnedAttempt, execution: PreparedCheckExecution): PreparedCheckExecution {
    return Object.freeze({ ...execution, get observedOutcomes() { return execution.observedOutcomes; }, close: async () => {
      try {
        const closure = await execution.close();
        if (closure.status === "uncertain") this.remember(closure.retained);
        return closure;
      } catch (cause) { this.remember(owned.attempt.retained); throw cause; }
      finally { this.release(owned); }
    } });
  }

  private remember(retained: RetainedCheckExecution | undefined): void { if (retained !== undefined) this.retained.push(retained); }

  private release(owned: OwnedAttempt): void {
    this.active.delete(owned);
    owned.complete();
    if (this.active.size === 0 && !this.interruptedValue) this.detach();
  }

  private cancel(owned: OwnedAttempt): void { void owned.attempt.cancel().catch(() => undefined); }

  private readonly onSignal = (signal: NodeJS.Signals) => {
    this.interruptedValue = true;
    this.interrupts++;
    if (this.interrupts === 1) {
      process.stderr.write("Stopping checks; waiting for runner settlement. Interrupt again to stop local adapters.\n");
      for (const owned of this.active) this.cancel(owned);
    } else if (this.interrupts === 2) {
      process.stderr.write("Stopping local adapters; retained inputs may require provider recovery. Interrupt again to exit without waiting.\n");
      for (const owned of this.active) owned.attempt.terminate();
    } else {
      // Uncertain closures already left the active set; their recovery would otherwise print only after exit.
      const plans = new Set([...this.retained.map(retained => retained.planId),
        ...[...this.active].flatMap(owned => owned.attempt.retained === undefined ? [] : [owned.attempt.retained.planId])]);
      process.stderr.write(`Exiting without settlement; inspect and settle retained plans before retrying: ${[...plans].join(", ") || "none recorded"}.\n`);
      this.detach();
      process.kill(process.pid, signal);
    }
  };

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    process.on("SIGINT", this.onSignal);
    process.on("SIGTERM", this.onSignal);
  }

  private detach(): void {
    if (!this.listening) return;
    this.listening = false;
    process.off("SIGINT", this.onSignal);
    process.off("SIGTERM", this.onSignal);
  }
}

function ownAttempt(attempt: CheckExecutionAttempt): OwnedAttempt {
  let complete: () => void = () => undefined;
  const completed = new Promise<void>(resolve => { complete = resolve; });
  return { attempt, completed, complete };
}
