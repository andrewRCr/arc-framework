import { describe, expect, it } from "vitest";

import {
  DeliveryPlanComposer,
  type DeliveryCompositionAuthoringStore,
  type DeliveryCompositionProjection,
} from "../../../src/lib/delivery/compose.js";
import {
  DeliveryAuthoringSlotsV1Schema,
  renderDeliveryAuthoringMap,
} from "../../../src/lib/delivery/authoring-map.js";
import {
  createDeliveryAuthoringSnapshot,
  type DeliveryAuthoringCandidateOutcomeV1,
} from "../../../src/lib/delivery/authoring-schema.js";
import type {
  DeliveryAuthoringRecord,
  DeliveryAuthoringStoreResult,
} from "../../../src/lib/delivery/authoring-store.js";
import type {
  DeliveryPlanStore,
  DeliveryRevisionedRecord,
  DeliveryStateStore,
} from "../../../src/lib/delivery/ports.js";
import type { DeliveryTaskListRenderer } from "../../../src/lib/delivery/task-list-render.js";
import type { DeliveryTaskInventoryEntry } from "../../../src/lib/delivery/task-inventory.js";
import {
  canonicalDigest,
  canonicalize,
  type CanonicalDigest,
} from "../../../src/lib/kernel/index.js";
import {
  DeliveryPlanAuthoringInputV1Schema,
  type DeliveryPlanV1,
  type DeliveryStateV1,
} from "../../../src/lib/delivery/schema.js";
import {
  constructInitialDeliveryState,
  validateDeliveryStateAgainstPlan,
} from "../../../src/lib/delivery/state.js";

const PLAN_ID = "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1";
const OTHER_PLAN_ID = "9cd88752-ef99-4e21-a41f-234bc98f35e0";

function fixture(expectedCurrentPlanDigest: CanonicalDigest | null = null, memberCount: 1 | 2 = 1) {
  const taskDigest = canonicalDigest({ goal: "Implement" });
  const memberParents: DeliveryTaskInventoryEntry[] = [
    {
      taskId: "1.1",
      semanticDigest: taskDigest,
      role: { kind: "verification" as const, scope: "member" as const },
    },
    ...(memberCount === 2 ? [{
      taskId: "2.1",
      semanticDigest: taskDigest,
      role: { kind: "verification" as const, scope: "member" as const },
    }] : []),
  ];
  const workUnitVerificationTaskId = memberCount === 1 ? "2.1" : "3.1";
  const parents: DeliveryTaskInventoryEntry[] = [
    ...memberParents,
    {
      taskId: workUnitVerificationTaskId,
      semanticDigest: null,
      role: { kind: "verification" as const, scope: "work-unit" },
    },
  ];
  const taskInventory = {
    inventoryDigest: canonicalDigest(parents),
    parents,
  } as const;
  const designInventory = {
    artifacts: [{ artifactId: "spec.md", revisionDigest: canonicalDigest({ spec: 1 }) }],
    elements: [],
  } as const;
  const snapshot = createDeliveryAuthoringSnapshot({
    mapId: "authoring-map",
    originalWorkUnitId: "delivery-plan-record",
    planId: PLAN_ID,
    expectedCurrentPlanDigest,
    design: designInventory,
    tasks: taskInventory,
    source: {
      entry: "from-tasks",
      inputs: { taskListPath: "tasks.md" },
      facts: {
        phaseGroups: memberParents.map(({ taskId }) => ({ phaseId: taskId.split(".")[0]!, taskIds: [taskId] })),
      },
      identitySequence: [
        ...memberParents.flatMap(({ taskId }) => [`phase:${taskId.split(".")[0]!}`, `task:${taskId}`]),
        `task:${workUnitVerificationTaskId}`,
      ],
    },
  });
  const slots = {
    projection: { kind: "wu-integration-target" as const },
    boundary: { kind: "phase-aligned" as const },
    members: [
      {
        chunkKey: "only",
        title: "Only member",
        contract: "Publish the contract",
        designElementIds: [],
        mainlineLandability: "integration-only" as const,
      },
      ...(memberCount === 2 ? [{
        chunkKey: "terminal",
        title: "Terminal member",
        contract: "Integrate the work unit",
        designElementIds: [],
        mainlineLandability: "integration-only" as const,
      }] : []),
    ],
    seams: [],
  };
  const authoredMember = slots.members[0];
  if (authoredMember === undefined) throw new Error("expected authored member");
  const record: DeliveryAuthoringRecord = {
    snapshot,
    markdown: renderDeliveryAuthoringMap(snapshot, slots),
  };
  const projection: DeliveryCompositionProjection = {
    authoring: DeliveryPlanAuthoringInputV1Schema.parse({
      schemaVersion: 1,
      semanticsVersion: "delivery-plan/v1",
      workUnitId: "delivery-plan-record",
      design: { artifacts: [{ artifactId: "spec.md" }], elements: [] },
      tasks: { parents: parents.map(({ taskId, role }) => ({ taskId, role })) },
      entry: "from-tasks",
      projection: slots.projection,
      members: slots.members.map((member, index) => ({
        ...member,
        taskIds: [memberParents[index]!.taskId],
      })),
      seams: [],
    }),
    boundary: slots.boundary,
    contributionStepIds: slots.members.map((_member, index) => `step-${index + 1}`),
    memberContributionSteps: slots.members.map((member, index) => ({
      chunkKey: member.chunkKey,
      contributionStepIds: [`step-${index + 1}`],
    })),
  };
  return { record, projection, slots, taskInventory, designInventory };
}

