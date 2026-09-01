/** Repository-common delivery-state adapter for the review lane's member lookup. */

import {
  RepositoryDeliveryPlanStore,
  RepositoryDeliveryStateStore,
} from "../../../../lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../../../lib/delivery/plan.js";
import type { DeliveryPlanV1 } from "../../../../lib/delivery/schema.js";
import { validateDeliveryStateAgainstPlan } from "../../../../lib/delivery/state.js";
import type { GitExec } from "../../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import type {
  DeliveryDischargeTargetLookup,
  DeliveryDischargeTargetLookupResult,
  DeliveryMemberLookup,
  DeliveryMemberLookupResult,
} from "../../core/delivery-member-lookup.js";

function branchName(ref: string | null): string | null {
  if (ref === null) return null;
  return ref.startsWith("refs/heads/") ? ref.slice("refs/heads/".length) : ref;
}

/** Delivery-member lookup backed by one repository's Git-common delivery state. */
export class RepositoryDeliveryMemberLookup implements DeliveryMemberLookup, DeliveryDischargeTargetLookup {
  private readonly plans: RepositoryDeliveryPlanStore<DeliveryPlanV1>;
  private readonly store: RepositoryDeliveryStateStore;

  /**
   * @param input - Git executor and the resolved repository root to bind against.
   */
  constructor(input: { readonly exec: GitExec; readonly cwd: string }) {
    const publisher = new RepositoryGitCommonStatePublisher(input.exec, input.cwd);
    this.plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
    this.store = new RepositoryDeliveryStateStore(publisher);
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
    const current = coherence.state;
    // The store selects only on recorded coordinates, so a match always carries
    // them; the fallback keeps the port total rather than guarding a real case.
    const memberIndex = current.members.findIndex((candidate) => candidate.deliverableId === deliverableId);
    const coordinates = current.members[memberIndex]?.coordinates ?? null;
    if (memberIndex < 0 || coordinates === null) return { status: "unavailable" };
    const baseRef = branchName(memberIndex === 0
      ? current.target?.ref ?? null
      : current.members[memberIndex - 1]?.ref ?? null);
    return {
      status: "resolved",
      member: {
        planId,
        deliverableId,
        workUnitId,
        base: coordinates.base,
        baseRef,
        headRef: branchName(current.members[memberIndex]?.ref ?? null),
        head: coordinates.head,
        isFinalMember: current.members[current.members.length - 1]?.deliverableId === deliverableId,
      },
    };
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
      return {
        status: "resolved",
        targets: coherence.state.members.flatMap((member) => {
          if (member.changeRequest === null || member.coordinates === null) return [];
          return [{
            planId: coherence.state.planId,
            deliverableId: member.deliverableId,
            workUnitId: coherence.state.workUnitId,
            ref: member.ref,
            providerId: member.changeRequest.providerId,
            changeRequestId: member.changeRequest.changeRequestId,
            base: member.coordinates.base,
            head: member.coordinates.head,
          }];
        }),
      };
    } catch {
      return { status: "unavailable" };
    }
  }
}
