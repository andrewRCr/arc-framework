/** Dependency reconciliation rows over resolved store identities and terminal lineage. */
import { sameReference, type RecordReference } from "../../store/identity.js";
import { clashRepair } from "../../store/clash-repair.js";
import type { WorkItemRef } from "../../store/kinds/lineage/schema.js";
import type { TransitionReconcileDisposition, TransitionDispositionQueryResult } from "../transition-disposition-query.js";
import type { DependencyResolution, DependencyResolver } from "./store-dependency-resolution.js";
import type { CurrentWuReconcilePlan, DependencyReconcileComponent, DependencyReconcileConflict,
  DependencyReconcileEvidence, HeldDependencyEdge, PlanDependencyReconcileInput } from "./discharge-dep-edges.js";

type StoreInput = PlanDependencyReconcileInput & { resolveDependency: DependencyResolver };
interface ResolvedEdge {
  targets: string[];
  discharged: string[];
  drops: DependencyReconcileComponent["drops"][number][];
  evidence: DependencyReconcileEvidence[];
  rewritten: boolean;
  held?: HeldDependencyEdge;
}
type EdgeResult = ResolvedEdge | { conflict: DependencyReconcileConflict };
const empty = (): ResolvedEdge => ({ targets: [], discharged: [], drops: [], evidence: [], rewritten: false });

/** Plan each edge from memoized resolutions, preserving the whole edge when any target is held. */
export async function planStoreDependencyReconcile(input: StoreInput): Promise<CurrentWuReconcilePlan> {
  const before = canonical(input.edges), after: string[] = [], live: string[] = [], discharged: string[] = [];
  const replacements: DependencyReconcileComponent["replacements"][number][] = [];
  const drops: DependencyReconcileComponent["drops"][number][] = [], conflicts: DependencyReconcileConflict[] = [];
  const held: HeldDependencyEdge[] = [];
  for (const edge of before) {
    const result = edge === input.dependentSlug ? conflict(edge, edge, "self-dependency")
      : await resolveEdge(input, edge, edge, new Set());
    if ("conflict" in result) { conflicts.push(result.conflict); continue; }
    if (result.held !== undefined) { after.push(edge); held.push(result.held); continue; }
    after.push(...result.targets);
    live.push(...result.targets);
    discharged.push(...result.discharged);
    drops.push(...result.drops);
    if (result.rewritten && (result.targets.length > 0 || result.discharged.length > 0)) {
      replacements.push({ retiredSubject: edge, replacementTargets: canonical(result.targets), evidence: result.evidence });
    }
  }
  return { status: conflicts.length === 0 ? "ready" : "conflict", dependency: {
    before, after: conflicts.length === 0 ? canonical(after) : before, replacements, drops,
    discharged: conflicts.length === 0 ? canonical(discharged) : [],
    live: conflicts.length === 0 ? canonical(live) : before, conflicts, held,
  }, trackedReferences: { edits: [] }, advisories: [] };
}

async function resolveEdge(input: StoreInput, edge: string, target: string | WorkItemRef, visited: ReadonlySet<string>): Promise<EdgeResult> {
  const name = typeof target === "string" ? target : target.name;
  const key = typeof target !== "string" && target.uid !== undefined ? target.uid : name;
  if (visited.has(key)) return conflict(edge, name, "rename-cycle");
  const next = new Set(visited).add(key), resolution = await input.resolveDependency(target);
  if (resolution.kind === "dependent") return conflict(edge, name, "self-dependency");
  if (resolution.kind === "refused") return conflict(edge, name, "namespace-corrupt");
  if (resolution.kind === "work-unit") return resolveWorkUnit(input, edge, name, resolution);
  const disposition = await input.queryDisposition({ origin: name, dependentSlug: input.dependentSlug,
    ...(resolution.kind === "not-found" && resolution.reference !== undefined ? { reference: resolution.reference } : {}) });
  if (disposition.status === "absent" && (resolution.kind === "holder"
    || (resolution.kind === "tie" && !resolution.candidates.some(candidate => candidate.kind === "work-item/meta")))) {
    return { ...empty(), held: heldResolution(edge, name, "not-a-work-unit", resolution) };
  }
  if (disposition.status !== "unique") return dispositionConflict(edge, name, disposition.status);
  return resolveDisposition(input, edge, name, disposition.disposition, next);
}

