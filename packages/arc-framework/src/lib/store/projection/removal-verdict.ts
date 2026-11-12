/** Distinguish a locally refused edit from unavailable evidence during retirement feasibility. */
import type { ProjectionRemovalSlots } from "../../git/worktree-removal.js";
import type { ProjectionFeasibility } from "./engine-read-only.js";
import { sameReference, type RecordReference } from "../identity.js";

/** A check grants only provisional feasibility; persistence repeats it under the target's lease. */
export type ProjectionRemovalCheck = Awaited<ReturnType<ProjectionRemovalSlots["check"]>>;

/** Preserve failed observations separately from locally refused authored changes. */
export function projectionFeasibilityRefusal(prepared: ProjectionFeasibility, path: string): Exclude<ProjectionRemovalCheck, { kind: "passes" }> | null {
  if (prepared.kind === "ready") {
    const plan = prepared.submission.plan;
    const current = plan.observations.find(observation => sameReference(observation.reference, plan.mutation.reference));
    return unresolvedRemovalConflicts(path, current?.expected?.conflicts ?? [], plan.mutation.resolves ?? []);
  }
  if (prepared.kind === "held") {
    const failure = prepared.readRefusal ?? prepared.refusal;
    if (failure !== undefined) return { kind: "unobservable", detail: failure.remedy.text };
  }
  if (prepared.kind === "held" && prepared.result.answer === "no-edit") return null;
  if (prepared.kind === "refused" && prepared.nativeRefusal === true) return { kind: "unobservable", detail: prepared.mark.remedy.text };
  const mark = prepared.kind === "refused" ? prepared.mark : prepared.kind === "clashed" ? prepared.diagnostic
    : prepared.diagnostic ?? prepared.result.entry.refused;
  return { kind: "would-refuse", remedy: mark?.remedy ?? { text: `Let ${path} finish settling, then run arc save there and retry removal.` } };
}

/** A preparation that preserves open conflicts cannot finish retirement's conflict hold. */
export function unresolvedRemovalConflicts(path: string, open: readonly RecordReference[],
  resolves: readonly RecordReference[]): Exclude<ProjectionRemovalCheck, { kind: "passes" }> | null {
  return open.some(conflict => !resolves.some(reference => sameReference(conflict, reference)))
    ? { kind: "would-refuse", remedy: { text: `Resolve the conflicts in ${path} by hand, then run arc save there and retry removal.` } } : null;
}
