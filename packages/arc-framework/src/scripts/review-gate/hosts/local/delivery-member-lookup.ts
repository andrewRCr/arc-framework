/** Repository-common delivery-state adapter for the review lane's member lookup. */

import { RepositoryDeliveryStateStore } from "../../../../lib/delivery/local-stores.js";
import type { GitExec } from "../../../../lib/git/exec.js";
import { RepositoryGitCommonStatePublisher } from "../../../../lib/git-common-state.js";
import type {
  DeliveryMemberLookup,
  DeliveryMemberLookupResult,
} from "../../core/delivery-member-lookup.js";

/** Delivery-member lookup backed by one repository's Git-common delivery state. */
export class RepositoryDeliveryMemberLookup implements DeliveryMemberLookup {
  private readonly store: RepositoryDeliveryStateStore;

  /**
   * @param input - Git executor and the resolved repository root to bind against.
   */
  constructor(input: { readonly exec: GitExec; readonly cwd: string }) {
    this.store = new RepositoryDeliveryStateStore(
      new RepositoryGitCommonStatePublisher(input.exec, input.cwd),
    );
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
    // The store selects only on recorded coordinates, so a match always carries
    // them; the fallback keeps the port total rather than guarding a real case.
    const coordinates = state.members
      .find((candidate) => candidate.deliverableId === deliverableId)?.coordinates ?? null;
    if (coordinates === null) return { status: "unavailable" };
    return {
      status: "resolved",
      member: {
        planId,
        deliverableId,
        workUnitId,
        base: coordinates.base,
        head: coordinates.head,
        isFinalMember: state.members[state.members.length - 1]?.deliverableId === deliverableId,
      },
    };
  }
}
