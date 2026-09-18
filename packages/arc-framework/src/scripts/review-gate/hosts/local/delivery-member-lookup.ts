/** Repository-common delivery-state adapter for the review lane's member lookup. */

import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../../../../lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../../../lib/delivery/plan.js";
import {
  GitDeliveryRenameTransitionSource,
  resolveExistingDeliveryPlan,
  type DeliveryRenameEvidenceAuthority,
  type DeliveryRenameTransitionSource,
} from "../../../../lib/delivery/plan-resolution.js";
import type { DeliveryPlanV1, DeliveryStateV1 } from "../../../../lib/delivery/schema.js";
import { validateDeliveryStateAgainstPlan } from "../../../../lib/delivery/state.js";
import type { GitExec } from "../../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import { createRawGitExec } from "../../../../lib/io-context.js";
import type {
  DeliveryDischargeTargetLookup,
  DeliveryDischargeTargetLookupResult,
  DeliveryMemberBinding,
  DeliveryMemberIdentity,
  DeliveryMemberIdentityLookup,
  DeliveryMemberIdentityLookupResult,
  DeliveryMemberLookup,
  DeliveryMemberLookupResult,
  DeliveryReservationRecordLookup,
  DeliveryReservationRecordLookupResult,
  DeliveryTerminalRecordLookup,
  DeliveryTerminalRecordLookupResult,
} from "../../core/delivery-member-lookup.js";

function branchName(ref: string | null): string | null {
  if (ref === null) return null;
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}

/** What one coherent delivery state establishes about the member an exact deliverable id names. */
type DeliveryMemberBindingProjection =
  | { readonly status: "bound"; readonly member: DeliveryMemberBinding }
  | { readonly status: "absent" }
  | { readonly status: "unbound" };

/**
 * Project the member one deliverable id names out of one already-coherent delivery state.
 *
 * Reports only what the state establishes — that the member is bound, that the state carries no such member,
 * or that it carries one with no recorded coordinates. The two lookups above distinguish those misses
 * differently, so neither disposition is decided here.
 *
 * @param input - The coherent state and the identity coordinates the binding carries through.
 * @returns The binding, or which of the two misses holds.
 */
function projectDeliveryMemberBinding(input: {
  readonly state: DeliveryStateV1;
  readonly planId: string;
  readonly deliverableId: string;
  readonly workUnitId: string;
}): DeliveryMemberBindingProjection {
  const members = input.state.members;
  const memberIndex = members.findIndex((candidate) => candidate.deliverableId === input.deliverableId);
  const member = memberIndex < 0 ? undefined : members[memberIndex];
  if (member === undefined) return { status: "absent" };
  if (member.coordinates === null) return { status: "unbound" };
  const terminal = members.at(-1);
  return {
    status: "bound",
    member: {
      planId: input.planId,
      deliverableId: input.deliverableId,
      workUnitId: input.workUnitId,
      base: member.coordinates.base,
      baseRef: branchName(predecessorMemberRef(input.state, memberIndex)),
      headRef: branchName(member.ref),
      head: member.coordinates.head,
      candidateHead: terminal?.coordinates?.head ?? null,
      isFinalMember: terminal?.deliverableId === input.deliverableId,
    },
  };
}

/** The ref one member sits on — the target's for the first member, its predecessor's for every other. */
function predecessorMemberRef(state: DeliveryStateV1, memberIndex: number): string | null {
  return memberIndex === 0
    ? state.target?.ref ?? null
    : state.members[memberIndex - 1]?.ref ?? null;
}

