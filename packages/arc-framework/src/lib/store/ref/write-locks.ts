/** Ordered machine-local ref lock scopes with complete partial-acquisition cleanup. */

import type { RefBackendContext } from "./context.js";

/** Run an operation while holding every distinct ref lock and attempt every release before returning. */
export async function withRefLocks<T>(context: RefBackendContext, refs: Iterable<string>, operation: () => Promise<T>): Promise<T> {
  const releases: (() => Promise<void>)[] = [];
  let outcome: { status: "ok"; value: T } | { status: "error"; error: unknown };
  try {
    for (const ref of [...new Set(refs)].sort()) releases.push(await context.lock(ref));
    outcome = { status: "ok", value: await operation() };
  } catch (error) { outcome = { status: "error", error }; }
  const settled = await Promise.allSettled(releases.map((release) => release()));
  const errors = settled.flatMap((result) => result.status === "rejected" ? [result.reason as unknown] : []);
  if (outcome.status === "error") {
    if (errors.length > 0) throw new AggregateError([outcome.error, ...errors], "Ref write and lock cleanup failed", { cause: outcome.error });
    throw outcome.error;
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Ref lock cleanup failed");
  return outcome.value;
}