class MemoryAuthoringStore implements DeliveryCompositionAuthoringStore {
  readonly calls: string[] = [];
  failMarkdownDelete = false;
  failSnapshotDelete = false;
  failSnapshotDeleteAfterMutation = false;

  constructor(
    public record: DeliveryAuthoringRecord | null,
    private readonly events: string[] = [],
  ) {}

  async recordCandidate(
    mapId: string,
    expected: DeliveryAuthoringRecord["snapshot"],
    candidatePlanDigest: CanonicalDigest,
    candidateProjectionDigest: CanonicalDigest,
    candidateOutcome: DeliveryAuthoringCandidateOutcomeV1,
  ): Promise<DeliveryAuthoringStoreResult<DeliveryAuthoringRecord["snapshot"]>> {
    this.calls.push("candidate");
    this.events.push("candidate");
    if (this.record === null || this.record.snapshot.mapId !== mapId
      || canonicalize(this.record.snapshot) !== canonicalize(expected)) {
      return { status: "refused", reason: "version-conflict" };
    }
    this.record = {
      ...this.record,
      snapshot: {
        ...this.record.snapshot,
        candidatePlanDigest,
        candidateProjectionDigest,
        candidateOutcome,
      },
    };
    return { status: "ok", value: this.record.snapshot };
  }

  async deleteMarkdown(): Promise<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>> {
    this.calls.push("delete-markdown");
    this.events.push("delete-markdown");
    if (this.failMarkdownDelete) return { status: "refused", reason: "version-conflict" };
    if (this.record === null) return { status: "ok", value: { removed: false } };
    const removed = this.record.markdown !== null;
    this.record = { ...this.record, markdown: null };
    return { status: "ok", value: { removed } };
  }

  async deleteSnapshot(): Promise<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>> {
    this.calls.push("delete-snapshot");
    this.events.push("delete-snapshot");
    if (this.failSnapshotDelete) return { status: "refused", reason: "version-conflict" };
    const removed = this.record !== null;
    this.record = null;
    if (this.failSnapshotDeleteAfterMutation) {
      return { status: "refused", reason: "version-conflict" };
    }
    return { status: "ok", value: { removed } };
  }
}

class MemoryPlanStore implements DeliveryPlanStore<DeliveryPlanV1> {
  readonly calls: string[] = [];
  refusePublication = false;

  constructor(
    public current: DeliveryPlanV1 | null = null,
    private readonly events: string[] = [],
  ) {}

  async readCurrent(planId: string) {
    return this.current === null || this.current.planId === planId
      ? { status: "ok" as const, value: this.current }
      : { status: "ok" as const, value: null };
  }

  async enumerateCurrent() {
    return { status: "ok" as const, value: this.current === null ? [] : [this.current] };
  }