/** Delivery-member lookup backed by one repository's Git-common delivery state. */
export class RepositoryDeliveryMemberLookup implements DeliveryMemberLookup, DeliveryMemberIdentityLookup,
DeliveryDischargeTargetLookup, DeliveryReservationRecordLookup, DeliveryTerminalRecordLookup {
  private readonly plans: RepositoryDeliveryPlanStore<DeliveryPlanV1>;
  private readonly store: RepositoryDeliveryStateStore;
  private readonly transitionSource: DeliveryRenameTransitionSource;

  /**
   * @param input - Git executor and the resolved repository root to bind against.
   */
  constructor(input: {
    readonly exec: GitExec;
    readonly cwd: string;
    readonly transitionSource?: DeliveryRenameTransitionSource;
  }) {
    const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
    this.plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
    this.store = new RepositoryDeliveryStateStore(publisher);
    this.transitionSource = input.transitionSource
      ?? new GitDeliveryRenameTransitionSource(createRawGitExec(input.cwd));
  }

  /**
   * Resolve the delivery member bound to one exact head.
   *
   * @param headObjectId - The exact member head object id.
   * @returns The member binding, `unbound`, or `unavailable`.
   */
  async resolveMemberByHead(headObjectId: string): Promise<DeliveryMemberLookupResult> {
    // The store returns typed refusals but does not contain thrown failures: its
    // snapshot read propagates I/O errors, and resolving the state namespace
    // throws outside a repository. Containing both is what makes the port total.
    let resolution;
    try {
      resolution = await this.store.resolveMember({
        selector: { kind: "head", objectId: headObjectId },
      });
    } catch {
      return { status: "unavailable" };
    }
    if (resolution.status === "refused") return { status: "unavailable" };
    if (resolution.value === null) return { status: "unbound" };

    const { deliverableId, planId, state, workUnitId } = resolution.value;
    let plans;
    try {
      plans = await this.plans.enumerateCurrentReadOnly();
    } catch {
      return { status: "unavailable" };
    }
    if (plans.status === "refused") return { status: "unavailable" };
    const matching = plans.value.filter((plan) => plan.workUnitId === workUnitId);
    const plan = matching.length === 1 && matching[0]?.planId === planId
      ? matching[0]
      : undefined;
    if (plan === undefined) return { status: "unavailable" };
    const coherence = validateDeliveryStateAgainstPlan(state, plan);
    if (coherence.status === "refused") return { status: "unavailable" };
    // The store selects only on recorded coordinates, so a match always carries
    // them; both misses keep the port total rather than guarding a real case.
    const projected = projectDeliveryMemberBinding({
      state: coherence.state,
      planId,
      deliverableId,
      workUnitId,
    });
    return projected.status === "bound"
      ? { status: "resolved", member: projected.member }
      : { status: "unavailable" };
  }

  /**
   * Resolve the delivery member one caller-held identity names.
   *
   * @param identity - The asserted plan, deliverable, and work unit.
   * @returns The member binding, the miss that holds, or `unavailable`.
   */
  async resolveMemberByIdentity(identity: DeliveryMemberIdentity): Promise<DeliveryMemberIdentityLookupResult> {
    try {
      const plans = await this.plans.enumerateCurrentReadOnly();
      if (plans.status === "refused") return { status: "unavailable" };
      const matching = plans.value.filter((candidate) => candidate.workUnitId === identity.workUnitId);
      if (matching.length === 0) return { status: "no-plan" };
      const plan = matching.length === 1 ? matching[0] : undefined;
      if (plan === undefined) return { status: "unavailable" };
      // The plan id is compared without case while the deliverable and work unit
      // beside it are compared exactly, which is the admission callers already
      // have: narrowing it here would start refusing requests admitted today.
      if (plan.planId.toLowerCase() !== identity.planId.toLowerCase()) {
        return { status: "plan-mismatch" };
      }
      // Membership is asked of the plan rather than of state, so a work unit whose
      // plan carries no state record still answers by deliverable rather than by
      // the absence of any binding at all.
      if (!plan.members.some((member) => member.deliverableId === identity.deliverableId)) {
        return { status: "not-in-plan" };
      }
      const record = await this.store.read(plan.planId);
      if (record.status === "refused") return { status: "unavailable" };
      if (record.value === null) return { status: "in-plan-unbound" };
      const coherence = validateDeliveryStateAgainstPlan(record.value.value, plan);
      if (coherence.status === "refused") return { status: "unavailable" };
      // Coherence has already established that state carries the plan's members in
      // the plan's order, so the absent miss cannot hold; it keeps the port total.
      const projected = projectDeliveryMemberBinding({
        state: coherence.state,
        planId: plan.planId,
        deliverableId: identity.deliverableId,
        workUnitId: coherence.state.workUnitId,
      });
      if (projected.status === "absent") return { status: "unavailable" };
      return projected.status === "unbound"
        ? { status: "in-plan-unbound" }
        : { status: "bound", member: projected.member };
    } catch {
      return { status: "unavailable" };
    }
  }

  /** Read every currently bound member target for one work unit without writing delivery state. */
  async resolveDischargeTargets(workUnitId: string): Promise<DeliveryDischargeTargetLookupResult> {
    try {
      const plans = await this.plans.enumerateCurrentReadOnly();
      if (plans.status === "refused") return { status: "unavailable" };
      const matching = plans.value.filter((plan) => plan.workUnitId === workUnitId);
      if (matching.length === 0) return { status: "unbound" };
      const plan = matching.length === 1 ? matching[0] : undefined;
      if (plan === undefined) return { status: "unavailable" };
      const record = await this.store.read(plan.planId);
      if (record.status === "refused") return { status: "unavailable" };
      if (record.value === null) return { status: "unbound" };
      const coherence = validateDeliveryStateAgainstPlan(record.value.value, plan);
      if (coherence.status === "refused") return { status: "unavailable" };
      const targets = [];
      for (const [index, member] of coherence.state.members.entries()) {
        if (member.changeRequest === null || member.coordinates === null) {
          return { status: "unavailable" };
        }
        const planMember = plan.members[index];
        if (planMember === undefined || planMember.deliverableId !== member.deliverableId) {
          return { status: "unavailable" };
        }
        targets.push({
          planId: coherence.state.planId,
          deliverableId: member.deliverableId,
          workUnitId: coherence.state.workUnitId,
          position: index + 1,
          memberCount: coherence.state.members.length,
          chunkKey: planMember.chunkKey,
          title: planMember.title,
          ref: member.ref,
          providerId: member.changeRequest.providerId,
          changeRequestId: member.changeRequest.changeRequestId,
          base: member.coordinates.base,
          head: member.coordinates.head,
        });
      }
      return {
        status: "resolved",
        targets,
      };
    } catch {
      return { status: "unavailable" };
    }
  }

  /** Read authoritative plan intent without requiring delivery state to exist yet. */
  async resolveReservationRecords(
    workUnitId: string,
    authority: DeliveryRenameEvidenceAuthority,
  ): Promise<DeliveryReservationRecordLookupResult> {
    try {
      const resolution = await resolveExistingDeliveryPlan({
        planStore: { enumerateCurrent: () => this.plans.enumerateCurrentReadOnly() },
        currentWorkUnitId: workUnitId,
        planWorkUnitId: (plan) => plan.workUnitId,
        authority,
        transitionSource: this.transitionSource,
      });
      if (resolution.status === "indeterminate") return { status: "unavailable" };
      if (resolution.status === "no-match") return { status: "absent" };
      const plan = resolution.plan;
      if (plan.workUnitId !== workUnitId) return { status: "unavailable" };
      const record = await this.store.read(plan.planId);
      if (record.status === "refused") return { status: "unavailable" };
      if (record.value === null) return { status: "planned", plan };
      const coherence = validateDeliveryStateAgainstPlan(record.value.value, plan);
      return coherence.status === "valid"
        ? { status: "bound", plan, state: coherence.state }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  }

  /** Read the one coherent delivery plan and state for a work unit. */
  async resolveTerminalRecords(workUnitId: string): Promise<DeliveryTerminalRecordLookupResult> {
    try {
      const plans = await this.plans.enumerateCurrentReadOnly();
      if (plans.status === "refused") return { status: "unavailable" };
      const matching = plans.value.filter((plan) => plan.workUnitId === workUnitId);
      if (matching.length === 0) return { status: "unbound" };
      const plan = matching.length === 1 ? matching[0] : undefined;
      if (plan === undefined) return { status: "unavailable" };
      const record = await this.store.read(plan.planId);
      if (record.status === "refused") return { status: "unavailable" };
      if (record.value === null) return { status: "unbound" };
      const coherence = validateDeliveryStateAgainstPlan(record.value.value, plan);
      return coherence.status === "valid"
        ? {
            status: "resolved",
            plan,
            state: coherence.state,
            stateRevision: record.value.revision,
          }
        : { status: "unavailable" };
    } catch {
      return { status: "unavailable" };
    }
  }
}
