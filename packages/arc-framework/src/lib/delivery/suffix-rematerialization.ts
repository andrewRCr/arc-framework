/** Preparation of a complete review-fix suffix from the delivery top. */

import { canonicalize, type CanonicalDigest } from "../kernel/index.js";
import { classifyDeliveryPlanAmendment, type DeliveryPlanAmendmentResult } from "./amendment.js";
import type { DeliveryChainAdoptionResult } from "./chain-adoption.js";
import type {
  DeliveryContributionCoordinate,
  DeliveryContributionEndpoints,
  DeliveryContributionProofResult,
  DeliveryContributionRefusal,
} from "./contribution-proof.js";
import type {
  DeliveryEligibilityCoordinates,
  DeliveryEligibilityRefusal,
  DeliveryEligibilitySnapshot,
} from "./eligibility.js";
import { deriveDeliveryPosition, type DeliveryPositionFactsV1 } from "./position.js";
import type {
  DeliveryOperationSnapshotV1,
  DeliveryPlanV1,
} from "./schema.js";
import { DeliveryStateV1Schema, type DeliveryStateV1 } from "./schema.js";
import type { DeliveryRevisionedRecord } from "./ports.js";

/** One bound non-terminal ref that must be rewritten from the validated suffix. */
export interface DeliverySuffixRewritePlan {
  readonly deliverableId: string;
  readonly selectedChange: boolean;
  readonly requested: DeliveryOperationSnapshotV1;
}

/** Arbiter-backed contribution disposition used to scope review-fix verification. */
export interface DeliverySuffixContributionVerdict {
  readonly deliverableId: string;
  readonly contribution: "changed" | "equivalent";
  readonly proof: "selected-change" | "tree-equality" | "mechanical-reapply";
}

/** Successful suffix recut and its typed after-fix verification route. */
export interface DeliverySuffixRematerializedResult {
  readonly status: "rematerialized";
  readonly state: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly contributionVerdicts: readonly DeliverySuffixContributionVerdict[];
  readonly nextAction: "verify-review-fix";
  readonly verification: {
    readonly memberDeliverableIds: readonly string[];
    readonly tier1Required: true;
  };
}

/** Closed preparation result; no state or remote mutation occurs here. */
export type PrepareDeliverySuffixRematerializationResult =
  | {
      readonly status: "prepared";
      readonly rewrites: readonly DeliverySuffixRewritePlan[];
      readonly contributionVerdicts: readonly DeliverySuffixContributionVerdict[];
    }
  | { readonly status: "plan-amendment"; readonly disposition: DeliveryPlanAmendmentResult }
  | DeliveryContributionRefusal
  | {
      readonly status: "refused";
      readonly reason:
        | "position-mismatch"
        | "snapshot-mismatch"
        | "suffix-incomplete"
        | "selected-member-invalid"
        | "direct-delivery-ref";
    };

