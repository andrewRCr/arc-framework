/** Resolve a current work unit's stored delivery plan through authenticated rename history. */

import type { RawGitExec } from "../change-facts.js";
import {
  enumerateGitTransitionRecords,
} from "../work-unit/git-transition-record-enumeration.js";
import {
  enumerateTransitionReferenceTransitions,
  type ReachableReferenceTransition,
} from "../work-unit/reference-reconcile.js";
import type { DeliveryPlanStore } from "./ports.js";

/** Evidence authority for the history against which rename transitions are resolved. */
export type DeliveryRenameEvidenceAuthority =
  | { readonly status: "established"; readonly ref: string }
  | { readonly status: "unestablished" };

/** Validated rename transitions or a storage-boundary refusal. */
export type DeliveryRenameTransitionResult =
  | { readonly status: "ok"; readonly value: readonly ReachableReferenceTransition[] }
  | {
      readonly status: "refused";
      readonly reason: "ambiguous-subject" | "namespace-corrupt" | "substrate-unreachable";
    };

/** Storage-independent source of authenticated reachable rename transitions. */
export interface DeliveryRenameTransitionSource {
  enumerate(ref: string): Promise<DeliveryRenameTransitionResult>;
}

/** Existing-plan lookup result that distinguishes safe absence from unresolved authority. */
export type ExistingDeliveryPlanResolution<TPlan> =
  | { readonly status: "match"; readonly plan: TPlan }
  | { readonly status: "no-match" }
  | {
    readonly status: "indeterminate";
    readonly reason:
      | "ambiguous-subject"
      | "namespace-corrupt"
      | "reachability-unestablished"
      | "substrate-unreachable";
  };

/** Payload-neutral lookup result for any delivery record keyed by an original work-unit identity. */
export type ForwardDeliverySubjectResolution<TRecord> =
  | { readonly status: "match"; readonly record: TRecord }
  | { readonly status: "no-match" }
  | {
    readonly status: "indeterminate";
    readonly reason:
      | "ambiguous-subject"
      | "namespace-corrupt"
      | "reachability-unestablished"
      | "substrate-unreachable";
  };

/** Resolution after transition authority has already been established and loaded. */
export type ForwardDeliverySubjectTransitionResolution<TRecord> =
  | { readonly status: "match"; readonly record: TRecord }
  | { readonly status: "no-match" }
  | {
    readonly status: "indeterminate";
    readonly reason: "ambiguous-subject" | "namespace-corrupt";
  };

/** Git-backed source of authenticated transitions from one established ref. */
export class GitDeliveryRenameTransitionSource implements DeliveryRenameTransitionSource {
  constructor(private readonly exec: RawGitExec) {}

  async enumerate(ref: string): Promise<DeliveryRenameTransitionResult> {
    try {
      const transitions = enumerateTransitionReferenceTransitions(
        await enumerateGitTransitionRecords(this.exec, ref),
      );
      return transitions.status === "valid"
        ? { status: "ok", value: transitions.transitions }
        : {
            status: "refused",
            reason: transitions.reason === "ambiguous-history" ? "ambiguous-subject" : "namespace-corrupt",
          };
    } catch {
      return { status: "refused", reason: "substrate-unreachable" };
    }
  }
}

/**
 * Resolve a current work-unit identity against every stored plan's recorded identity.
 *
 * @param input - Validated plan enumeration, identity accessor, and established rename authority
 * @returns One existing plan, safe absence, or an authority-preserving indeterminate result
 */
export async function resolveExistingDeliveryPlan<TPlan>(input: {
  readonly planStore: Pick<DeliveryPlanStore<TPlan>, "enumerateCurrent">;
  readonly currentWorkUnitId: string;
  readonly planWorkUnitId: (plan: TPlan) => string;
  readonly authority: DeliveryRenameEvidenceAuthority;
  readonly transitionSource: DeliveryRenameTransitionSource;
}): Promise<ExistingDeliveryPlanResolution<TPlan>> {
  if (input.authority.status === "unestablished") {
    return { status: "indeterminate", reason: "reachability-unestablished" };
  }
  const plans = await input.planStore.enumerateCurrent();
  if (plans.status === "refused") {
    return { status: "indeterminate", reason: "namespace-corrupt" };
  }

  const resolution = await resolveForwardDeliverySubject({
    records: plans.value,
    currentWorkUnitId: input.currentWorkUnitId,
    recordWorkUnitId: input.planWorkUnitId,
    authority: input.authority,
    transitionSource: input.transitionSource,
  });
  return resolution.status === "match"
    ? { status: "match", plan: resolution.record }
    : resolution;
}