async function resolveWorkUnit(input: StoreInput, edge: string, name: string,
  resolution: Extract<DependencyResolution, { kind: "work-unit" }>): Promise<EdgeResult> {
  if (resolution.state === "integrating" || resolution.state === "shipped") return { ...empty(), discharged: [name] };
  const current = resolution.reference.owner.name;
  if (current === name) return { ...empty(), targets: [current] };
  const follow = await input.resolveDependency(current);
  if (follow.kind === "refused") return conflict(edge, current, "namespace-corrupt");
  if (follow.kind === "work-unit" && sameReference(resolution.reference, follow.reference)) {
    return { ...empty(), targets: [current], rewritten: true, evidence: [{ subject: name }] };
  }
  return { ...empty(), held: heldResolution(edge, current, "unresolved-follow", follow) };
}

async function resolveDisposition(input: StoreInput, edge: string, name: string,
  disposition: TransitionReconcileDisposition, visited: ReadonlySet<string>): Promise<EdgeResult> {
  const evidence = [{ subject: name }];
  if (disposition.kind === "drop" || disposition.kind === "abandoned") return { ...empty(), evidence, rewritten: true,
    drops: [{ retiredSubject: name, reason: disposition.kind === "drop" ? disposition.reason : "retired work unit was abandoned", evidence }] };
  const targets = disposition.kind === "retarget" ? [disposition.targetSlug] : disposition.replacementTargets;
  const result: ResolvedEdge = { ...empty(), evidence, rewritten: true };
  for (const [index, target] of targets.entries()) {
    const tail = await resolveEdge(input, edge, disposition.references?.[index] ?? target, visited);
    if ("conflict" in tail || tail.held !== undefined) return tail;
    result.targets.push(...tail.targets);
    result.discharged.push(...tail.discharged);
    result.evidence.push(...tail.evidence);
    result.drops.push(...tail.drops.map(drop => ({ ...drop, evidence: [...evidence, ...drop.evidence] })));
  }
  return result;
}

function heldResolution(edge: string, name: string, cause: HeldDependencyEdge["cause"], resolution: DependencyResolution): HeldDependencyEdge {
  const candidates = resolution.kind === "tie" ? resolution.candidates : resolutionCandidates(resolution);
  return { edge, name, cause, candidates,
    ...(resolution.kind === "tie" && resolution.tie !== undefined ? { tie: resolution.tie } : {}),
    repair: resolution.kind === "tie" && resolution.tie !== undefined && candidates.some(candidate => candidate.kind === "work-item/meta")
      ? clashRepair(candidates, resolution.tie) : { text: "Edit the edge to name the intended holder's current name, or remove it." } };
}
function resolutionCandidates(resolution: DependencyResolution): RecordReference[] {
  return resolution.kind === "work-unit" || resolution.kind === "dependent" || resolution.kind === "holder" ? [resolution.reference] : [];
}
function conflict(edge: string, subject: string, reason: DependencyReconcileConflict["reason"]): { conflict: DependencyReconcileConflict } {
  return { conflict: { edge, subject, reason } };
}
function dispositionConflict(edge: string, name: string, status: Exclude<TransitionDispositionQueryResult["status"], "unique">): EdgeResult {
  const reasons = { absent: "missing-evidence", ambiguous: "ambiguous-evidence", "unmapped-dependent": "unmapped-dependent", "namespace-corrupt": "namespace-corrupt" } as const;
  return conflict(edge, name, reasons[status]);
}
function canonical(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}
