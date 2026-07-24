/** Deadline boundary for provider-effectful frontline execution. */

export const DEFAULT_FRONTLINE_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

/** Pass one shrinking deadline and abort signal to a carrier, aborting it on expiry. */
export async function executeBoundedFrontlineCarrier<T>(input: {
  timeoutMs?: number;
  execute(context: { remainingMs: number; signal: AbortSignal }): Promise<T>;
}): Promise<T> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_FRONTLINE_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_DELAY_MS) {
    throw new Error("invalid frontline execution timeout");
  }
  const startedAt = Date.now();
  const deadlineAt = startedAt + timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await input.execute({
      remainingMs: Math.max(1, deadlineAt - Date.now()),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
