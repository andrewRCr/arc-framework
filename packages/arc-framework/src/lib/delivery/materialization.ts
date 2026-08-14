/** Ordered delivery-chain derivation and binding through the single operation slot. */

import type { DeliveryHostOpenRequest, DeliveryHostPort } from "./host.js";
import {
  acceptDeliveryOperationResult,
  checkDeliveryOperationPrecondition,
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

/** Reviewer-authored context for one non-terminal delivery request. */
export interface DeliveryMemberReviewerPresentation {
  readonly deliverableId: string;
  readonly summary: string;
  readonly changes?: readonly {
    readonly topic: string;
    readonly description: string;
  }[];
  readonly designReference?: string;
}

/** Validate exact authored presentation coverage without granting caller order authority. */
export function resolveDeliveryMemberPresentations(
  plan: DeliveryPlanV1,
  presentations: readonly DeliveryMemberReviewerPresentation[],
): { readonly status: "resolved"; readonly value: ReadonlyMap<string, DeliveryMemberReviewerPresentation> } | {
  readonly status: "refused";
  readonly reason: "presentation-mismatch";
} {
  const expected = new Set(plan.members.slice(0, -1).map((member) => member.deliverableId));
  const byDeliverableId = new Map<string, DeliveryMemberReviewerPresentation>();
  for (const presentation of presentations) {
    if (!expected.has(presentation.deliverableId) || byDeliverableId.has(presentation.deliverableId)) {
      return { status: "refused", reason: "presentation-mismatch" };
    }
    byDeliverableId.set(presentation.deliverableId, presentation);
  }
  return byDeliverableId.size === expected.size
    ? { status: "resolved", value: byDeliverableId }
    : { status: "refused", reason: "presentation-mismatch" };
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

/** Compose one non-terminal member's change-request presentation from its plan position. */
export function describeDeliveryMemberPresentation(
  plan: DeliveryPlanV1,
  member: Pick<DeliveryMaterializationMember, "deliverableId" | "chunkKey">,
  presentation: DeliveryMemberReviewerPresentation,
): Pick<DeliveryHostOpenRequest, "title" | "body"> {
  const index = plan.members.findIndex((planned) => planned.deliverableId === member.deliverableId);
  const planned = index >= 0 ? plan.members[index] : undefined;
  if (planned === undefined || index === plan.members.length - 1) {
    throw new Error(`delivery member ${member.deliverableId} is outside the delivery plan presentation set`);
  }
  if (presentation.deliverableId !== member.deliverableId) {
    throw new Error(`delivery member ${member.deliverableId} has mismatched reviewer presentation`);
  }
  const position = `${index + 1}/${plan.members.length}`;
  const body: string[] = [];
  if (presentation.designReference !== undefined) {
    const design = /^https?:\/\//u.test(presentation.designReference)
      ? presentation.designReference
      : `\`${presentation.designReference}\``;
    body.push(`**Design:** ${design}`, "");
  }
  body.push("## Summary", "", presentation.summary);
  if (presentation.changes !== undefined && presentation.changes.length > 0) {
    body.push(
      "",
      "## Changes",
      "",
      presentation.changes.map((change) => `- _${change.topic}_ — ${change.description}`).join("\n\n"),
    );
  }
  return {
    title: `${plan.workUnitId} [${position}]: ${planned.title}`,
    body: body.join("\n"),
  };
}

/** External ref publication seam used by materialization orchestration. */
export interface DeliveryMaterializationRefPort {
  observe(ref: string): Promise<
    | { readonly status: "absent" }
    | { readonly status: "observed"; readonly head: string }
    | { readonly status: "refused" }
  >;
  publish(ref: string, head: string): Promise<
    | { readonly status: "published" | "adopted" }
    | { readonly status: "refused" }
  >;
}

function isExactOpenRequest(
  request: Awaited<ReturnType<DeliveryHostPort["observeRequest"]>> & { readonly status: "observed" },
  effect: {
    readonly repository: string;
    readonly headRef: string;
    readonly headSha: string;
    readonly baseRef: string;
    readonly draft: boolean;
  },
): boolean {
  return request.request.repository === effect.repository
    && request.request.headRepository === effect.repository
    && request.request.headRef === effect.headRef
    && request.request.headSha === effect.headSha
    && request.request.baseRef === effect.baseRef
    && request.request.draft === effect.draft
    && request.request.state === "open";
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
  const observed = await input.refs.observe(first.ref);
  if (observed.status !== "observed" || observed.head !== first.head) {
    return { status: "refused", reason: "publication-refused" };
  }
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
}): Promise<
  | { readonly status: "bound"; readonly state: DeliveryRevisionedRecord<DeliveryStateV1> }
  | { readonly status: "absent" }
  | { readonly status: "refused" }
> {
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
  if (observed.status === "absent") return observed;
  if (observed.status !== "observed") return { status: "refused" };
  if (!isExactOpenRequest(observed, effect)) return { status: "refused" };
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
  readonly stateStore: Pick<DeliveryStateStore<DeliveryStateV1>, "read" | "publish">;
  readonly observeBefore: () => Promise<boolean>;
  readonly mutate: () => Promise<{ readonly status: "applied" } | { readonly status: "refused" }>;
  readonly observeAfter: () => Promise<DeliveryOperationSnapshotV1 | null>;
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
  const fresh = await input.stateStore.read(input.plan.planId);
  if (fresh.status !== "ok" || fresh.value === null || fresh.value.revision !== reservation.value.revision) {
    return { status: "refused" };
  }
  const freshBefore = snapshot(fresh.value.value, input.memberId);
  if (freshBefore === null
    || checkDeliveryOperationPrecondition(fresh.value, freshBefore).status !== "ready"
    || !(await input.observeBefore())) return { status: "refused" };
  if ((await input.mutate()).status !== "applied") return { status: "refused" };
  const observedAfter = await input.observeAfter();
  if (observedAfter === null) return { status: "refused" };
  const accepted = acceptDeliveryOperationResult(fresh.value, observedAfter);
  if (accepted.status !== "applied") return { status: "refused" };
  const persisted = await input.stateStore.publish(input.plan.planId, accepted.state, fresh.value.revision);
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
      observeBefore: async () => {
        const observed = await input.refs.observe(input.materialization.target.ref);
        return observed.status === "observed" && observed.head === input.materialization.target.head;
      },
      mutate: () => Promise.resolve({ status: "applied" }),
      observeAfter: async () => {
        const observed = await input.refs.observe(input.materialization.target.ref);
        return observed.status === "observed" && observed.head === input.materialization.target.head
          ? { ...before, target: {
            ref: input.materialization.target.ref,
            coordinates: { head: observed.head, tree: input.materialization.target.tree },
          } }
          : null;
      },
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
      observeBefore: async () => {
        const observed = await input.refs.observe(ref);
        return observed.status === "absent" || (observed.status === "observed" && observed.head === member.head);
      },
      mutate: async () => (await input.refs.publish(ref, member.head)).status === "refused"
        ? { status: "refused" }
        : { status: "applied" },
      observeAfter: async () => {
        const observed = await input.refs.observe(ref);
        return observed.status === "observed" && observed.head === member.head
          ? {
            target: before.target,
            members: [{ ...beforeMember, ref, coordinates: { ...member.coordinates, head: observed.head } }],
          }
          : null;
      },
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
    const fresh = await input.stateStore.read(input.plan.planId);
    if (fresh.status !== "ok" || fresh.value === null || fresh.value.revision !== reservation.value.revision) {
      return { status: "refused" };
    }
    const freshBefore = snapshot(fresh.value.value, member.deliverableId);
    if (freshBefore === null
      || checkDeliveryOperationPrecondition(fresh.value, freshBefore).status !== "ready") {
      return { status: "refused" };
    }
    let observed = await input.host.observeRequest(effect);
    if (observed.status === "absent") {
      const presentation = input.presentation(member);
      if ((await input.host.openRequest({ effect, ...presentation })).status === "refused") return { status: "refused" };
      observed = await input.host.observeRequest(effect);
    }
    if (observed.status !== "observed") return { status: "refused" };
    if (!isExactOpenRequest(observed, effect)) return { status: "refused" };
    const observedSnapshot = {
      ...before,
      members: before.members.map((entry) => ({ ...entry, changeRequest: observed.request.binding })),
    };
    const accepted = acceptDeliveryOperationResult(fresh.value, {
      kind: "publish",
      effect,
      outcome: "applied",
      snapshot: observedSnapshot,
    });
    if (accepted.status !== "applied") return { status: "refused" };
    const persisted = await input.stateStore.publish(input.plan.planId, accepted.state, fresh.value.revision);
    if (persisted.status !== "ok") return { status: "refused" };
    current = persisted.value;
  }
  return { status: "published", state: current };
}
