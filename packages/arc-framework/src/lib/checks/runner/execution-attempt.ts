/** In-memory interruption controls available before a prepared context exists. */
import type { CancelResult } from "./contract.js";
import type { RetainedCheckExecution } from "./execution.js";
import type { CheckRunnerSession } from "./session.js";

/** One caller-known attempt's local capture and adapter control surface. */
export interface ExecutionAttemptControl {
  readonly planId: string;
  readonly cancelled: boolean;
  readonly signal: AbortSignal;
  readonly retained: RetainedCheckExecution | undefined;
  bindCaptured(describe: () => RetainedCheckExecution): void;
  releaseCaptured(): void;
  attachSession(session: CheckRunnerSession): void;
  cancel(): Promise<CancelResult | undefined>;
  terminate(): void;
}

/** Create interruption control without inventing remote settlement or a durable job record. */
export function createExecutionAttemptControl(planId: string): ExecutionAttemptControl {
  const controller = new AbortController();
  let describe: (() => RetainedCheckExecution) | undefined;
  let session: CheckRunnerSession | undefined;
  let cancelled = false;
  const cancel = async (): Promise<CancelResult | undefined> => {
    cancelled = true;
    controller.abort();
    const current = session;
    if (current === undefined) return undefined;
    const contextId = describe?.().contextId;
    try { return await current.request({ method: "check/cancel", params: { planId,
      ...(contextId === undefined ? {} : { contextId }) } }); }
    catch (cause) { current.closeInput(); throw cause; }
  };
  return { planId, get cancelled() { return cancelled; }, signal: controller.signal,
    get retained() { return describe?.(); },
    bindCaptured: value => { describe = value; }, releaseCaptured: () => { describe = undefined; },
    attachSession: value => {
      session = value;
      const forget = () => { if (session === value) session = undefined; };
      void value.closed.then(forget, forget);
      if (cancelled) void cancel().catch(() => undefined);
    },
    cancel, terminate: () => { cancelled = true; controller.abort(); session?.terminate(); },
  };
}
