/** Bounded Git and host observations for session-init delivery orientation. */

import { canonicalize } from "../kernel/index.js";
import type { GitExec } from "../git/exec.js";
import { observeDeliveryEligibilityRef } from "../delivery/git-eligibility.js";
import type { DeliveryHostPort } from "../delivery/host.js";
import { reconcileDeliveryOperation } from "../delivery/operation.js";
import type { DeliveryPositionFactsV1 } from "../delivery/position.js";
import type {
  DeliveryOperationSnapshotV1,
  DeliveryPlanV1,
  DeliveryStateV1,
} from "../delivery/schema.js";
import type { DeliveryPositionObservation } from "./delivery-position.js";

interface DeliveryPositionFactsDependencies {
  readonly exec: GitExec;
  readonly cwd: string;
  readonly host: DeliveryHostPort;
  readonly repository: string;
  readonly remoteHeads: Readonly<Record<string, string>>;
  readonly localCommits: Readonly<Record<string, boolean>>;
}

type RequestState = "open" | "merged" | "closed" | null;

async function observeTarget(
  target: DeliveryOperationSnapshotV1["target"],
  dependencies: DeliveryPositionFactsDependencies,
): Promise<boolean> {
  if (target === null) return true;
  if (target.coordinates === null) return false;
  const observed = await dependencies.host.observeTarget(dependencies.repository, target.ref);
  return observed.status === "observed"
    && canonicalize(observed.coordinates) === canonicalize(target.coordinates);
}

