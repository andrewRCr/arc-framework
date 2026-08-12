/** Ordered delivery-chain derivation and binding through the single operation slot. */

import type { DeliveryHostOpenRequest, DeliveryHostPort } from "./host.js";
import {
  acceptDeliveryOperationResult,
  reserveDeliveryOperation,
} from "./operation.js";
import type { DeliveryRevisionedRecord, DeliveryStateStore } from "./ports.js";
import type {
  DeliveryEligibilitySnapshot,
} from "./eligibility.js";
import type {
  DeliveryMemberCoordinatesV1,
  DeliveryOperationSnapshotV1,
  DeliveryPlanV1,
  DeliveryStateV1,
} from "./schema.js";
import { constructInitialDeliveryState } from "./state.js";

/** One explicitly identified materialization member; ref spelling is never parsed for identity. */
export interface DeliveryMaterializationMember {
  readonly deliverableId: string;
  readonly chunkKey: string;
  readonly ref: string | null;
  readonly requestBaseRef: string | null;
  readonly coordinates: DeliveryMemberCoordinatesV1;
  readonly head: string;
  readonly tree: string;
}

/** Complete ordered projection derived from one freshly closed eligibility snapshot. */
export interface DeliveryMaterializationPlan {
  readonly planId: string;
  readonly workUnitId: string;
  readonly target: DeliveryEligibilitySnapshot["protectedBase"];
  readonly members: readonly DeliveryMaterializationMember[];
}

/** Derive exact refs and predecessor bases; the terminal remains on the control branch. */
export function deriveDeliveryMaterialization(
  plan: DeliveryPlanV1,
  snapshot: DeliveryEligibilitySnapshot,
): { readonly status: "derived"; readonly value: DeliveryMaterializationPlan } | {
  readonly status: "refused";
  readonly reason: "snapshot-mismatch";
} {
  if (snapshot.planId !== plan.planId || snapshot.workUnitId !== plan.workUnitId
    || snapshot.planRevision !== plan.planRevision || snapshot.planDigest !== plan.planDigest
    || snapshot.members.length !== plan.members.length
    || snapshot.members.some((member, index) => member.deliverableId !== plan.members[index]?.deliverableId)) {
    return { status: "refused", reason: "snapshot-mismatch" };
  }
  return {
    status: "derived",
    value: {
      planId: plan.planId,
      workUnitId: plan.workUnitId,
      target: snapshot.protectedBase,
      members: plan.members.map((member, index) => {
        const terminal = index === plan.members.length - 1;
        const candidate = terminal ? snapshot.control : snapshot.members[index];
        const predecessor = index === 0 ? snapshot.protectedBase : snapshot.members[index - 1];
        const predecessorMember = index === 0 ? undefined : plan.members[index - 1];
        if (candidate === undefined || predecessor === undefined || (index > 0 && predecessorMember === undefined)) {
          throw new Error("validated materialization snapshot lost plan order");
        }
        return {
          deliverableId: member.deliverableId,
          chunkKey: member.chunkKey,
          ref: terminal ? null : `refs/heads/delivery/${plan.workUnitId}/${member.chunkKey}`,
          requestBaseRef: terminal ? null : index === 0
            ? snapshot.protectedBase.ref
            : `refs/heads/delivery/${plan.workUnitId}/${predecessorMember?.chunkKey ?? ""}`,
          coordinates: { base: predecessor.head, head: candidate.head, tree: candidate.tree },
          head: candidate.head,
          tree: candidate.tree,
        };
      }),
    },
  };
}

/** External ref publication seam used by materialization orchestration. */
export interface DeliveryMaterializationRefPort {
  publish(ref: string, head: string): Promise<
    | { readonly status: "published" | "adopted" }
    | { readonly status: "refused" }
  >;
}

/** Bind the first uniquely observed ref event through the shipped state constructor. */
export async function bindInitialDeliveryRef(input: {
  readonly plan: DeliveryPlanV1;
  readonly materialization: DeliveryMaterializationPlan;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "read" | "publish">;
  readonly refs: DeliveryMaterializationRefPort;
}): Promise<{ readonly status: "bound"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> } | {
  readonly status: "refused";
  readonly reason: "state-exists" | "publication-refused" | "state-refused" | "projection-invalid";
}> {
  const first = input.materialization.members[0];
  if (first?.ref === null || first === undefined) return { status: "refused", reason: "projection-invalid" };
  const existing = await input.stateStore.read(input.plan.planId);
  if (existing.status !== "ok") return { status: "refused", reason: "state-refused" };
  if (existing.value !== null) return { status: "refused", reason: "state-exists" };
  const publication = await input.refs.publish(first.ref, first.head);
  if (publication.status === "refused") return { status: "refused", reason: "publication-refused" };
  const constructed = constructInitialDeliveryState(input.plan, {
    kind: "pushed-ref",
    deliverableId: first.deliverableId,
    ref: first.ref,
    coordinates: first.coordinates,
  });
  if (constructed.status !== "constructed") return { status: "refused", reason: "projection-invalid" };
  const persisted = await input.stateStore.publish(input.plan.planId, constructed.state, 0);
  return persisted.status === "ok"
    ? { status: "bound", state: persisted.value }
    : { status: "refused", reason: "state-refused" };
}