/** Fresh per-step acquisition and the existing reserved rewrite executor. */
export interface DeliverySuffixRematerializationDependencies {
  reobserve(): Promise<
    | {
        readonly status: "observed";
        readonly plan: DeliveryPlanV1;
        readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
        readonly facts: DeliveryPositionFactsV1;
        readonly snapshot: DeliveryEligibilitySnapshot;
      }
    | DeliveryEligibilityRefusal
    | { readonly status: "refused" }
  >;
  reobserveCandidate(rewrite: DeliverySuffixRewritePlan): Promise<boolean>;
  resolveCoordinate(head: string): Promise<DeliveryContributionCoordinate | null>;
  proveCarried(endpoints: DeliveryContributionEndpoints): Promise<DeliveryContributionProofResult>;
  apply(input: {
    readonly plan: DeliveryPlanV1;
    readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
    readonly rewrite: DeliverySuffixRewritePlan;
  }): Promise<
    | { readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
    | { readonly status: "refused" }
  >;
}

/**
 * Validate one already-closed, complete suffix before workflow gates authorize any rewrite reservation.
 * Selected members may change contribution; every unselected member must carry its exact authored contribution.
 */
export async function prepareDeliverySuffixRematerialization(input: {
  readonly plan: DeliveryPlanV1;
  readonly proposedPlan?: DeliveryPlanV1;
  readonly state: DeliveryStateV1;
  readonly facts: DeliveryPositionFactsV1;
  readonly eligibleSnapshot: DeliveryEligibilitySnapshot;
  readonly selectedDeliverableIds: readonly string[];
  resolveCoordinate(head: string): Promise<DeliveryContributionCoordinate | null>;
  proveCarried(endpoints: DeliveryContributionEndpoints): Promise<DeliveryContributionProofResult>;
}): Promise<PrepareDeliverySuffixRematerializationResult> {
  const position = deriveDeliveryPosition(input.plan, input.state, input.facts);
  if (position.status !== "derived") return { status: "refused", reason: "position-mismatch" };
  const landedCount = position.position.landedPrefix.length;
  if (input.proposedPlan !== undefined) {
    return {
      status: "plan-amendment",
      disposition: classifyDeliveryPlanAmendment({
        current: input.plan,
        proposed: input.proposedPlan,
        boundDeliverableIds: input.state.members
          .filter((member) => member.ref !== null || member.changeRequest !== null || member.coordinates !== null)
          .map((member) => member.deliverableId as CanonicalDigest),
        landedDeliverableIds: position.position.landedPrefix,
      }),
    };
  }
  const snapshot = input.eligibleSnapshot;
  if (snapshot.planId !== input.plan.planId || snapshot.workUnitId !== input.plan.workUnitId
    || snapshot.planRevision !== input.plan.planRevision || snapshot.planDigest !== input.plan.planDigest
    || input.state.target?.coordinates === null || input.state.target === null
    || canonicalize(snapshot.protectedBase) !== canonicalize({
      ref: input.state.target.ref,
      ...input.state.target.coordinates,
    })) return { status: "refused", reason: "snapshot-mismatch" };

  const suffix = input.plan.members.slice(landedCount);
  if (suffix.length === 0 || snapshot.members.length !== suffix.length
    || snapshot.members.some((member, index) => member.deliverableId !== suffix[index]?.deliverableId)) {
    return { status: "refused", reason: "suffix-incomplete" };
  }
  if (snapshot.members.some((member) => member.ref.startsWith("refs/heads/delivery/"))) {
    return { status: "refused", reason: "direct-delivery-ref" };
  }
  const selected = new Set(input.selectedDeliverableIds);
  const suffixIds = new Set(suffix.slice(0, -1).map((member) => member.deliverableId));
  if (selected.size === 0 || selected.size !== input.selectedDeliverableIds.length
    || input.selectedDeliverableIds.some((id) => !suffixIds.has(id))) {
    return { status: "refused", reason: "selected-member-invalid" };
  }

  const acceptedProofs = new Map<string, "tree-equality" | "mechanical-reapply">();
  for (const [suffixIndex, candidate] of snapshot.members.entries()) {
    if (selected.has(candidate.deliverableId)) continue;
    const stateIndex = landedCount + suffixIndex;
    const stored = input.state.members[stateIndex];
    const beforePredecessor = stored?.coordinates === null || stored?.coordinates === undefined
      ? null
      : await input.resolveCoordinate(stored.coordinates.base);
    const afterPredecessor = suffixIndex === 0 ? snapshot.protectedBase : snapshot.members[suffixIndex - 1];
    if (stored?.coordinates === null || stored?.coordinates === undefined
      || beforePredecessor === null || afterPredecessor === undefined
      || beforePredecessor.head !== stored.coordinates.base) {
      return { status: "refused", reason: "snapshot-mismatch" };
    }
    const proof = await input.proveCarried({
      before: { predecessor: beforePredecessor, member: stored.coordinates },
      after: { predecessor: afterPredecessor, member: candidate },
    });
    if (proof.status !== "accepted") return proof;
    acceptedProofs.set(candidate.deliverableId, proof.proof);
  }

  const rewrites: DeliverySuffixRewritePlan[] = [];
  for (const [suffixIndex, candidate] of snapshot.members.slice(0, -1).entries()) {
    const stored = input.state.members[landedCount + suffixIndex];
    const predecessor = suffixIndex === 0 ? snapshot.protectedBase : snapshot.members[suffixIndex - 1];
    if (stored?.ref === null || stored?.ref === undefined || stored.coordinates === null || predecessor === undefined) {
      return { status: "refused", reason: "snapshot-mismatch" };
    }
    rewrites.push({
      deliverableId: stored.deliverableId,
      selectedChange: selected.has(stored.deliverableId),
      requested: {
        target: input.state.target,
        members: [{
          deliverableId: stored.deliverableId,
          ref: stored.ref,
          changeRequest: stored.changeRequest,
          coordinates: { base: predecessor.head, head: candidate.head, tree: candidate.tree },
        }],
      },
    });
  }
  return {
    status: "prepared",
    rewrites,
    contributionVerdicts: snapshot.members.map((member) => {
      if (selected.has(member.deliverableId)) return {
        deliverableId: member.deliverableId,
        contribution: "changed" as const,
        proof: "selected-change" as const,
      };
      const proof = acceptedProofs.get(member.deliverableId);
      if (proof === undefined) throw new Error("validated suffix lost its contribution proof");
      return {
        deliverableId: member.deliverableId,
        contribution: "equivalent" as const,
        proof,
      };
    }),
  };
}

/** Reclose, reprove, and apply every non-terminal suffix rewrite in persisted order. */
export async function executeFreshDeliverySuffixRematerialization(input: {
  readonly selectedDeliverableIds: readonly string[];
}, dependencies: DeliverySuffixRematerializationDependencies): Promise<
  | DeliverySuffixRematerializedResult
  | DeliveryContributionRefusal
  | DeliveryEligibilityRefusal
  | {
      readonly status: "refused";
      readonly reason:
        | "observation-unavailable"
        | "state-moved"
        | "plan-amendment"
        | "suffix-moved"
        | "candidate-moved"
        | "rewrite-refused"
        | "position-mismatch"
        | "snapshot-mismatch"
        | "suffix-incomplete"
        | "selected-member-invalid"
        | "direct-delivery-ref";
    }
> {
  let expectedState: DeliveryRevisionedRecord<DeliveryStateV1> | null = null;
  let rewriteOrder: readonly string[] | null = null;
  let contributionVerdicts: readonly DeliverySuffixContributionVerdict[];
  let nextIndex = 0;
  for (;;) {
    const fresh = await dependencies.reobserve();
    if (fresh.status !== "observed") {
      return "reason" in fresh
        ? fresh
        : { status: "refused", reason: "observation-unavailable" };
    }
    if (expectedState !== null && (fresh.current.revision !== expectedState.revision
      || canonicalize(fresh.current.value) !== canonicalize(expectedState.value))) {
      return { status: "refused", reason: "state-moved" };
    }
    const prepared = await prepareDeliverySuffixRematerialization({
      plan: fresh.plan,
      state: fresh.current.value,
      facts: fresh.facts,
      eligibleSnapshot: fresh.snapshot,
      selectedDeliverableIds: input.selectedDeliverableIds,
      resolveCoordinate: (head) => dependencies.resolveCoordinate(head),
      proveCarried: (endpoints) => dependencies.proveCarried(endpoints),
    });
    if (prepared.status !== "prepared") {
      return prepared.status === "refused" ? prepared : { status: "refused", reason: "plan-amendment" };
    }
    contributionVerdicts = prepared.contributionVerdicts;
    const currentOrder = prepared.rewrites.map((rewrite) => rewrite.deliverableId);
    if (rewriteOrder === null) rewriteOrder = currentOrder;
    else if (canonicalize(currentOrder) !== canonicalize(rewriteOrder)) {
      return { status: "refused", reason: "suffix-moved" };
    }
    const deliverableId = rewriteOrder[nextIndex];
    if (deliverableId === undefined) {
      return {
        status: "rematerialized",
        state: expectedState ?? fresh.current,
        contributionVerdicts,
        nextAction: "verify-review-fix",
        verification: {
          memberDeliverableIds: contributionVerdicts
            .filter((verdict) => verdict.contribution === "changed")
            .map((verdict) => verdict.deliverableId),
          tier1Required: true,
        },
      };
    }
    const rewrite = prepared.rewrites.find((candidate) => candidate.deliverableId === deliverableId);
    if (rewrite === undefined || !(await dependencies.reobserveCandidate(rewrite))) {
      return { status: "refused", reason: "candidate-moved" };
    }
    const applied = await dependencies.apply({ plan: fresh.plan, current: fresh.current, rewrite });
    if (applied.status !== "applied") return { status: "refused", reason: "rewrite-refused" };
    expectedState = applied.state;
    nextIndex += 1;
  }
}

/** Complete the post-fix tail after suffix rewrites have converged. */
export async function completeDeliverySuffixMutationTail(input: {
  readonly rematerialized: DeliverySuffixRematerializedResult;
  readonly commonBase: DeliveryContributionCoordinate;
  readonly topRef: string;
  readonly top: DeliveryEligibilityCoordinates & { readonly ref: string };
  readonly finalCandidate: DeliveryContributionCoordinate | undefined;
  readonly lifecyclePaths: readonly string[];
}, dependencies: {
  readAncestry(ancestor: string, descendant: string): Promise<"ancestor" | "not-ancestor" | "unresolvable">;
  adoptTop(input: {
    readonly topRef: string;
    readonly commonBase: DeliveryContributionCoordinate;
    readonly highestMember: DeliveryContributionCoordinate;
    readonly finalCandidate: DeliveryContributionCoordinate;
    readonly lifecyclePaths: readonly string[];
    readonly top: DeliveryContributionCoordinate;
  }): Promise<DeliveryChainAdoptionResult>;
  publishTop(input: {
    readonly ref: string;
    readonly beforeHead: string;
    readonly requestedHead: string;
  }): Promise<{ readonly status: "published" | "adopted" } | { readonly status: "refused" }>;
  publishState(
    planId: string,
    value: DeliveryStateV1,
    expectedRevision: number,
  ): Promise<
    | { readonly status: "ok"; readonly value: DeliveryRevisionedRecord<DeliveryStateV1> }
    | { readonly status: "refused" }
  >;
}): Promise<DeliverySuffixRematerializedResult | {
  readonly status: "refused";
  readonly reason:
    | "projection-invalid"
    | "adoption-refused"
    | "content-changed"
    | "top-publication-refused"
    | "state-moved";
}> {
  const current = input.rematerialized.state;
  const terminal = current.value.members.at(-1);
  const highestMember = current.value.members.at(-2);
  if (current.value.activeOperation !== null || terminal?.coordinates === null || terminal?.ref === null
    || terminal === undefined || highestMember?.coordinates === null || highestMember === undefined
    || terminal.ref !== input.topRef || input.top.ref !== input.topRef || input.finalCandidate === undefined) {
    return { status: "refused", reason: "projection-invalid" };
  }
  const terminalCoordinates = terminal.coordinates;
  const highestCoordinates = highestMember.coordinates;
  const topMoved = terminalCoordinates.head !== input.top.head;
  if ((!topMoved && terminalCoordinates.tree !== input.top.tree)
    || (topMoved && await dependencies.readAncestry(terminalCoordinates.head, input.top.head) !== "ancestor")) {
    return { status: "refused", reason: "adoption-refused" };
  }
  const alreadyRebound = terminalCoordinates.base === highestCoordinates.head;
  const adoption = alreadyRebound
    ? { status: "adopted" as const, head: input.top.head, tree: input.top.tree }
    : await dependencies.adoptTop({
        topRef: input.topRef,
        commonBase: input.commonBase,
        highestMember: highestCoordinates,
        finalCandidate: input.finalCandidate,
        lifecyclePaths: input.lifecyclePaths,
        top: input.top,
      });
  if (adoption.status !== "adopted") {
    return { status: "refused", reason: "adoption-refused" };
  }
  if (adoption.tree !== input.top.tree) return { status: "refused", reason: "content-changed" };
  const publication = await dependencies.publishTop({
    ref: input.topRef,
    beforeHead: input.top.head,
    requestedHead: adoption.head,
  });
  if (publication.status === "refused") return { status: "refused", reason: "top-publication-refused" };
  if (alreadyRebound && !topMoved) return input.rematerialized;

  const parsed = DeliveryStateV1Schema.safeParse({
    ...current.value,
    members: current.value.members.map((member) => member.deliverableId === terminal.deliverableId
      ? {
          ...member,
          coordinates: {
            base: highestCoordinates.head,
            head: adoption.head,
            tree: adoption.tree,
          },
        }
      : member),
  });
  if (!parsed.success) return { status: "refused", reason: "projection-invalid" };
  const persisted = await dependencies.publishState(current.value.planId, parsed.data, current.revision);
  if (persisted.status !== "ok" || persisted.value.revision !== current.revision + 1
    || canonicalize(persisted.value.value) !== canonicalize(parsed.data)) {
    return { status: "refused", reason: "state-moved" };
  }
  return { ...input.rematerialized, state: persisted.value };
}
