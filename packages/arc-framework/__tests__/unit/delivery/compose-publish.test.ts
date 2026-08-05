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
import { createDeliveryAuthoringSnapshot } from "../../../src/lib/delivery/authoring-schema.js";
import type {
  DeliveryAuthoringRecord,
  DeliveryAuthoringStoreResult,
} from "../../../src/lib/delivery/authoring-store.js";
import type { DeliveryPlanStore } from "../../../src/lib/delivery/ports.js";
import type { DeliveryTaskListRenderer } from "../../../src/lib/delivery/task-list-render.js";
import {
  canonicalDigest,
  canonicalize,
  type CanonicalDigest,
} from "../../../src/lib/kernel/index.js";
import {
  DeliveryPlanAuthoringInputV1Schema,
  type DeliveryPlanV1,
} from "../../../src/lib/delivery/schema.js";

const PLAN_ID = "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1";
const OTHER_PLAN_ID = "9cd88752-ef99-4e21-a41f-234bc98f35e0";

function fixture(expectedCurrentPlanDigest: CanonicalDigest | null = null) {
  const taskDigest = canonicalDigest({ goal: "Implement" });
  const taskInventory = {
    inventoryDigest: canonicalDigest([{ taskId: "1.1", semanticDigest: taskDigest }]),
    implementation: [{ taskId: "1.1", semanticDigest: taskDigest }],
    verificationTaskId: "2.1",
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
      facts: { phaseGroups: [{ phaseId: "1", taskIds: ["1.1"] }] },
      identitySequence: ["phase:1", "task:1.1"],
    },
  });
  const slots = {
    projection: { kind: "wu-integration-target" as const },
    boundary: { kind: "phase-aligned" as const },
    members: [{
      status: "live" as const,
      chunkKey: "only",
      title: "Only member",
      contract: "Publish the contract",
      designElementIds: [],
      mainlineLandability: "integration-only" as const,
    }],
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
      tasks: { implementation: [{ taskId: "1.1" }], verificationTaskId: "2.1" },
      entry: "from-tasks",
      projection: slots.projection,
      members: [{
        ...authoredMember,
        taskIds: ["1.1"],
      }],
      seams: [],
    }),
    boundary: slots.boundary,
    contributionStepIds: ["step-1"],
    memberContributionSteps: [{ chunkKey: "only", contributionStepIds: ["step-1"] }],
  };
  return { record, projection, slots, taskInventory, designInventory };
}

class MemoryAuthoringStore implements DeliveryCompositionAuthoringStore {
  readonly calls: string[] = [];
  failSnapshotDelete = false;

  constructor(public record: DeliveryAuthoringRecord | null) {}

  async recordCandidate(
    mapId: string,
    expected: DeliveryAuthoringRecord["snapshot"],
    candidatePlanDigest: CanonicalDigest,
    candidateProjectionDigest: CanonicalDigest,
  ): Promise<DeliveryAuthoringStoreResult<DeliveryAuthoringRecord["snapshot"]>> {
    this.calls.push("candidate");
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
      },
    };
    return { status: "ok", value: this.record.snapshot };
  }

  async deleteMarkdown(): Promise<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>> {
    this.calls.push("delete-markdown");
    if (this.record === null) return { status: "ok", value: { removed: false } };
    const removed = this.record.markdown !== null;
    this.record = { ...this.record, markdown: null };
    return { status: "ok", value: { removed } };
  }

  async deleteSnapshot(): Promise<DeliveryAuthoringStoreResult<{ readonly removed: boolean }>> {
    this.calls.push("delete-snapshot");
    if (this.failSnapshotDelete) return { status: "refused", reason: "version-conflict" };
    const removed = this.record !== null;
    this.record = null;
    return { status: "ok", value: { removed } };
  }
}

class MemoryPlanStore implements DeliveryPlanStore<DeliveryPlanV1> {
  readonly calls: string[] = [];
  refusePublication = false;

  constructor(public current: DeliveryPlanV1 | null = null) {}

  async readCurrent(planId: string) {
    return this.current === null || this.current.planId === planId
      ? { status: "ok" as const, value: this.current }
      : { status: "ok" as const, value: null };
  }

  async enumerateCurrent() {
    return { status: "ok" as const, value: this.current === null ? [] : [this.current] };
  }

  async publishCurrent(
    _planId: string,
    plan: DeliveryPlanV1,
    expectedCurrentDigest: CanonicalDigest | null,
  ) {
    this.calls.push("publish");
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
}

class MemoryRenderer implements DeliveryTaskListRenderer {
  readonly calls: string[] = [];
  fail = false;

  async render() {
    this.calls.push("render");
    return this.fail
      ? { status: "refused" as const, reason: "task-list-unreadable" as const }
      : { status: "rendered" as const, content: "rendered" };
  }
}

function composer(
  authoringStore: MemoryAuthoringStore,
  planStore: MemoryPlanStore,
  renderer: MemoryRenderer,
) {
  return new DeliveryPlanComposer({
    authoringStore,
    planStore,
    renderer,
    transitionSource: { enumerate: async () => ({ status: "ok", value: [] }) },
  });
}

function input(value = fixture()) {
  return {
    record: value.record,
    currentWorkUnitId: "delivery-plan-record",
    authority: { status: "established", ref: "refs/heads/main" } as const,
    projection: value.projection,
    taskInventory: value.taskInventory,
    designInventory: value.designInventory,
  };
}

describe("delivery plan publication orchestration", () => {
  it("records the candidate, publishes, renders, and cleans Markdown before JSON", async () => {
    const value = fixture();
    const authoring = new MemoryAuthoringStore(value.record);
    const plans = new MemoryPlanStore();
    const renderer = new MemoryRenderer();

    await expect(composer(authoring, plans, renderer).compose(input(value)))
      .resolves.toMatchObject({ status: "composed", advisories: [] });
    expect([...authoring.calls.slice(0, 1), ...plans.calls, ...renderer.calls, ...authoring.calls.slice(1)])
      .toEqual(["candidate", "publish", "render", "delete-markdown", "delete-snapshot"]);
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
    expect(plans.calls).toEqual(["publish"]);
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
    await expect(composer(authoring, plans, renderer).compose({
      ...input(value),
      record: authoring.record,
    })).resolves.toMatchObject({ status: "composed", advisories: [advisory] });
    expect(authoring.record).toBeNull();
  });
});
