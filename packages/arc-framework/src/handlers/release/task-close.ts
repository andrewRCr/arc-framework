/** Task close workflow shared by the wrapper's runtime adapter and its process-boundary checks. */
import type { DefaultCaptureSetResult } from "../../lib/git/default-capture-set.js";
import { prepareTaskClose, runTaskClose, type TaskCloseResult, type TaskVerbContext } from "../../lib/work-unit/verbs/task-close.js";
import type { ReleaseTaskClose } from "./commit.js";

/** Bind the exact selected tasks and one base refresh across the commit boundary.
 * @param ids - Leading wrapper option's task IDs, or the cursor leaf
 * @param resolveContext - Current checkout identity and operational context, reread after committing
 * @param report - Caller-owned rendering for successful close reports
 * @returns The release cascade's optional task close operations
 */
export function createTaskCloseOperations(ids: readonly string[], resolveContext: () => Promise<TaskVerbContext | null>,
  report: (result: TaskCloseResult) => void): ReleaseTaskClose {
  let selected = [...ids];
  let refreshed: Extract<DefaultCaptureSetResult, { status: "available" }> | undefined;
  const continuation = { text: `Run arc task close${ids.length === 0 ? "" : ` ${ids.join(" ")}`}.`, argv: ["arc", "task", "close", ...ids] };
  return {
    continuation,
    get retryArgs() { return selected.length === 0 ? ["--close"] : [`--close=${selected.join(",")}`]; },
    precheck: async () => {
      const ctx = await resolveContext();
      if (ctx === null) return { status: "refused", check: "current-work-unit", remedy: { text: "Run session-init to select the current work unit." } };
      const result = await prepareTaskClose(ctx, { ids }, { precommit: true });
      if (result.status === "refused") return { status: "refused", check: result.code, remedy: result.remedy };
      selected = result.targets.ids; refreshed = result.snapshot;
      continuation.argv = ["arc", "task", "close", ...selected]; continuation.text = `Run arc task close ${selected.join(" ")}.`;
      return { status: "ready" };
    },
    close: async () => {
      const ctx = await resolveContext();
      if (ctx === null) return { status: "refused", reason: "The current work unit no longer resolves.", remedy: continuation };
      const result = await runTaskClose(ctx, { ids: selected, refreshed });
      if (result.status === "closed") report(result);
      return result.status === "refused" ? result : { status: "closed" };
    },
  };
}
