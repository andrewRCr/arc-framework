/** Trace routing reasons back to the caller-supplied change-set facts that produce them. */

import { CoreRoutingReasonSchema, type CoreRoutingReason } from "./routing-schema.js";

/** A change-set fact a caller supplies; the rest of a routing input is the repository's own. */
export type ChangeSetRoutingFact = "contentKind" | "reviewRisk" | "changeDeterminacy" | "ownership" | "surfaceAuthority";

const CHANGE_SET_FACT_ORDER: readonly ChangeSetRoutingFact[] =
  ["contentKind", "reviewRisk", "changeDeterminacy", "ownership", "surfaceAuthority"];

/**
 * The caller's facts each core reason turns on. `unestablished` marks the reason a change set routes with when it is
 * absent or any of its facts is rejected; an empty list marks a reason only repository-owned inputs produce — method
 * activity and frontline selection — so no change-set fact can move it.
 */
const REASON_FACTS: Record<CoreRoutingReason, readonly ChangeSetRoutingFact[] | "unestablished"> = {
  "unknown-change-set": "unestablished",
  "auto-eligible-planning": ["contentKind", "ownership", "surfaceAuthority"],
  "reviewed-routine-documentation": ["contentKind", "ownership", "surfaceAuthority"],
  "routine-code": ["contentKind", "reviewRisk"],
  "atomic-determinate": ["changeDeterminacy"],
  "atomic-softened": ["changeDeterminacy"],
  "sensitive-change-set": ["reviewRisk"],
  "self-owned-artifact": ["ownership"],
  "ownerless-artifact": ["ownership"],
  "foreign-owned-artifact": ["ownership"],
  "mixed-ownership": ["ownership"],
  "unknown-ownership": ["ownership"],
  "design-authority": ["surfaceAuthority"],
  "constitutional-surface": ["surfaceAuthority"],
  "unverifiable-derived-surface": ["surfaceAuthority"],
  "self-review-inactive": [],
  "frontline-inactive": [],
  "frontline-policy-skip": [],
  "frontline-policy-offer": [],
  "frontline-policy-attempt": [],
  "invocation-force": [],
  "invocation-skip": [],
  "source-invocation": [],
  "source-developer": [],
  "source-project": [],
  "source-unbound": [],
};

/** What separates a prepared routing from the current one, in the terms a caller can act on. */
export interface RoutingReasonDifference {
  /** The caller's change-set facts behind the reasons only one routing carries, in canonical order. */
  readonly facts: readonly ChangeSetRoutingFact[];
  /** The side that routed as an absent change set or one with a rejected fact, if only one did. */
  readonly unestablished: "prepared" | "current" | null;
  /** Differing reasons no change-set fact produces: method activity, frontline selection, or project policy. */
  readonly repositoryReasons: readonly string[];
}

function traceReason(reason: string): readonly ChangeSetRoutingFact[] | "unestablished" {
  const core = CoreRoutingReasonSchema.safeParse(reason);
  return core.success ? REASON_FACTS[core.data] : [];
}

/**
 * Name the change-set facts behind the reasons a prepared routing and the current one disagree on.
 *
 * @param prepared - The reasons a review was prepared under.
 * @param current - The reasons this call routes with.
 * @returns The facts, the unestablished side, and the repository-owned reasons in their symmetric difference.
 */
export function routingReasonDifference(prepared: readonly string[], current: readonly string[]): RoutingReasonDifference {
  const onlyPrepared = prepared.filter(reason => !current.includes(reason));
  const onlyCurrent = current.filter(reason => !prepared.includes(reason));
  const facts = new Set<ChangeSetRoutingFact>();
  const repositoryReasons = new Set<string>();
  for (const reason of [...onlyPrepared, ...onlyCurrent]) {
    const traced = traceReason(reason);
    if (traced === "unestablished") continue;
    if (traced.length === 0) repositoryReasons.add(reason);
    for (const fact of traced) facts.add(fact);
  }
  const unestablished = onlyPrepared.some(reason => traceReason(reason) === "unestablished") ? "prepared"
    : onlyCurrent.some(reason => traceReason(reason) === "unestablished") ? "current" : null;
  return { facts: CHANGE_SET_FACT_ORDER.filter(fact => facts.has(fact)), unestablished,
    repositoryReasons: [...repositoryReasons].sort() };
}

/**
 * Project rejected routing-input paths into command diagnostics.
 *
 * @param paths - The input paths routing normalization rejected or found missing.
 * @returns One `routing-input-rejected` diagnostic per path.
 */
export function routingInputDiagnostics(paths: readonly string[]): Array<{ code: string; message: string }> {
  return paths.map(path => ({ code: "routing-input-rejected", message: `Rejected or missing routing input: ${path}` }));
}
