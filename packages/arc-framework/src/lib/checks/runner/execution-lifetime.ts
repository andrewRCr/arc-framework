/** Dispose captured execution resources only after authoritative settlement or no process start. */
import type { CheckRunnerSession } from "./session.js";
import type { CheckExecutionClosure, RetainedCheckExecution } from "./execution.js";

/** Resource ownership and retained inspection coordinates for one runner conversation. */
export interface ExecutionLifetimeInput {
  readonly session: CheckRunnerSession;
  readonly dispose: () => Promise<void>;
  readonly retained: () => RetainedCheckExecution;
}

/** Idempotent normal disposal, allowing an explicit later close after outstanding work settles. */
export interface ExecutionLifetime { close(): Promise<CheckExecutionClosure> }

/** Share one resource owner across preparation failure, cache hits and live execution. */
export function createExecutionLifetime(input: ExecutionLifetimeInput): ExecutionLifetime {
  let closing: Promise<CheckExecutionClosure> | undefined;
  return { close: () => {
    closing ??= closeCapturedExecution(input).then(result => {
      if (result.status === "uncertain") closing = undefined;
      return result;
    });
    return closing;
  } };
}

async function closeCapturedExecution(input: ExecutionLifetimeInput): Promise<CheckExecutionClosure> {
  let closure;
  try { closure = await input.session.close(); }
  catch { return { status: "uncertain", reason: "Execution still needs settlement; inspect and settle the retained adapter attempt before retrying.", retained: input.retained() }; }
  if (closure.status === "uncertain") return { ...closure, status: "uncertain", retained: input.retained() };
  const retained = input.retained();
  const removalWarning = await disposeSettledExecutionInputs(input.dispose, [retained.sourceRoot, retained.manifest, ...retained.environmentFiles]);
  const cleanupWarning = [closure.status === "closed" ? closure.cleanupWarning : undefined, removalWarning].filter(Boolean).join("; ") || undefined;
  return { status: "closed", exit: closure.exit, ...(cleanupWarning === undefined ? {} : { cleanupWarning }),
    ...(closure.status === "unavailable" ? { unstarted: closure.reason } : {}) };
}

/** Remove inputs whose use is already settled, retaining actionable locations when local removal fails. */
export async function disposeSettledExecutionInputs(dispose: () => Promise<void>, locations: readonly string[]): Promise<string | undefined> {
  try { await dispose(); return undefined; }
  catch {
    return locations.length === 0 ? "Inspect temporary storage and remove settled captured inputs manually."
      : `Remove the settled captured inputs manually: ${locations.map(path => JSON.stringify(path)).join(", ")}`;
  }
}
