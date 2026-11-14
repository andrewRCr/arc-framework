/** Resolve a current work unit's stored delivery plan through authenticated rename history. */

import type { RawGitExec } from "../git/exec.js";
import { createRawGitExec } from "../io-context.js";
import { createStore } from "../store/create.js";
import { createDefaultStorePorts } from "../store/default-ports.js";
import type { StoreCapabilities } from "../store/read.js";
import {
  enumerateGitTransitionRecords, hasGitTransitionNamespace, TRANSITION_RECORD_NAMESPACE,
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
      readonly condition?: string;
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

/** Plural rename-aware selection for closeout namespaces that may retain orphan plans. */
export type ForwardDeliverySubjectsResolution<TRecord> =
  | { readonly status: "resolved"; readonly records: readonly TRecord[] }
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
  /**
   * @param exec - Byte-preserving Git executor in the checkout.
   * @param capability - The store's capability. Off the branch, a ref without the transition folder refuses rather
   *   than reading as a ref on which no work unit was ever renamed.
   */
  constructor(
    private readonly exec: RawGitExec,
    private readonly capability: Pick<StoreCapabilities, "stateOffBranch">,
  ) {}

  async enumerate(ref: string): Promise<DeliveryRenameTransitionResult> {
    try {
      if (this.capability.stateOffBranch && !await hasGitTransitionNamespace(this.exec, ref)) {
        return {
          status: "refused",
          reason: "substrate-unreachable",
          condition: `${TRANSITION_RECORD_NAMESPACE} is absent at ${ref}; with state off the branch, rename `
            + "transitions are not read from a branch's tree.",
        };
      }
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
 * Build a checkout's rename source from the capability of the default store composed for it, so a caller holding no
 * store reads transitions as that store keeps them.
 *
 * @param cwd - The checkout.
 * @returns The Git-backed source bound to the checkout.
 */
export function createCheckoutDeliveryRenameTransitionSource(cwd: string): GitDeliveryRenameTransitionSource {
  return new GitDeliveryRenameTransitionSource(createRawGitExec(cwd),
    createStore(createDefaultStorePorts({ checkoutRoot: cwd })).capabilities);
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

/** Resolve every independently valid record that reaches one current work-unit identity. */
export async function resolveForwardDeliverySubjects<TRecord>(input: {
  readonly records: readonly TRecord[];
  readonly currentWorkUnitId: string;
  readonly recordWorkUnitId: (record: TRecord) => string;
  readonly authority: DeliveryRenameEvidenceAuthority;
  readonly transitionSource: DeliveryRenameTransitionSource;
}): Promise<ForwardDeliverySubjectsResolution<TRecord>> {
  if (input.records.length === 0) return { status: "resolved", records: [] };
  if (input.authority.status === "unestablished") {
    return { status: "indeterminate", reason: "reachability-unestablished" };
  }
  const transitions = await input.transitionSource.enumerate(input.authority.ref);
  if (transitions.status === "refused") {
    return { status: "indeterminate", reason: transitions.reason };
  }
  const records: TRecord[] = [];
  for (const record of input.records) {
    const resolution = resolveForwardDeliverySubjectFromTransitions({
      records: [record],
      currentWorkUnitId: input.currentWorkUnitId,
      recordWorkUnitId: input.recordWorkUnitId,
      transitions: transitions.value,
    });
    if (resolution.status === "indeterminate") return resolution;
    if (resolution.status === "match") records.push(resolution.record);
  }
  return { status: "resolved", records };
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