async function observeMember(
  member: DeliveryOperationSnapshotV1["members"][number],
  dependencies: DeliveryPositionFactsDependencies,
): Promise<{ readonly exact: boolean; readonly requestState: RequestState }> {
  if ((member.ref === null) !== (member.coordinates === null)) {
    return { exact: false, requestState: null };
  }
  if (member.ref !== null && member.coordinates !== null) {
    const prefix = "refs/heads/";
    if (!member.ref.startsWith(prefix)) return { exact: false, requestState: null };
    const branch = member.ref.slice(prefix.length);
    const remoteHead = dependencies.remoteHeads[branch];
    if (remoteHead === undefined
      || remoteHead !== member.coordinates.head
      || dependencies.localCommits[remoteHead] !== true) {
      return { exact: false, requestState: null };
    }
    const localOnlyExec: GitExec = (command, args, options) => dependencies.exec(command, args, {
      ...options,
      cwd: dependencies.cwd,
      objectAccess: "local-only",
    });
    const coordinates = await observeDeliveryEligibilityRef(localOnlyExec, remoteHead);
    if (coordinates === null || coordinates.tree !== member.coordinates.tree) {
      return { exact: false, requestState: null };
    }
  }
  if (member.changeRequest === null) return { exact: true, requestState: null };
  const observed = await dependencies.host.readRequest(dependencies.repository, member.changeRequest);
  if (observed.status !== "observed"
    || canonicalize(observed.request.binding) !== canonicalize(member.changeRequest)
    || (member.ref !== null && observed.request.headRef !== member.ref.replace(/^refs\/heads\//u, ""))
    || (member.coordinates !== null && observed.request.headSha !== member.coordinates.head)) {
    return { exact: false, requestState: null };
  }
  return { exact: true, requestState: observed.request.state };
}

async function snapshotIsCurrent(
  snapshot: DeliveryOperationSnapshotV1,
  dependencies: DeliveryPositionFactsDependencies,
): Promise<boolean> {
  if (!(await observeTarget(snapshot.target, dependencies))) return false;
  const observed = await Promise.all(snapshot.members.map((member) => observeMember(member, dependencies)));
  return observed.every((member) => member.exact);
}

async function observeOperation(
  state: DeliveryStateV1,
  revision: number,
  dependencies: DeliveryPositionFactsDependencies,
): Promise<{ readonly observation: unknown; readonly projected: DeliveryStateV1 } | null> {
  const operation = state.activeOperation;
  if (operation === null) return { observation: null, projected: state };
  let observation: unknown;
  if (operation.kind === "publish") {
    const request = await dependencies.host.observeRequest(operation.effect);
    if (request.status === "absent") {
      observation = { outcome: "not-applied" };
    } else if (request.status === "observed") {
      observation = {
        outcome: "applied",
        observation: {
          kind: "publish",
          effect: operation.effect,
          outcome: "applied",
          snapshot: {
            target: operation.requested.target,
            members: operation.requested.members.map((member) => ({
              ...member,
              changeRequest: request.request.binding,
            })),
          },
        },
      };
    } else return null;
  } else if (operation.kind === "land") {
    const request = await dependencies.host.readRequest(dependencies.repository, {
      providerId: operation.effect.providerId,
      changeRequestId: operation.effect.changeRequestId,
    });
    if (request.status !== "observed") return null;
    if (request.request.state === "open") {
      observation = { outcome: "not-applied" };
    } else if (request.request.state === "merged") {
      const target = await dependencies.host.observeTarget(dependencies.repository, operation.effect.targetRef);
      if (target.status !== "observed") return null;
      observation = {
        outcome: "applied",
        observation: {
          kind: "land",
          effect: operation.effect,
          outcome: "applied",
          snapshot: {
            target: { ref: operation.effect.targetRef, coordinates: target.coordinates },
            members: operation.before.members.map((member) => ({
              ...member,
              coordinates: member.coordinates === null ? null : {
                base: member.coordinates.base,
                head: target.coordinates.head,
                tree: target.coordinates.tree,
              },
            })),
          },
        },
      };
    } else return null;
  } else if (await snapshotIsCurrent(operation.requested, dependencies)) {
    observation = operation.requested;
  } else if (await snapshotIsCurrent(operation.before, dependencies)) {
    observation = operation.before;
  } else return null;

  const reconciled = reconcileDeliveryOperation({ revision, value: state }, observation);
  if (reconciled.status === "adopt") return { observation, projected: reconciled.state };
  if (reconciled.status === "retry") {
    return { observation, projected: { ...state, activeOperation: null } };
  }
  return null;
}

async function observeFacts(
  plan: DeliveryPlanV1,
  state: DeliveryStateV1,
  dependencies: DeliveryPositionFactsDependencies,
): Promise<DeliveryPositionFactsV1 | null> {
  if (!(await observeTarget(state.target, dependencies))) return null;
  const members = await Promise.all(state.members.map((member) => observeMember(member, dependencies)));
  if (members.some((member) => !member.exact)) return null;

  const landedDeliverableIds: string[] = [];
  let unlandedSeen = false;
  for (const [index, member] of state.members.entries()) {
    const requestState = members[index]?.requestState ?? null;
    const cleared = member.ref === null && member.changeRequest === null && member.coordinates === null
      && state.members.slice(index + 1).some((candidate) => (
        candidate.ref !== null || candidate.changeRequest !== null || candidate.coordinates !== null
      ));
    const landed = requestState === "merged" || cleared;
    if (landed && unlandedSeen) return null;
    if (landed) landedDeliverableIds.push(member.deliverableId);
    else unlandedSeen = true;
  }
  if (canonicalize(state.members.map((member) => member.deliverableId))
    !== canonicalize(plan.members.map((member) => member.deliverableId))) return null;
  return {
    target: state.target,
    members: state.members,
    landedDeliverableIds,
  };
}

/**
 * Acquire fresh, read-only delivery facts for one exact state revision.
 *
 * @param plan - Current canonical plan selected by exact work-unit identity.
 * @param state - Current coherent bound state.
 * @param revision - Store-owned revision paired with the state payload.
 * @param dependencies - Passive Git and host observation ports.
 * @returns Recognized facts for orientation, or a closed observation refusal.
 */
export async function observeRepositoryDeliveryPosition(
  plan: DeliveryPlanV1,
  state: DeliveryStateV1,
  revision: number,
  dependencies: DeliveryPositionFactsDependencies,
): Promise<DeliveryPositionObservation> {
  const operation = await observeOperation(state, revision, dependencies);
  if (operation === null) return { status: "refused" };
  const facts = await observeFacts(plan, operation.projected, dependencies);
  return facts === null
    ? { status: "refused" }
    : { status: "observed", facts, operationObservation: operation.observation };
}