/** Recover the prebinding carve-out from one uniquely observed first request. */
export async function bindInitialDeliveryRequest(input: {
  readonly plan: DeliveryPlanV1;
  readonly materialization: DeliveryMaterializationPlan;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "read" | "publish">;
  readonly host: DeliveryHostPort;
  readonly repository: string;
  readonly draft: boolean;
}): Promise<{ readonly status: "bound"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> } | {
  readonly status: "refused";
}> {
  const first = input.materialization.members[0];
  if (first?.ref === null || first === undefined || first.requestBaseRef === null) return { status: "refused" };
  const current = await input.stateStore.read(input.plan.planId);
  if (current.status !== "ok" || current.value !== null) return { status: "refused" };
  const effect = {
    providerId: "github",
    repository: input.repository,
    headRef: first.ref.replace(/^refs\/heads\//u, ""),
    headSha: first.head,
    baseRef: first.requestBaseRef.replace(/^refs\/heads\//u, ""),
    draft: input.draft,
  } as const;
  const observed = await input.host.observeRequest(effect);
  if (observed.status !== "observed") return { status: "refused" };
  const constructed = constructInitialDeliveryState(input.plan, {
    kind: "opened-change-request",
    deliverableId: first.deliverableId,
    changeRequest: observed.request.binding,
  });
  if (constructed.status !== "constructed") return { status: "refused" };
  const persisted = await input.stateStore.publish(input.plan.planId, constructed.state, 0);
  return persisted.status === "ok" ? { status: "bound", state: persisted.value } : { status: "refused" };
}

function snapshot(state: DeliveryStateV1, memberId: string): DeliveryOperationSnapshotV1 | null {
  const member = state.members.find((candidate) => candidate.deliverableId === memberId);
  return member === undefined ? null : {
    target: state.target,
    members: [{
      deliverableId: member.deliverableId,
      ref: member.ref,
      changeRequest: member.changeRequest,
      coordinates: member.coordinates,
    }],
  };
}

async function persistDeterministicStep(input: {
  readonly plan: DeliveryPlanV1;
  readonly current: DeliveryRevisionedRecord<DeliveryStateV1>;
  readonly requested: DeliveryOperationSnapshotV1;
  readonly memberId: string;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "publish">;
  readonly mutate: () => Promise<{ readonly status: "applied" } | { readonly status: "refused" }>;
}): Promise<{ readonly status: "applied"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> } | {
  readonly status: "refused";
}> {
  const before = snapshot(input.current.value, input.memberId);
  if (before === null) return { status: "refused" };
  const reserved = reserveDeliveryOperation(input.current, input.plan, {
    operationId: crypto.randomUUID(),
    kind: "materialize",
    affectedDeliverableIds: [input.memberId],
    expectedStateRevision: input.current.revision,
    before,
    requested: input.requested,
  });
  if (reserved.status !== "reserved") return { status: "refused" };
  const reservation = await input.stateStore.publish(input.plan.planId, reserved.state, input.current.revision);
  if (reservation.status !== "ok") return { status: "refused" };
  if ((await input.mutate()).status !== "applied") return { status: "refused" };
  const accepted = acceptDeliveryOperationResult(reservation.value, input.requested);
  if (accepted.status !== "applied") return { status: "refused" };
  const persisted = await input.stateStore.publish(input.plan.planId, accepted.state, reservation.value.revision);
  return persisted.status === "ok" ? { status: "applied", state: persisted.value } : { status: "refused" };
}

/** Bind the protected target and every missing non-terminal ref in plan order. */
export async function materializeBoundDeliveryChain(input: {
  readonly plan: DeliveryPlanV1;
  readonly materialization: DeliveryMaterializationPlan;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "read" | "publish">;
  readonly refs: DeliveryMaterializationRefPort;
}): Promise<{ readonly status: "materialized"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> } | {
  readonly status: "refused";
}> {
  const read = await input.stateStore.read(input.plan.planId);
  if (read.status !== "ok" || read.value === null) return { status: "refused" };
  let current = read.value;
  const anchor = input.materialization.members[0];
  if (anchor === undefined) return { status: "refused" };
  if (current.value.target === null) {
    const before = snapshot(current.value, anchor.deliverableId);
    if (before === null) return { status: "refused" };
    const targetStep = await persistDeterministicStep({
      plan: input.plan,
      current,
      memberId: anchor.deliverableId,
      stateStore: input.stateStore,
      requested: { ...before, target: {
        ref: input.materialization.target.ref,
        coordinates: { head: input.materialization.target.head, tree: input.materialization.target.tree },
      } },
      mutate: () => Promise.resolve({ status: "applied" }),
    });
    if (targetStep.status !== "applied") return targetStep;
    current = targetStep.state;
  }
  for (const member of input.materialization.members) {
    if (member.ref === null) continue;
    const stored = current.value.members.find((candidate) => candidate.deliverableId === member.deliverableId);
    if (stored?.ref === member.ref && stored.coordinates?.head === member.head) continue;
    const before = snapshot(current.value, member.deliverableId);
    if (before === null) return { status: "refused" };
    const [beforeMember] = before.members;
    if (beforeMember === undefined) return { status: "refused" };
    const ref = member.ref;
    const step = await persistDeterministicStep({
      plan: input.plan,
      current,
      memberId: member.deliverableId,
      stateStore: input.stateStore,
      requested: {
        target: before.target,
        members: [{ ...beforeMember, ref, coordinates: member.coordinates }],
      },
      mutate: async () => (await input.refs.publish(ref, member.head)).status === "refused"
        ? { status: "refused" }
        : { status: "applied" },
    });
    if (step.status !== "applied") return step;
    current = step.state;
  }
  return { status: "materialized", state: current };
}

/** Open or adopt every non-terminal request through host-assigned operation acceptance. */
export async function publishDeliveryRequests(input: {
  readonly plan: DeliveryPlanV1;
  readonly materialization: DeliveryMaterializationPlan;
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "read" | "publish">;
  readonly host: DeliveryHostPort;
  readonly repository: string;
  readonly draft: boolean;
  presentation(member: DeliveryMaterializationMember): Pick<DeliveryHostOpenRequest, "title" | "body">;
}): Promise<{ readonly status: "published"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> } | {
  readonly status: "refused";
}> {
  const read = await input.stateStore.read(input.plan.planId);
  if (read.status !== "ok" || read.value === null) return { status: "refused" };
  let current = read.value;
  for (const member of input.materialization.members) {
    if (member.ref === null || member.requestBaseRef === null) continue;
    const stored = current.value.members.find((candidate) => candidate.deliverableId === member.deliverableId);
    if (stored?.changeRequest !== null && stored?.changeRequest !== undefined) continue;
    const before = snapshot(current.value, member.deliverableId);
    if (before === null) return { status: "refused" };
    const effect = {
      providerId: "github",
      repository: input.repository,
      headRef: member.ref.replace(/^refs\/heads\//u, ""),
      headSha: member.head,
      baseRef: member.requestBaseRef.replace(/^refs\/heads\//u, ""),
      draft: input.draft,
    } as const;
    const reserved = reserveDeliveryOperation(current, input.plan, {
      operationId: crypto.randomUUID(),
      kind: "publish",
      affectedDeliverableIds: [member.deliverableId],
      expectedStateRevision: current.revision,
      before,
      requested: before,
      effect,
    });
    if (reserved.status !== "reserved") return { status: "refused" };
    const reservation = await input.stateStore.publish(input.plan.planId, reserved.state, current.revision);
    if (reservation.status !== "ok") return { status: "refused" };
    let observed = await input.host.observeRequest(effect);
    if (observed.status === "absent") {
      const presentation = input.presentation(member);
      if ((await input.host.openRequest({ effect, ...presentation })).status === "refused") return { status: "refused" };
      observed = await input.host.observeRequest(effect);
    }
    if (observed.status !== "observed") return { status: "refused" };
    const observedSnapshot = {
      ...before,
      members: before.members.map((entry) => ({ ...entry, changeRequest: observed.request.binding })),
    };
    const accepted = acceptDeliveryOperationResult(reservation.value, {
      kind: "publish",
      effect,
      outcome: "applied",
      snapshot: observedSnapshot,
    });
    if (accepted.status !== "applied") return { status: "refused" };
    const persisted = await input.stateStore.publish(input.plan.planId, accepted.state, reservation.value.revision);
    if (persisted.status !== "ok") return { status: "refused" };
    current = persisted.value;
  }
  return { status: "published", state: current };
}
