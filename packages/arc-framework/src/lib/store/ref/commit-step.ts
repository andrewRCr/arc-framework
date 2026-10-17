/** One publication boundary shared by ordinary writes, merges, and migration copies. */
import type { RefBackendContext } from "./context.js";
import { readRefRepository } from "./repository.js";
import { flushRefBlobStage } from "./tree-write.js";

/** Copy callers either already hold serialization or target isolated temporary refs. */
export type RefCommitMode = "locked" | "held" | "unlocked";
/** A changed layout requires releasing every lock and resolving the operation again. */
export type RefCommitStepResult<T> = { status: "completed"; result: T } | { status: "layout-changed" };

/** Serialize the commit alone, checking the selected layout under its last-acquired lock. */
export async function commitRefStep<T>(context: RefBackendContext, operation: (physical: RefBackendContext) => Promise<T>,
  mode: RefCommitMode = "locked"): Promise<RefCommitStepResult<T>> {
  const commit = async (): Promise<RefCommitStepResult<T>> => ({ status: "completed", result: await operation(await flushRefBlobStage(context)) });
  if (mode !== "locked") return commit();
  const selected = context.repository;
  if (!selected) throw new Error("A serialized commit requires a selected repository");
  const release = await context.lock("layout");
  try {
    const current = await readRefRepository(selected.source);
    if (current.repository?.gitDir !== selected.gitDir) return { status: "layout-changed" };
    return await commit();
  } finally { await release(); }
}
