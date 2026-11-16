/** Distinguish a locally refused edit from unavailable evidence during retirement feasibility. */
import type { ProjectionRemovalSlots } from "../../git/worktree-removal.js";
import type { ProjectionFeasibility } from "./engine-read-only.js";
import { sameReference, type RecordReference } from "../identity.js";
import type { Remedy } from "../refusal.js";
import type { RefusedMark } from "./index-schema.js";

/** A check grants only provisional feasibility; persistence repeats it under the target's lease. */
export type ProjectionRemovalCheck = Awaited<ReturnType<ProjectionRemovalSlots["check"]>>;

/** The retirement a check or step answers for: a checkout's removal, or the release of its projection. */
export type ProjectionRetirement = "remove" | "release";

/** The retirement a remedy asks to retry, named as the operation that met the refusal. */
export function retirementName(disposition: ProjectionRetirement): "removal" | "release" {
  return disposition === "release" ? "release" : "removal";
}

/**
 * A producer's own continuation: adoption and the command's start write marks that end by retrying themselves, an
 * operation a retirement run from another checkout neither runs nor needs.
 */
const PRODUCER_CONTINUATION = /(?:,? then|;| and) (?:retry(?: adoption| the command)?|run the command again)(?=[.;])/gu;
const PRODUCER_RETRY_SENTENCE = /\s*Then (?:retry(?: adoption| the command)?|run the command again)\./gu;

function sentence(text: string): string {
  return /[.!?]$/u.test(text) ? text : `${text}.`;
}

function markRepair(remedy: Remedy): string {
  return sentence(remedy.text.replace(PRODUCER_RETRY_SENTENCE, "").replace(PRODUCER_CONTINUATION, "").trim());
}

/** A retirement a mark refuses at one path: the path and its checkout, the mark's condition and repair, and the retry. */
export function retirementRefusal(checkout: string, path: string, mark: RefusedMark, disposition: ProjectionRetirement): Remedy {
  const name = retirementName(disposition);
  return { text: `${path} in ${checkout} blocks ${name}: ${sentence(mark.reason)} ${markRepair(mark.remedy)} Then retry ${name}.`,
    ...(mark.remedy.argv === undefined ? {} : { argv: mark.remedy.argv }) };
}

/** The check's refusal for a mark at one path. */
export function markedRemovalRefusal(checkout: string, path: string, mark: RefusedMark,
  disposition: ProjectionRetirement): Extract<ProjectionRemovalCheck, { kind: "would-refuse" }> {
  return { kind: "would-refuse", remedy: retirementRefusal(checkout, path, mark, disposition) };
}

/** A mark resting on a failed read leaves the path unjudged; the observation keeps the mark's condition and repair. */
export function unobservedMarkDetail(checkout: string, path: string, mark: RefusedMark): string {
  return `${path} in ${checkout}: ${sentence(mark.reason)} ${markRepair(mark.remedy).replace(/\.$/u, "")}`;
}

/** The mark the ignore check's refusal sets on a path its rules leave unignored. */
export function ignoreRefusalMark(reason: string, remedy: string): RefusedMark {
  return { reason: `Projection ignore guard refused: ${reason}`, remedy: { text: remedy } };
}

/** Preserve failed observations separately from locally refused authored changes. */
export function projectionFeasibilityRefusal(prepared: ProjectionFeasibility, checkout: string, path: string,
  disposition: ProjectionRetirement): Exclude<ProjectionRemovalCheck, { kind: "passes" }> | null {
  if (prepared.kind === "ready") {
    const plan = prepared.submission.plan;
    // Write-back lands an edit that keeps a retained mark and then refuses it, so persistence would refuse it too.
    if (plan.prepared.retained !== null) return markedRemovalRefusal(checkout, path, plan.prepared.retained, disposition);
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
  return mark === null ? { kind: "would-refuse", remedy: { text: `Let ${path} finish settling, then run arc save from ${checkout} and retry ${retirementName(disposition)}.` } }
    : markedRemovalRefusal(checkout, path, mark, disposition);
}

/** A preparation that preserves open conflicts cannot finish retirement's conflict hold. */
export function unresolvedRemovalConflicts(checkout: string, path: string, open: readonly RecordReference[],
  resolves: readonly RecordReference[], disposition: ProjectionRetirement): Exclude<ProjectionRemovalCheck, { kind: "passes" }> | null {
  return open.some(conflict => !resolves.some(reference => sameReference(conflict, reference)))
    ? { kind: "would-refuse", remedy: { text: `Resolve the conflicts in ${path} by hand, then run arc save from ${checkout} and retry ${retirementName(disposition)}.` } } : null;
}