/**
 * Resolve one current work-unit identity against payload-neutral records.
 *
 * Storage adapters enumerate and validate their own records before calling this shared
 * rename-aware authority boundary.
 */
export async function resolveForwardDeliverySubject<TRecord>(input: {
  readonly records: readonly TRecord[];
  readonly currentWorkUnitId: string;
  readonly recordWorkUnitId: (record: TRecord) => string;
  readonly authority: DeliveryRenameEvidenceAuthority;
  readonly transitionSource: DeliveryRenameTransitionSource;
}): Promise<ForwardDeliverySubjectResolution<TRecord>> {
  if (input.authority.status === "unestablished") {
    return { status: "indeterminate", reason: "reachability-unestablished" };
  }
  if (input.records.length === 0) return { status: "no-match" };

  const transitions = await input.transitionSource.enumerate(input.authority.ref);
  if (transitions.status === "refused") {
    return { status: "indeterminate", reason: transitions.reason };
  }
  return resolveForwardDeliverySubjectFromTransitions({
    records: input.records,
    currentWorkUnitId: input.currentWorkUnitId,
    recordWorkUnitId: input.recordWorkUnitId,
    transitions: transitions.value,
  });
}

/**
 * Resolve records against an already-authenticated transition snapshot.
 *
 * @param input - Validated records, identity accessor, current subject, and reachable transitions
 * @returns One matching record, safe absence, or an authority-preserving indeterminate result
 */
export function resolveForwardDeliverySubjectFromTransitions<TRecord>(input: {
  readonly records: readonly TRecord[];
  readonly currentWorkUnitId: string;
  readonly recordWorkUnitId: (record: TRecord) => string;
  readonly transitions: readonly ReachableReferenceTransition[];
}): ForwardDeliverySubjectTransitionResolution<TRecord> {
  const outcomes = groupOutcomes(input.transitions);
  const matches: TRecord[] = [];
  for (const record of input.records) {
    const resolution = resolvesTo(
      input.recordWorkUnitId(record),
      input.currentWorkUnitId,
      outcomes,
    );
    if (resolution === "ambiguous") {
      return { status: "indeterminate", reason: "ambiguous-subject" };
    }
    if (resolution === "match") matches.push(record);
  }
  if (matches.length > 1) return { status: "indeterminate", reason: "namespace-corrupt" };
  return matches[0] === undefined
    ? { status: "no-match" }
    : { status: "match", record: matches[0] };
}

function groupOutcomes(
  transitions: readonly ReachableReferenceTransition[],
): ReadonlyMap<string, readonly ReachableReferenceTransition["outcome"][]> {
  const grouped = new Map<string, ReachableReferenceTransition["outcome"][]>();
  for (const transition of transitions) {
    const outcomes = grouped.get(transition.subject) ?? [];
    const signature = JSON.stringify(transition.outcome);
    if (!outcomes.some((outcome) => JSON.stringify(outcome) === signature)) {
      outcomes.push(transition.outcome);
    }
    grouped.set(transition.subject, outcomes);
  }
  return grouped;
}

function resolvesTo(
  initialSubject: string,
  currentWorkUnitId: string,
  outcomes: ReadonlyMap<string, readonly ReachableReferenceTransition["outcome"][]>,
): "match" | "no-match" | "ambiguous" {
  let subject = initialSubject;
  const visited = new Set<string>();
  for (;;) {
    if (visited.has(subject)) return "no-match";
    visited.add(subject);
    const candidates = outcomes.get(subject);
    if (candidates === undefined) {
      return subject === currentWorkUnitId ? "match" : "no-match";
    }
    if (candidates.length !== 1) return "ambiguous";
    const outcome = candidates[0];
    if (outcome === undefined || outcome.kind !== "rename") return "no-match";
    subject = outcome.targetSlug;
  }
}
