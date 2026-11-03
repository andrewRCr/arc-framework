/** Provider-neutral bounded wait with exponential backoff. */

export interface BoundedWaitClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export type BoundedWaitAttempt<T> =
  | { kind: "continue" }
  | { kind: "return"; value: T };

export interface BoundedWaitInput<T> {
  timeoutMs: number;
  pollIntervalMs: number;
  clock: BoundedWaitClock;
  /** False when the deadline callback already performs its own bounded final observation. */
  observeAtDeadline?: boolean;
  /** Observe with the supplied abort signal; implementations must honor cancellation. */
  attempt(input: { signal: AbortSignal; elapsedMs: number }): Promise<BoundedWaitAttempt<T>>;
  deadline(elapsedMs: number): T | Promise<T>;
}

function nextDelay(attempt: number, intervalMs: number, remainingMs: number): number {
  return Math.min(intervalMs * (2 ** Math.min(attempt, 4)), remainingMs);
}

function isDeadlineAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted
    && error instanceof Error
    && ["AbortError", "TimeoutError"].includes(error.name);
}

const FINAL_OBSERVATION_TIMEOUT_MS = 5_000;

function observationTimeout(remainingMs: number, finalAllowed: boolean): number {
  if (remainingMs > 0) return remainingMs;
  return finalAllowed ? FINAL_OBSERVATION_TIMEOUT_MS : 0;
}

/**
 * Poll within the deadline, then observe once more after the last sleep.
 * The final observation receives an abort deadline of five seconds; attempts must honor the supplied signal.
 */
export async function boundedWait<T>(input: BoundedWaitInput<T>): Promise<T> {
  const startedAt = input.clock.now();
  let attempt = 0;
  let slept = false;
  for (;;) {
    const elapsedMs = input.clock.now() - startedAt;
    const remainingMs = input.timeoutMs - elapsedMs;
    const timeoutMs = observationTimeout(remainingMs, slept && input.observeAtDeadline !== false);
    if (timeoutMs <= 0) return await input.deadline(elapsedMs);

    let observation: BoundedWaitAttempt<T>;
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      observation = await input.attempt({ signal, elapsedMs });
    } catch (error) {
      if (isDeadlineAbort(error, signal)) return await input.deadline(input.clock.now() - startedAt);
      throw error;
    }
    if (observation.kind === "return") return observation.value;

    const afterReadRemaining = input.timeoutMs - (input.clock.now() - startedAt);
    if (remainingMs <= 0 || afterReadRemaining <= 0) return await input.deadline(input.clock.now() - startedAt);
    await input.clock.sleep(nextDelay(attempt, input.pollIntervalMs, afterReadRemaining));
    slept = true;
    attempt += 1;
  }
}