  async restoreExact(planId: string, plan: DeliveryPlanV1) {
    const current = this.current;
    if (current !== null && (current.planId !== planId || current.planDigest !== plan.planDigest)) {
      return { status: "refused" as const, reason: "version-conflict" as const };
    }
    this.current = plan;
    return {
      status: "ok" as const,
      value: { currentDigest: plan.planDigest as CanonicalDigest },
    };
  }

  async publishCurrent(
    _planId: string,
    plan: DeliveryPlanV1,
    expectedCurrentDigest: CanonicalDigest | null,
  ) {
    this.calls.push("publish");
    this.events.push("publish");
    if (this.refusePublication) return { status: "refused" as const, reason: "version-conflict" as const };
    if (this.current?.planDigest === plan.planDigest) {
      return { status: "ok" as const, value: { currentDigest: plan.planDigest as CanonicalDigest } };
    }
    if ((this.current?.planDigest ?? null) !== expectedCurrentDigest) {
      return { status: "refused" as const, reason: "version-conflict" as const };
    }
    this.current = plan;
    return { status: "ok" as const, value: { currentDigest: plan.planDigest as CanonicalDigest } };
  }

  async removeCurrent(planId: string, expectedCurrentDigest: CanonicalDigest) {
    if (this.current === null) return { status: "ok" as const, value: { removed: false } };
    if (this.current.planId !== planId || this.current.planDigest !== expectedCurrentDigest) {
      return { status: "refused" as const, reason: "version-conflict" as const };
    }
    this.current = null;
    return { status: "ok" as const, value: { removed: true } };
  }
}

class MemoryStateStore implements DeliveryStateStore<DeliveryStateV1> {
  readonly calls: string[] = [];
  refusePublication = false;

  constructor(
    public current: DeliveryRevisionedRecord<DeliveryStateV1> | null = null,
    private readonly events: string[] = [],
  ) {}

  async read(planId: string) {
    return this.current === null || this.current.value.planId === planId
      ? { status: "ok" as const, value: this.current }
      : { status: "ok" as const, value: null };
  }

  async publish(
    planId: string,
    value: DeliveryStateV1,
    expectedRevision: number,
  ) {
    this.calls.push("publish-state");
    this.events.push("publish-state");
    if (this.refusePublication) {
      return { status: "refused" as const, reason: "version-conflict" as const };
    }
    if (value.planId !== planId) {
      return { status: "refused" as const, reason: "identity-mismatch" as const };
    }
    if (this.current !== null && canonicalize(this.current.value) === canonicalize(value)) {
      return { status: "ok" as const, value: this.current };
    }
    if ((this.current?.revision ?? 0) !== expectedRevision) {
      return { status: "refused" as const, reason: "version-conflict" as const };
    }
    this.current = { revision: expectedRevision + 1, value };
    return { status: "ok" as const, value: this.current };
  }

  async remove(planId: string, expectedRevision: number) {
    if (this.current === null) return { status: "ok" as const, value: { removed: false } };
    if (this.current.value.planId !== planId || this.current.revision !== expectedRevision) {
      return { status: "refused" as const, reason: "version-conflict" as const };
    }
    this.current = null;
    return { status: "ok" as const, value: { removed: true } };
  }

  async resolveMember() {
    return { status: "ok" as const, value: null };
  }
}

class MemoryRenderer implements DeliveryTaskListRenderer {
  readonly calls: string[] = [];
  fail = false;

  constructor(private readonly events: string[] = []) {}

  async render() {
    this.calls.push("render");
    this.events.push("render");
    return this.fail
      ? { status: "refused" as const, reason: "task-list-unreadable" as const }
      : { status: "rendered" as const, content: "rendered" };
  }
}

function composer(
  authoringStore: MemoryAuthoringStore,
  planStore: MemoryPlanStore,
  renderer: MemoryRenderer,
  stateStore = new MemoryStateStore(),
) {
  return new DeliveryPlanComposer({
    authoringStore,
    planStore,
    stateStore,
    renderer,
    transitionSource: { enumerate: async () => ({ status: "ok", value: [] }) },
  });
}

function input(value: {
  readonly record: DeliveryAuthoringRecord;
  readonly projection: DeliveryCompositionProjection;
  readonly taskInventory: ReturnType<typeof fixture>["taskInventory"];
  readonly designInventory: ReturnType<typeof fixture>["designInventory"];
} = fixture()) {
  return {
    record: value.record,
    currentWorkUnitId: "delivery-plan-record",
    authority: { status: "established", ref: "refs/heads/main" } as const,
    projection: value.projection,
    taskInventory: value.taskInventory,
    designInventory: value.designInventory,
    landedDeliverableIds: [],
  };
}

