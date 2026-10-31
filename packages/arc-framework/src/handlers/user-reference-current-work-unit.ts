/** Resolve advisory reconciliation context while preserving checkout recovery warnings. */
import type { GitExec } from "../lib/git/exec.js";
import type { Store } from "../lib/store/contract.js";
import { resolveCurrentWorkUnit } from "../lib/store/current-work-unit.js";
import { branchToWorkUnitSlug } from "../lib/work-unit/work-unit-slug.js";

/** Keep an unbound checkout out of managed references without hiding its recovery route. */
export async function resolveReconcileCurrentWorkUnit(cwd: string, exec: GitExec, store: Store): Promise<{
  workUnit?: string; warning?: string;
}> {
  const current = await resolveCurrentWorkUnit({ cwd, store });
  if (current.status === "resolved") return { workUnit: current.candidate.reference.owner.name };
  if (current.status === "unbound") return { warning: current.unbound.reason };
  if (current.status === "ambiguous" || current.warnings.length > 0 || store.capabilities.stateOffBranch) return {};
  try {
    const read = await exec("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    return { workUnit: branchToWorkUnitSlug(read.stdout.trim()) ?? undefined };
  } catch { return {}; }
}
