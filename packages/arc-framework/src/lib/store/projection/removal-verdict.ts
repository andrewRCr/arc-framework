/** Distinguish a locally refused edit from unavailable evidence during retirement feasibility. */
import type { ProjectionRemovalSlots } from "../../git/worktree-removal.js";
import type { ProjectionFeasibility } from "./engine-read-only.js";
import { sameReference, type RecordReference } from "../identity.js";

/** A check grants only provisional feasibility; persistence repeats it under the target's lease. */
export type ProjectionRemovalCheck = Awaited<ReturnType<ProjectionRemovalSlots["check"]>>;

/** The retirement a check or step answers for: a checkout's removal, or the release of its projection. */
export type ProjectionRetirement = "remove" | "release";

/** The retirement a remedy asks to retry, named as the operation that met the refusal. */
export function retirementName(disposition: ProjectionRetirement): "removal" | "release" {
  return disposition === "release" ? "release" : "removal";
}

/** Preserve failed observations separately from locally refused authored changes. */
export function projectionFeasibilityRefusal(prepared: ProjectionFeasibility, checkout: string, path: string,
  disposition: ProjectionRetirement): Exclude<ProjectionRemovalCheck, { kind: "passes" }> | null {
  if (prepared.kind === "ready") {
    const plan = prepared.submission.plan;
    // Write-back lands an edit that keeps a retained mark and then refuses it, so persistence would refuse it too.
    if (plan.prepared.retained !== null) return { kind: "would-refuse", remedy: plan.prepared.retained.remedy };
    const current = plan.observations.find(observation => sameReference(observation.reference, plan.mutation.reference));
    return unresolvedRemovalConflicts(checkout, path, current?.expected?.conflicts ?? [], plan.mutation.resolves ?? [], disposition);
  }
  // A failed read leaves the edit unjudged. A refusal preparation reached on what it read is the edit's own; a Store
  // read that failed beneath it is still retained by the check's read observation.
  if (prepared.kind === "held" && prepared.readRefusal !== undefined) return { kind: "unobservable", detail: prepared.readRefusal.remedy.text };
  if (prepared.kind === "held" && prepared.result.answer === "no-edit") return null;
  if (prepared.kind === "refused" && prepared.nativeRefusal === true) return { kind: "unobservable", detail: prepared.mark.remedy.text };
  const mark = prepared.kind === "refused" ? prepared.mark : prepared.kind === "clashed" ? prepared.diagnostic
    : prepared.diagnostic ?? prepared.result.entry.refused;
  return { kind: "would-refuse", remedy: mark?.remedy ?? { text: `Let ${path} finish settling, then run arc save from ${checkout} and retry ${retirementName(disposition)}.` } };
}

/** A preparation that preserves open conflicts cannot finish retirement's conflict hold. */
export function unresolvedRemovalConflicts(checkout: string, path: string, open: readonly RecordReference[],
  resolves: readonly RecordReference[], disposition: ProjectionRetirement): Exclude<ProjectionRemovalCheck, { kind: "passes" }> | null {
  return open.some(conflict => !resolves.some(reference => sameReference(conflict, reference)))
    ? { kind: "would-refuse", remedy: { text: `Resolve the conflicts in ${path} by hand, then run arc save from ${checkout} and retry ${retirementName(disposition)}.` } } : null;
}
