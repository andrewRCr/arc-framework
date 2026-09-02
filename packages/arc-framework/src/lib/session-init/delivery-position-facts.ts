/** Bounded Git and host observations for session-init delivery orientation. */

import { canonicalize } from "../kernel/index.js";
import type { GitExec } from "../git/exec.js";
import { observeDeliveryEligibilityRef } from "../delivery/git-eligibility.js";
import type { DeliveryHostPort } from "../delivery/host.js";
import {
  reconcileDeliveryOperation,
  type DeliveryOperationReconciliationObservationV1,
} from "../delivery/operation.js";
import type { DeliveryPositionFactsV1 } from "../delivery/position.js";
import type {
  DeliveryMemberCoordinatesV1,
  DeliveryOperationSnapshotV1,
  DeliveryPlanV1,
  DeliveryStateV1,
  DeliveryTargetCoordinatesV1,
} from "../delivery/schema.js";
import type {
  DeliveryContributionEndpoints,
  DeliveryContributionProofResult,
} from "../delivery/contribution-proof.js";
import type { DeliveryLandingResultCoordinates } from "../delivery/git-landing-result.js";
import type { DeliveryPositionObservation } from "./delivery-position.js";
import {
  classifyDeliveryTopRemedyObservation,
  matchesDeliveryTopRemedyTrigger,
} from "../delivery/top-remedy.js";
import { matchesDeliveryTeardownRequest } from "../delivery/teardown.js";
import { readAncestry } from "../work-unit/git-decomposition-object-readers.js";

interface DeliveryPositionFactsDependencies {
  readonly exec: GitExec;
  readonly cwd: string;
  readonly host: DeliveryHostPort;
  readonly repository: string;
  readonly remoteHeads: Readonly<Record<string, string>>;
  readonly localCommits: Readonly<Record<string, boolean>>;
  readonly localHeads?: Readonly<Record<string, string>>;
  readonly materializeTarget: (coordinates: DeliveryTargetCoordinatesV1) => Promise<boolean>;
  readonly observeLandedResult: (input: {
    readonly mergeCommitSha: string;
    readonly strategy: "merge" | "rebase" | "squash";
    readonly beforeMember: DeliveryMemberCoordinatesV1;
  }) => Promise<DeliveryLandingResultCoordinates | null>;
  readonly proveContribution: (endpoints: DeliveryContributionEndpoints) => Promise<DeliveryContributionProofResult>;
}

type RequestState = "open" | "merged" | "closed" | null;

/** Narrow observation policy for approved correction and external-adoption windows. */
export interface DeliveryPositionObservationOptions {
  readonly terminalAuthoringMovement?: "allow-append-only";
  readonly unlandedSuffixMovement?: "allow-external";
}

async function retainedCommitIsAvailable(
  ref: string,
  coordinates: NonNullable<DeliveryOperationSnapshotV1["members"][number]["coordinates"]>,
  dependencies: DeliveryPositionFactsDependencies,
): Promise<boolean> {
  const recorded = dependencies.localCommits[coordinates.head];
  if (recorded === false) return false;
  const prefix = "refs/heads/";
  if (recorded === undefined
    && (!ref.startsWith(prefix) || dependencies.remoteHeads[ref.slice(prefix.length)] !== undefined)) {
    return false;
  }
  const localOnlyExec: GitExec = (command, args, options) => dependencies.exec(command, args, {
    ...options,
    cwd: dependencies.cwd,
    objectAccess: "local-only",
  });
  const observed = await observeDeliveryEligibilityRef(localOnlyExec, coordinates.head);
  return observed !== null
    && observed.head === coordinates.head
    && observed.tree === coordinates.tree;
}

async function localCommitMatches(
  coordinates: NonNullable<DeliveryOperationSnapshotV1["members"][number]["coordinates"]>,
  dependencies: DeliveryPositionFactsDependencies,
): Promise<boolean> {
  const recorded = dependencies.localCommits[coordinates.head];
  if (recorded !== undefined) return recorded;
  const localOnlyExec: GitExec = (command, args, options) => dependencies.exec(command, args, {
    ...options,
    cwd: dependencies.cwd,
    objectAccess: "local-only",
  });
  const observed = await observeDeliveryEligibilityRef(localOnlyExec, coordinates.head);
  return observed !== null
    && observed.head === coordinates.head
    && observed.tree === coordinates.tree;
}