function amendedFixture(
  current: DeliveryPlanV1,
  memberPatch: Partial<DeliveryCompositionProjection["authoring"]["members"][number]>,
) {
  const value = fixture(current.planDigest as CanonicalDigest, current.members.length === 1 ? 1 : 2);
  const slots = DeliveryAuthoringSlotsV1Schema.parse({
    ...value.slots,
    members: value.slots.members.map((member) => ({ ...member, ...memberPatch })),
  });
  const projection: DeliveryCompositionProjection = {
    ...value.projection,
    authoring: {
      ...value.projection.authoring,
      members: value.projection.authoring.members.map((member) => ({ ...member, ...memberPatch })),
    },
  };
  return {
    ...value,
    slots,
    projection,
    record: {
      snapshot: value.record.snapshot,
      markdown: renderDeliveryAuthoringMap(value.record.snapshot, slots),
    },
  };
}

function boundState(plan: DeliveryPlanV1): DeliveryRevisionedRecord<DeliveryStateV1> {
  const bound = constructInitialDeliveryState(plan, {
    kind: "pushed-ref",
    deliverableId: plan.members[0]!.deliverableId,
    ref: "refs/heads/member-only",
    coordinates: { base: "a".repeat(40), head: "b".repeat(40), tree: "c".repeat(40) },
  });
  if (bound.status !== "constructed") throw new Error("fixture state must bind");
  return { revision: 1, value: bound.state };
}

