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
  attempt(input: { signal: AbortSignal; elapsedMs: number }): Promise<BoundedWaitAttempt<T>>;
  deadline(elapsedMs: number): T | Promise<T>;
}

function nextDelay(attempt: number, intervalMs: number, remainingMs: number): number {
  return Math.min(intervalMs * (2 ** Math.min(attempt, 4)), remainingMs);
}

function isDeadlineAbort(error: unknown): boolean {
  return error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
}

/** Run one bounded observation loop. */
export async function boundedWait<T>(input: BoundedWaitInput<T>): Promise<T> {
  const startedAt = input.clock.now();
  let attempt = 0;
  for (;;) {
    const elapsedMs = input.clock.now() - startedAt;
    const remainingMs = input.timeoutMs - elapsedMs;
    if (remainingMs <= 0) return await input.deadline(elapsedMs);

    let observation: BoundedWaitAttempt<T>;
    try {
      observation = await input.attempt({ signal: AbortSignal.timeout(remainingMs), elapsedMs });
    } catch (error) {
      if (isDeadlineAbort(error)) return await input.deadline(input.clock.now() - startedAt);
      throw error;
    }
    if (observation.kind === "return") return observation.value;

    const afterReadRemaining = input.timeoutMs - (input.clock.now() - startedAt);
    if (afterReadRemaining <= 0) return await input.deadline(input.clock.now() - startedAt);
    await input.clock.sleep(nextDelay(attempt, input.pollIntervalMs, afterReadRemaining));
    attempt += 1;
  }
}