async function observeTarget(
  target: DeliveryOperationSnapshotV1["target"],
  dependencies: DeliveryPositionFactsDependencies,
): Promise<"exact" | "append-only" | null> {
  if (target === null) return "exact";
  if (target.coordinates === null) return null;
  const observed = await dependencies.host.observeTarget(dependencies.repository, target.ref);
  if (observed.status !== "observed") return null;
  if (canonicalize(observed.coordinates) === canonicalize(target.coordinates)) return "exact";
  if (!await dependencies.materializeTarget(observed.coordinates)) return null;
  const localOnlyExec: GitExec = (command, args, options) => dependencies.exec(command, args, {
    ...options,
    cwd: dependencies.cwd,
    objectAccess: "local-only",
  });
  return await readAncestry(localOnlyExec, target.coordinates.head, observed.coordinates.head) === "ancestor"
    ? "append-only"
    : null;
}

async function observeMember(
  member: DeliveryOperationSnapshotV1["members"][number],
  dependencies: DeliveryPositionFactsDependencies,
  allowAppendOnlyAuthoring = false,
  allowExternalMovement = false,
): Promise<{
  readonly exact: boolean;
  readonly requestState: RequestState;
  readonly externalMovement?: true;
  readonly terminalAuthoringMovement?: DeliveryPositionFactsV1["terminalAuthoringMovement"];
}> {
  if ((member.ref === null) !== (member.coordinates === null)) {
    return { exact: false, requestState: null };
  }
  let requestState: RequestState = null;
  let requestHead: string | null = null;
  if (member.changeRequest !== null) {
    const observed = await dependencies.host.readRequest(dependencies.repository, member.changeRequest);
    if (observed.status !== "observed"
      || canonicalize(observed.request.binding) !== canonicalize(member.changeRequest)
      || observed.request.repository !== dependencies.repository
      || observed.request.headRepository !== dependencies.repository
      || (member.ref !== null && observed.request.headRef !== member.ref.replace(/^refs\/heads\//u, ""))) {
      return { exact: false, requestState: null };
    }
    requestState = observed.request.state;
    requestHead = observed.request.headSha;
  }
  if (member.ref !== null && member.coordinates !== null) {
    const prefix = "refs/heads/";
    if (!member.ref.startsWith(prefix)) return { exact: false, requestState: null };
    const branch = member.ref.slice(prefix.length);
    const remoteHead = dependencies.remoteHeads[branch];
    if (requestState === "merged") {
      if (requestHead !== member.coordinates.head
        || !await retainedCommitIsAvailable(member.ref, member.coordinates, dependencies)
        || (remoteHead !== undefined && remoteHead !== member.coordinates.head)) {
        return { exact: false, requestState: null };
      }
    } else {
      if (remoteHead === undefined
        || dependencies.localCommits[remoteHead] !== true) {
        return { exact: false, requestState: null };
      }
      const localOnlyExec: GitExec = (command, args, options) => dependencies.exec(command, args, {
        ...options,
        cwd: dependencies.cwd,
        objectAccess: "local-only",
      });
      const coordinates = await observeDeliveryEligibilityRef(localOnlyExec, remoteHead);
      if (coordinates === null || (requestHead !== null && requestHead !== remoteHead)) {
        return { exact: false, requestState: null };
      }
      let remoteAuthoringMovement = false;
      if (remoteHead !== member.coordinates.head) {
        if (allowAppendOnlyAuthoring && requestState === "open" && requestHead !== null
          && await localCommitMatches(member.coordinates, dependencies)
          && await readAncestry(localOnlyExec, member.coordinates.head, remoteHead) === "ancestor") {
          remoteAuthoringMovement = true;
        } else {
          return allowExternalMovement && requestState === "open"
            ? { exact: true, requestState, externalMovement: true }
            : { exact: false, requestState: null };
        }
      }
      if (!remoteAuthoringMovement && coordinates.tree !== member.coordinates.tree) {
        return { exact: false, requestState: null };
      }
      const localHead = allowAppendOnlyAuthoring ? dependencies.localHeads?.[branch] : undefined;
      if (localHead !== undefined && localHead !== remoteHead) {
        const localCoordinates = dependencies.localCommits[localHead] === true
          ? await observeDeliveryEligibilityRef(localOnlyExec, localHead)
          : null;
        if (requestState !== "open" || requestHead !== remoteHead || localCoordinates === null
          || !await localCommitMatches(member.coordinates, dependencies)
          || await readAncestry(localOnlyExec, remoteHead, localHead) !== "ancestor") {
          return { exact: false, requestState: null };
        }
        return {
          exact: true,
          requestState,
          terminalAuthoringMovement: {
            deliverableId: member.deliverableId,
            before: member.coordinates,
            after: {
              base: member.coordinates.base,
              head: localCoordinates.head,
              tree: localCoordinates.tree,
            },
            publicationLeaseHead: remoteHead,
          },
        };
      }
      if (remoteAuthoringMovement) {
        return {
          exact: true,
          requestState,
          terminalAuthoringMovement: {
            deliverableId: member.deliverableId,
            before: member.coordinates,
            after: { base: member.coordinates.base, head: coordinates.head, tree: coordinates.tree },
            publicationLeaseHead: remoteHead,
          },
        };
      }
    }
  } else if (requestState === "merged") {
    return { exact: false, requestState: null };
  }
  return { exact: true, requestState };
}

async function snapshotIsCurrent(
  snapshot: DeliveryOperationSnapshotV1,
  dependencies: DeliveryPositionFactsDependencies,
): Promise<boolean> {
  if (await observeTarget(snapshot.target, dependencies) !== "exact") return false;
  const observed = await Promise.all(snapshot.members.map((member) => (
    observeMember(member, dependencies)
  )));
  return observed.every((member) => member.exact);
}

async function observeOperation(
  state: DeliveryStateV1,
  revision: number,
  dependencies: DeliveryPositionFactsDependencies,
): Promise<{
  readonly observation: DeliveryOperationReconciliationObservationV1 | null;
  readonly projected: DeliveryStateV1;
} | null> {
  const operation = state.activeOperation;
  if (operation === null) return { observation: null, projected: state };
  let observation: DeliveryOperationReconciliationObservationV1;
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
    if (operation.mode !== "sequential") return null;
    const request = await dependencies.host.readRequest(dependencies.repository, {
      providerId: operation.effect.providerId,
      changeRequestId: operation.effect.changeRequestId,
    });
    if (request.status !== "observed") return null;
    if (request.request.state === "open") {
      observation = { outcome: "not-applied" };
    } else if (request.request.state === "merged") {
      const beforeMember = operation.before.members[0]?.coordinates;
      const beforeTarget = operation.before.target?.coordinates;
      const mergeCommitSha = request.request.mergeCommitSha;
      if (beforeMember === null || beforeMember === undefined || beforeTarget === null
        || beforeTarget === undefined || mergeCommitSha === null || mergeCommitSha === undefined) return null;
      const landed = await dependencies.observeLandedResult({
        mergeCommitSha,
        strategy: operation.effect.strategy,
        beforeMember,
      });
      if (landed === null || (await dependencies.proveContribution({
        before: { predecessor: beforeTarget, member: beforeMember },
        after: landed,
      })).status !== "accepted") return null;
      observation = {
        outcome: "applied",
        observation: {
          kind: "land",
          effect: operation.effect,
          outcome: "applied",
          snapshot: {
            target: { ref: operation.effect.targetRef, coordinates: landed.member },
            members: operation.before.members,
          },
        },
      };
    } else return null;
  } else if (operation.kind === "top-remedy") {
    const trigger = state.members.at(-2);
    const prefix = "refs/heads/";
    if (!matchesDeliveryTopRemedyTrigger(operation.effect, trigger)
      || !operation.effect.triggerRef.startsWith(prefix)
      || dependencies.remoteHeads[operation.effect.triggerRef.slice(prefix.length)] !== undefined
      || trigger?.coordinates === null || trigger?.coordinates === undefined
      || !await retainedCommitIsAvailable(operation.effect.triggerRef, trigger.coordinates, dependencies)) return null;
    const request = await dependencies.host.readRequest(operation.effect.repository, {
      providerId: operation.effect.providerId,
      changeRequestId: operation.effect.changeRequestId,
    });
    if (request.status !== "observed") return null;
    observation = classifyDeliveryTopRemedyObservation(
      operation.effect, request.request, operation.requested,
    );
  } else if (operation.kind === "teardown") {
    const member = operation.before.members[0];
    const targetRef = operation.before.target?.ref;
    if (member === undefined || member.ref === null || member.changeRequest === null
      || member.coordinates === null || targetRef === undefined) return null;
    const request = await dependencies.host.readRequest(dependencies.repository, member.changeRequest);
    if (request.status !== "observed") return null;
    if (!matchesDeliveryTeardownRequest({
      request: request.request,
      repository: dependencies.repository,
      protectedTargetRef: targetRef,
      member,
    })) {
      observation = { outcome: "ambiguous" };
    } else {
      const prefix = "refs/heads/";
      if (!member.ref.startsWith(prefix)) return null;
      const remoteHead = dependencies.remoteHeads[member.ref.slice(prefix.length)];
      if (remoteHead === member.coordinates.head) {
        observation = { outcome: "not-applied" };
      } else if (remoteHead === undefined
        && await retainedCommitIsAvailable(member.ref, member.coordinates, dependencies)) {
        observation = { outcome: "applied", snapshot: operation.requested };
      } else {
        observation = { outcome: "ambiguous" };
      }
    }
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
  options: DeliveryPositionObservationOptions,
): Promise<DeliveryPositionFactsV1 | null> {
  const targetMovement = await observeTarget(state.target, dependencies);
  if (targetMovement === null) return null;
  const terminalIndex = state.members.length - 1;
  const members = await Promise.all(state.members.map((member, index) => observeMember(
    member,
    dependencies,
    index === terminalIndex && options.terminalAuthoringMovement === "allow-append-only",
    index < terminalIndex && options.unlandedSuffixMovement === "allow-external",
  )));
  if (members.some((member) => !member.exact)) return null;
  const terminalAuthoringMovement = members[terminalIndex]?.terminalAuthoringMovement;

  const landedDeliverableIds: string[] = [];
  let unlandedSeen = false;
  const nonTerminalCleared = state.members.slice(0, -1).every((member) => (
    member.ref === null && member.changeRequest === null && member.coordinates === null
  ));
  for (const [index, member] of state.members.entries()) {
    const requestState = members[index]?.requestState ?? null;
    const cleared = index < terminalIndex
      && member.ref === null && member.changeRequest === null && member.coordinates === null
      && (nonTerminalCleared || state.members.slice(index + 1).some((candidate) => (
        candidate.ref !== null || candidate.changeRequest !== null || candidate.coordinates !== null
      )));
    const landed = requestState === "merged" || cleared;
    if (landed && members[index]?.externalMovement === true) return null;
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
    ...(targetMovement === "append-only" ? { targetMovement } : {}),
    ...(terminalAuthoringMovement === undefined ? {} : { terminalAuthoringMovement }),
  };
}

/**
 * Acquire fresh, read-only delivery facts for one exact state revision.
 *
 * @param plan - Current canonical plan selected by exact work-unit identity.
 * @param state - Current coherent bound state.
 * @param revision - Store-owned revision paired with the state payload.
 * @param dependencies - Passive Git and host observation ports.
 * @param options - Optional review-fix-only terminal authoring policy.
 * @returns Recognized facts for orientation, or a closed observation refusal.
 */
export async function observeRepositoryDeliveryPosition(
  plan: DeliveryPlanV1,
  state: DeliveryStateV1,
  revision: number,
  dependencies: DeliveryPositionFactsDependencies,
  options: DeliveryPositionObservationOptions = {},
): Promise<DeliveryPositionObservation> {
  const operation = await observeOperation(state, revision, dependencies);
  if (operation === null) return { status: "refused" };
  const facts = await observeFacts(plan, operation.projected, dependencies, options);
  return facts === null
    ? { status: "refused" }
    : {
        status: "observed",
        facts,
        operationObservation: operation.observation,
        projectedState: operation.projected,
      };
}