describe("delivery plan publication orchestration", () => {
  it("records the candidate, publishes, renders, and cleans Markdown before JSON", async () => {
    const value = fixture();
    const events: string[] = [];
    const authoring = new MemoryAuthoringStore(value.record, events);
    const plans = new MemoryPlanStore(null, events);
    const renderer = new MemoryRenderer(events);

    await expect(composer(authoring, plans, renderer).compose(input(value)))
      .resolves.toMatchObject({ status: "composed", advisories: [] });
    expect(events).toEqual(["candidate", "publish", "render", "delete-markdown", "delete-snapshot"]);
    expect(authoring.record).toBeNull();
  });

  it("refuses a projection derived from a different authoring boundary", async () => {
    const value = fixture();
    const mismatchedProjection = {
      ...value.projection,
      boundary: DeliveryAuthoringSlotsV1Schema.parse({
        ...value.slots,
        boundary: {
          kind: "explicit",
          segments: [{ chunkKey: "only", sourceIds: ["step-1"] }],
        },
      }).boundary,
    };

    await expect(composer(
      new MemoryAuthoringStore(value.record),
      new MemoryPlanStore(),
      new MemoryRenderer(),
    ).compose({
      ...input(value),
      projection: mismatchedProjection,
    })).resolves.toEqual({ status: "refused", reason: "authoring-projection-invalid" });
  });

  it("composes a rename-resolved map under its original authored identity", async () => {
    const value = fixture();

    await expect(composer(
      new MemoryAuthoringStore(value.record),
      new MemoryPlanStore(),
      new MemoryRenderer(),
    ).compose({
      ...input(value),
      currentWorkUnitId: "renamed-delivery-plan-record",
    })).resolves.toMatchObject({
      status: "composed",
      plan: { workUnitId: "delivery-plan-record" },
    });
  });

  it("returns source advisories after successful publication", async () => {
    const value = fixture();
    const advisory = {
      kind: "unresolved-task-reference" as const,
      commit: "0123456789abcdef0123456789abcdef01234567",
      taskId: "9.9.a",
    };
    const authoring = new MemoryAuthoringStore(value.record);

    await expect(composer(authoring, new MemoryPlanStore(), new MemoryRenderer()).compose({
      ...input(value),
      projection: { ...value.projection, sourceAdvisories: [advisory] },
    })).resolves.toMatchObject({ status: "composed", advisories: [advisory] });
  });

  it("refuses a second plan for the unit but permits a successor under the same plan id", async () => {
    const firstValue = fixture();
    const firstAuthoring = new MemoryAuthoringStore(firstValue.record);
    const plans = new MemoryPlanStore();
    const renderer = new MemoryRenderer();
    await composer(firstAuthoring, plans, renderer).compose(input(firstValue));
    const first = plans.current;
    if (first === null) throw new Error("expected first plan");

    const other = { ...first, planId: OTHER_PLAN_ID as typeof first.planId };
    const conflictingPlans = new MemoryPlanStore(other);
    const conflictValue = fixture();
    await expect(composer(
      new MemoryAuthoringStore(conflictValue.record),
      conflictingPlans,
      new MemoryRenderer(),
    ).compose(input(conflictValue))).resolves.toEqual({
      status: "refused",
      reason: "plan-already-exists",
    });

    const successorValue = fixture(first.planDigest as CanonicalDigest);
    const successorAuthoring = new MemoryAuthoringStore(successorValue.record);
    await expect(composer(successorAuthoring, plans, new MemoryRenderer()).compose(input(successorValue)))
      .resolves.toMatchObject({
        status: "composed",
        plan: { planId: PLAN_ID, planRevision: 2, previousPlanDigest: first.planDigest },
      });
  });

  it("returns exact replacement members without mutating a bound authoring pair", async () => {
    const firstValue = fixture();
    const plans = new MemoryPlanStore();
    await composer(
      new MemoryAuthoringStore(firstValue.record),
      plans,
      new MemoryRenderer(),
    ).compose(input(firstValue));
    const first = plans.current;
    if (first === null) throw new Error("expected first plan");

    const successor = amendedFixture(first, { contract: "Replace the published contract" });
    const authoring = new MemoryAuthoringStore(successor.record);
    const states = new MemoryStateStore(boundState(first));
    const renderer = new MemoryRenderer();
    await expect(composer(authoring, plans, renderer, states).compose(input(successor))).resolves.toEqual({
      status: "replacement-required",
      affectedDeliverableIds: [first.members[0]!.deliverableId],
    });
    expect(authoring.record).toEqual(successor.record);
    expect(authoring.calls).toEqual([]);
    expect(renderer.calls).toEqual([]);
    expect(plans.current).toEqual(first);
  });

  it("surfaces a closed refusal without mutation when landed intent changes", async () => {
    const firstValue = fixture();
    const plans = new MemoryPlanStore();
    await composer(
      new MemoryAuthoringStore(firstValue.record),
      plans,
      new MemoryRenderer(),
    ).compose(input(firstValue));
    const first = plans.current;
    if (first === null) throw new Error("expected first plan");

    const successor = amendedFixture(first, { contract: "Rewrite landed intent" });
    const authoring = new MemoryAuthoringStore(successor.record);
    const states = new MemoryStateStore(boundState(first));
    const renderer = new MemoryRenderer();
    await expect(composer(authoring, plans, renderer, states).compose({
      ...input(successor),
      landedDeliverableIds: [first.members[0]!.deliverableId as CanonicalDigest],
    })).resolves.toEqual({ status: "refused", reason: "landed-member-changed" });
    expect(authoring.calls).toEqual([]);
    expect(renderer.calls).toEqual([]);
    expect(plans.current).toEqual(first);
  });

  it("publishes an accepted bound successor before rebinding state and rendering", async () => {
    const firstValue = fixture();
    const plans = new MemoryPlanStore();
    await composer(
      new MemoryAuthoringStore(firstValue.record),
      plans,
      new MemoryRenderer(),
    ).compose(input(firstValue));
    const first = plans.current;
    if (first === null) throw new Error("expected first plan");

    const successor = amendedFixture(first, {});
    const events: string[] = [];
    const authoring = new MemoryAuthoringStore(successor.record, events);
    const states = new MemoryStateStore(boundState(first), events);
    const renderer = new MemoryRenderer(events);
    const boundPlans = new MemoryPlanStore(first, events);
    await expect(composer(authoring, boundPlans, renderer, states).compose(input(successor)))
      .resolves.toMatchObject({ status: "composed", plan: { planRevision: 2 } });
    expect(events).toEqual([
      "candidate",
      "publish",
      "publish-state",
      "render",
      "delete-markdown",
      "delete-snapshot",
    ]);
    expect(states.current).toMatchObject({
      revision: 2,
      value: {
        boundPlan: { planRevision: 2, planDigest: boundPlans.current?.planDigest },
        members: [{ ref: "refs/heads/member-only" }],
      },
    });
  });

  it("does not publish a successor while selected-member verification is pending", async () => {
    const firstValue = fixture(null, 2);
    const plans = new MemoryPlanStore();
    await composer(
      new MemoryAuthoringStore(firstValue.record),
      plans,
      new MemoryRenderer(),
    ).compose(input(firstValue));
    const first = plans.current;
    if (first === null) throw new Error("expected first plan");

    const successor = amendedFixture(first, {});
    const state = boundState(first);
    const states = new MemoryStateStore({
      ...state,
      value: {
        ...state.value,
        pendingReviewFixVerification: {
          selectedDeliverableId: first.members[0]!.deliverableId,
          memberDeliverableIds: [first.members[0]!.deliverableId],
        },
      },
    });
    const renderer = new MemoryRenderer();
    const boundPlans = new MemoryPlanStore(first);

    await expect(composer(
      new MemoryAuthoringStore(successor.record),
      boundPlans,
      renderer,
      states,
    ).compose(input(successor))).resolves.toEqual({
      status: "refused",
      reason: "pending-review-fix-verification",
    });
    expect(boundPlans.calls).toEqual([]);
    expect(states.calls).toEqual([]);
    expect(renderer.calls).toEqual([]);
  });

  it("requires fresh landed facts before classifying a bound successor", async () => {
    const firstValue = fixture();
    const plans = new MemoryPlanStore();
    await composer(
      new MemoryAuthoringStore(firstValue.record),
      plans,
      new MemoryRenderer(),
    ).compose(input(firstValue));
    const first = plans.current;
    if (first === null) throw new Error("expected first plan");
    const successor = amendedFixture(first, {});

    await expect(composer(
      new MemoryAuthoringStore(successor.record),
      plans,
      new MemoryRenderer(),
      new MemoryStateStore(boundState(first)),
    ).compose({ ...input(successor), landedDeliverableIds: null }))
      .resolves.toEqual({ status: "refused", reason: "landed-facts-required" });
  });

  it("leaves the task list untouched and the pair retryable on publication refusal", async () => {
    const value = fixture();
    const authoring = new MemoryAuthoringStore(value.record);
    const plans = new MemoryPlanStore();
    plans.refusePublication = true;
    const renderer = new MemoryRenderer();
    await expect(composer(authoring, plans, renderer).compose(input(value)))
      .resolves.toEqual({ status: "refused", reason: "version-conflict" });
    expect(renderer.calls).toEqual([]);
    expect(authoring.record?.markdown).not.toBeNull();
    expect(authoring.record?.snapshot.candidatePlanDigest).not.toBeNull();

    plans.refusePublication = false;
    if (authoring.record === null) throw new Error("expected retryable candidate receipt");
    await expect(composer(authoring, plans, renderer).compose({
      ...input(value),
      record: authoring.record,
    })).resolves.toMatchObject({ status: "composed", plan: { planRevision: 1 } });
  });

  it("blocks the publication gap and retries state rebind from the pinned revision", async () => {
    const firstValue = fixture();
    const plans = new MemoryPlanStore();
    await composer(
      new MemoryAuthoringStore(firstValue.record),
      plans,
      new MemoryRenderer(),
    ).compose(input(firstValue));
    const first = plans.current;
    if (first === null) throw new Error("expected first plan");
    const successor = amendedFixture(first, {});
    const authoring = new MemoryAuthoringStore(successor.record);
    const states = new MemoryStateStore(boundState(first));
    states.refusePublication = true;

    await expect(composer(authoring, plans, new MemoryRenderer(), states).compose(input(successor)))
      .resolves.toEqual({ status: "refused", reason: "version-conflict" });
    const published = plans.current;
    if (published === null || states.current === null) throw new Error("expected publication gap");
    expect(published.planRevision).toBe(2);
    expect(validateDeliveryStateAgainstPlan(states.current.value, published))
      .toEqual({ status: "refused", reason: "bound-plan-mismatch" });

    states.refusePublication = false;
    if (authoring.record === null) throw new Error("expected retryable candidate receipt");
    await expect(composer(authoring, plans, new MemoryRenderer(), states).compose({
      ...input(successor),
      record: authoring.record,
    })).resolves.toMatchObject({ status: "composed", plan: { planRevision: 2 } });
    expect(states.current.revision).toBe(2);
  });

  it("refuses when the receipt-pinned state revision changes before rebind", async () => {
    const firstValue = fixture();
    const plans = new MemoryPlanStore();
    await composer(
      new MemoryAuthoringStore(firstValue.record),
      plans,
      new MemoryRenderer(),
    ).compose(input(firstValue));
    const first = plans.current;
    if (first === null) throw new Error("expected first plan");
    const successor = amendedFixture(first, {});
    const authoring = new MemoryAuthoringStore(successor.record);
    const states = new MemoryStateStore(boundState(first));
    plans.refusePublication = true;
    await expect(composer(authoring, plans, new MemoryRenderer(), states).compose(input(successor)))
      .resolves.toEqual({ status: "refused", reason: "version-conflict" });
    if (states.current === null) throw new Error("expected bound state");
    states.current = {
      revision: states.current.revision + 1,
      value: {
        ...states.current.value,
        target: { ref: "refs/heads/changed", coordinates: null },
      },
    };

    plans.refusePublication = false;
    if (authoring.record === null) throw new Error("expected candidate receipt");
    await expect(composer(authoring, plans, new MemoryRenderer(), states).compose({
      ...input(successor),
      record: authoring.record,
    })).resolves.toEqual({ status: "refused", reason: "version-conflict" });
    expect(authoring.record.markdown).not.toBeNull();
  });

  it("retries from an already rebound state after rendering is interrupted", async () => {
    const firstValue = fixture();
    const plans = new MemoryPlanStore();
    await composer(
      new MemoryAuthoringStore(firstValue.record),
      plans,
      new MemoryRenderer(),
    ).compose(input(firstValue));
    const first = plans.current;
    if (first === null) throw new Error("expected first plan");
    const successor = amendedFixture(first, {});
    const authoring = new MemoryAuthoringStore(successor.record);
    const states = new MemoryStateStore(boundState(first));
    const renderer = new MemoryRenderer();
    renderer.fail = true;

    await expect(composer(authoring, plans, renderer, states).compose(input(successor)))
      .resolves.toEqual({ status: "refused", reason: "task-list-unreadable" });
    expect(states.current?.revision).toBe(2);
    renderer.fail = false;
    if (authoring.record === null) throw new Error("expected retryable candidate receipt");
    await expect(composer(authoring, plans, renderer, states).compose({
      ...input(successor),
      record: authoring.record,
    })).resolves.toMatchObject({ status: "composed", plan: { planRevision: 2 } });
    expect(states.current?.revision).toBe(2);
  });

  it("retries cleanup after rendering without publishing another state revision", async () => {
    const value = fixture();
    const authoring = new MemoryAuthoringStore(value.record);
    authoring.failMarkdownDelete = true;
    const plans = new MemoryPlanStore();
    const renderer = new MemoryRenderer();

    await expect(composer(authoring, plans, renderer).compose(input(value)))
      .resolves.toEqual({ status: "refused", reason: "version-conflict" });
    expect(renderer.calls).toEqual(["render"]);
    authoring.failMarkdownDelete = false;
    if (authoring.record === null) throw new Error("expected retryable candidate receipt");
    await expect(composer(authoring, plans, renderer).compose({
      ...input(value),
      record: authoring.record,
    })).resolves.toMatchObject({ status: "composed" });
    expect(renderer.calls).toEqual(["render", "render"]);
  });

  it("leaves a complete terminal state when interruption follows snapshot deletion", async () => {
    const value = fixture();
    const authoring = new MemoryAuthoringStore(value.record);
    authoring.failSnapshotDeleteAfterMutation = true;
    const plans = new MemoryPlanStore();

    await expect(composer(authoring, plans, new MemoryRenderer()).compose(input(value)))
      .resolves.toEqual({ status: "refused", reason: "version-conflict" });
    expect(authoring.record).toBeNull();
    expect(plans.current).toMatchObject({ planRevision: 1 });
  });

  it("refuses a stale expected current digest before recording a candidate", async () => {
    const firstValue = fixture();
    const plans = new MemoryPlanStore();
    await composer(
      new MemoryAuthoringStore(firstValue.record),
      plans,
      new MemoryRenderer(),
    ).compose(input(firstValue));
    const staleValue = fixture(canonicalDigest({ stale: true }));
    const staleAuthoring = new MemoryAuthoringStore(staleValue.record);
    await expect(composer(staleAuthoring, plans, new MemoryRenderer()).compose(input(staleValue)))
      .resolves.toEqual({ status: "refused", reason: "version-conflict" });
    expect(staleAuthoring.calls).toEqual([]);
  });

  it("retries the same published plan after render failure", async () => {
    const value = fixture();
    const authoring = new MemoryAuthoringStore(value.record);
    const plans = new MemoryPlanStore();
    const renderer = new MemoryRenderer();
    renderer.fail = true;
    await expect(composer(authoring, plans, renderer).compose(input(value)))
      .resolves.toEqual({ status: "refused", reason: "task-list-unreadable" });
    expect(authoring.record?.markdown).not.toBeNull();

    renderer.fail = false;
    if (authoring.record === null) throw new Error("expected retryable authoring state");
    await expect(composer(authoring, plans, renderer).compose({
      ...input(value),
      record: authoring.record,
    })).resolves.toMatchObject({ status: "composed", plan: { planRevision: 1 } });
    expect(plans.calls).toEqual(["publish", "publish"]);
  });

  it("refuses authoring edits after the candidate has been published", async () => {
    const value = fixture();
    const authoring = new MemoryAuthoringStore(value.record);
    const plans = new MemoryPlanStore();
    const renderer = new MemoryRenderer();
    renderer.fail = true;
    await expect(composer(authoring, plans, renderer).compose(input(value)))
      .resolves.toEqual({ status: "refused", reason: "task-list-unreadable" });
    if (authoring.record === null) throw new Error("expected retryable authoring state");

    const editedTitle = "Edited member";
    const editedSlots = DeliveryAuthoringSlotsV1Schema.parse({
      ...value.slots,
      members: value.slots.members.map((member) => ({ ...member, title: editedTitle })),
    });
    const editedProjection: DeliveryCompositionProjection = {
      ...value.projection,
      authoring: {
        ...value.projection.authoring,
        members: value.projection.authoring.members.map((member) => ({
          ...member,
          title: editedTitle,
        })),
      },
    };
    authoring.record = {
      ...authoring.record,
      markdown: renderDeliveryAuthoringMap(authoring.record.snapshot, editedSlots),
    };
    renderer.fail = false;

    await expect(composer(authoring, plans, renderer).compose({
      ...input(value),
      record: authoring.record,
      projection: editedProjection,
    })).resolves.toEqual({ status: "refused", reason: "authoring-state-corrupt" });
    expect(authoring.record.markdown).not.toBeNull();
    expect(plans.current?.members[0]?.title).toBe("Only member");
  });

  it("leaves a matching JSON receipt when final cleanup fails and completes it on retry", async () => {
    const value = fixture();
    const advisory = {
      kind: "unresolved-task-reference" as const,
      commit: "0123456789abcdef0123456789abcdef01234567",
      taskId: "9.9.a",
    };
    value.projection = { ...value.projection, sourceAdvisories: [advisory] };
    const authoring = new MemoryAuthoringStore(value.record);
    authoring.failSnapshotDelete = true;
    const plans = new MemoryPlanStore();
    const renderer = new MemoryRenderer();
    await expect(composer(authoring, plans, renderer).compose(input(value)))
      .resolves.toEqual({ status: "refused", reason: "version-conflict" });
    expect(authoring.record?.markdown).toBeNull();
    expect(authoring.record?.snapshot.candidatePlanDigest).toBe(plans.current?.planDigest);

    authoring.failSnapshotDelete = false;
    if (authoring.record === null) throw new Error("expected cleanup receipt");
    await expect(composer(authoring, plans, renderer).recover({
      record: authoring.record,
      currentWorkUnitId: "delivery-plan-record",
      authority: { status: "established", ref: "refs/heads/main" },
      sourceAdvisories: [advisory],
    })).resolves.toMatchObject({ status: "composed", advisories: [advisory] });
    expect(authoring.record).toBeNull();
  });
});
