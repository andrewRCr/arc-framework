import { describe, expect, it, vi } from "vitest";

import {
  inspectDeliveryCandidateRenewal,
  inspectDeliveryEntry,
  inspectDeliveryPlanLocus,
  inspectDeliveryReopen,
  selectOutstandingNonTerminalDeliveryMember,
} from "../../../src/lib/delivery/entry-inspection.js";
import {
  DELIVERY_PLAN_START_SENTINEL,
  renderDeliveryPlanSection,
} from "../../../src/lib/delivery/task-list-render.js";
import { reserveDeliveryOperation } from "../../../src/lib/delivery/operation.js";
import { projectDeliveryPublicReviewContinuation } from
  "../../../src/lib/delivery/public-review-continuation.js";
import {
  projectCorrectiveDeliveryReviewBoundary,
  projectPublicationBoundary,
} from "../../../src/scripts/review-gate/policy/integration-boundary-locus.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import {
  deliveryFourMemberStackPlanFixture,
  deliverySingleMemberStackPlanFixture,
  deliveryStackPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const plan = deliveryStackPlanFixture();
const prefix = "# Task List\n\n";
const suffix = "## **Phase 1:** Build\n\n### `[ ]` **1.1 Work**\n";

function dependencies(input: {
  taskList?: string;
  resolvedPlan?: typeof plan | null | "indeterminate";
  authoring?: "match" | "no-match" | "indeterminate";
  authoringPlanDigest?: string | null;
  state?: ReturnType<typeof deliveryStateFixture> | null | "refused";
  stateRevision?: number;
  integrationBoundary?: ReturnType<typeof projectPublicationBoundary> | "refused";
  candidate?: {
    candidateId: string;
    subjectDigest: string;
    verificationResponseCurrent?: boolean;
    terminalCoordinateAdvance?: {
      priorHead: string;
      priorTree: string;
      currentHead: string;
      currentTree: string;
      proof: "subject-equality" | "tree-equality" | "mechanical-reapply";
    };
  } | null | "non-current" | "refused";
  candidateTerminalDelta?: {
    kind: "lifecycle-only";
    lifecyclePaths: readonly string[];
  } | {
    kind: "carries-non-lifecycle";
    lifecyclePaths: readonly string[];
    nonLifecyclePaths: readonly string[];
  };
  candidateTerminalCoordinates?: {
    readonly base: string;
    readonly head: string;
    readonly tree: string;
  };
} = {}) {
  return {
    readTaskList: vi.fn().mockResolvedValue(input.taskList ?? `${prefix}${suffix}`),
    resolvePlan: vi.fn().mockResolvedValue(input.resolvedPlan === "indeterminate"
      ? { status: "indeterminate" }
      : input.resolvedPlan === null || input.resolvedPlan === undefined
        ? { status: "no-match" }
        : { status: "match", plan: input.resolvedPlan }),
    resolveAuthoring: vi.fn().mockResolvedValue(input.authoring === "indeterminate"
      ? { status: "indeterminate" }
      : input.authoring === "match"
        ? {
            status: "match",
            mapId: "map-1",
            candidatePlanDigest: input.authoringPlanDigest ?? null,
          }
        : { status: "no-match" }),
    readState: vi.fn().mockResolvedValue(input.state === "refused"
      ? { status: "refused" }
      : {
          status: "ok",
          value: input.state ?? null,
          revision: input.state ? input.stateRevision ?? 3 : null,
        }),
    readIntegrationBoundary: vi.fn().mockResolvedValue(input.integrationBoundary === "refused"
      ? { status: "refused" }
      : { status: "ok", value: input.integrationBoundary ?? null }),
    readCandidate: vi.fn(async (terminalCoordinates?: {
      readonly base: string;
      readonly head: string;
      readonly tree: string;
    }) => input.candidateTerminalCoordinates !== undefined
      && JSON.stringify(terminalCoordinates) !== JSON.stringify(input.candidateTerminalCoordinates)
      ? { status: "non-current" as const }
      : input.candidate === "refused"
        ? { status: "refused" as const }
        : input.candidate === "non-current"
          ? input.candidateTerminalDelta === undefined
            ? { status: "non-current" as const }
            : { status: "non-current" as const, terminalDelta: input.candidateTerminalDelta }
          : { status: "ok" as const, value: input.candidate ?? null }),
  };
}

function publicState() {
  const state = deliveryStateFixture(plan);
  return {
    ...state,
    members: state.members.map((member, index) => ({
      ...member,
      changeRequest: { providerId: "github", changeRequestId: String(index + 101) },
    })),
  };
}

function publicContinuationFixture() {
  const state = publicState();
  const stateRevision = 7;
  const continuation = projectDeliveryPublicReviewContinuation({ plan, state, stateRevision });
  if (continuation.status !== "projected") throw new Error("fixture continuation must project");
  const sourceCandidateId = `sha256:${"a".repeat(64)}`;
  const candidateId = `sha256:${"b".repeat(64)}`;
  const candidateSubjectDigest = `sha256:${"c".repeat(64)}`;
  const source = projectPublicationBoundary({
    workUnit: plan.workUnitId,
    branch: "feat/delivery-plan-record",
    candidateId: sourceCandidateId,
    candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
    reservation: {
      schemaVersion: 1,
      semanticsVersion: "standard-review-reservation/v1",
      reservationId: `sha256:${"e".repeat(64)}`,
      sources: ["codex-pr"],
      target: {
        kind: "delivery",
        repository: "arc-framework/example",
        workUnitId: plan.workUnitId,
        planId: plan.planId,
      },
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"f".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    },
    changeRequest: null,
  });
  const boundary = projectCorrectiveDeliveryReviewBoundary({
    workUnit: plan.workUnitId,
    candidateId,
    candidateSubjectDigest,
    supersedesCandidateId: sourceCandidateId,
    sourceBoundary: source,
    deliveryContinuation: continuation.continuation,
  });
  if (boundary.locus !== "hosted-review-pending") {
    throw new Error("fixture boundary must resume hosted review");
  }
  return { state, stateRevision, candidateId, candidateSubjectDigest, boundary };
}

function stateWithActiveCorrection() {
  const state = deliveryStateFixture(plan);
  const selected = state.members[0]!;
  const before = {
    target: state.target,
    members: [{
      deliverableId: selected.deliverableId,
      ref: selected.ref,
      changeRequest: selected.changeRequest,
      coordinates: selected.coordinates,
    }],
  };
  const reserved = reserveDeliveryOperation({ revision: 3, value: state }, plan, {
    operationId: "interrupted-entry-correction",
    kind: "rewrite",
    mode: "selected-change",
    affectedDeliverableIds: [selected.deliverableId],
    expectedStateRevision: 3,
    before,
    requested: before,
  });
  if (reserved.status !== "reserved") throw new Error("entry correction fixture must reserve");
  return reserved.state;
}

describe("delivery entry inspection", () => {
  it("classifies absent, provisional, canonical, and malformed loci without parsing plan prose", () => {
    expect(inspectDeliveryPlanLocus(`${prefix}${suffix}`, null)).toEqual({ status: "absent" });
    expect(inspectDeliveryPlanLocus(
      `${prefix}## Delivery Plan\n\nReviewed plan prose.\n\n${suffix}`,
      null,
    )).toEqual({ status: "provisional" });
    expect(inspectDeliveryPlanLocus(`${prefix}${renderDeliveryPlanSection(plan)}${suffix}`, plan))
      .toEqual({ status: "canonical" });
    expect(inspectDeliveryPlanLocus(
      `${prefix}## Delivery Plan\n\nFirst.\n\n## Delivery Plan\n\nSecond.\n\n${suffix}`,
      null,
    )).toEqual({ status: "refused", reason: "delivery-locus-duplicate" });
    expect(inspectDeliveryPlanLocus(
      `${prefix}${DELIVERY_PLAN_START_SENTINEL}\n## Delivery Plan\n\n${suffix}`,
      null,
    )).toEqual({ status: "refused", reason: "delivery-locus-malformed" });
    expect(inspectDeliveryPlanLocus(
      `${prefix}${renderDeliveryPlanSection(plan).replace(
        "<!-- arc:delivery-plan:end -->",
        "Unexpected projection bytes.\n<!-- arc:delivery-plan:end -->",
      )}${suffix}`,
      plan,
    )).toEqual({ status: "refused", reason: "canonical-projection-mismatch" });
  });

  it("routes attended absence and reviewed provisional intent with honest precomposed cost", async () => {
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies())).resolves.toMatchObject({
      status: "authoring-required",
      nextAction: "attend-authoring",
      laterEntryCostText: expect.stringContaining("later entry"),
      recommendedActionText: expect.any(String),
    });

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "confirmed-reviewed",
    }, dependencies({
      taskList: `${prefix}## Delivery Plan\n\nReviewed slices.\n\n${suffix}`,
      authoring: "match",
    }))).resolves.toMatchObject({
      status: "canonicalize-provisional",
      nextAction: "canonicalize-provisional",
      authoringMapId: "map-1",
    });
  });

  it("distinguishes canonical unbound and coherent bound routes", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies({ taskList, resolvedPlan: plan }))).resolves.toMatchObject({
      status: "validate-canonical",
      planId: plan.planId,
      planDigest: plan.planDigest,
    });

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies({ taskList, resolvedPlan: plan, state: deliveryStateFixture(plan) })))
      .resolves.toMatchObject({ status: "resume-bound", stateRevision: 3 });
  });

  it("selects integration from authoritative plan presence before delivery state exists", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({ taskList, resolvedPlan: plan }))).resolves.toMatchObject({
      status: "validate-canonical",
      planId: plan.planId,
      planDigest: plan.planDigest,
    });

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({ taskList, resolvedPlan: plan, state: deliveryStateFixture(plan) })))
      .resolves.toMatchObject({ status: "resume-bound", stateRevision: 3 });
  });

  it("classifies reopen from exact absent, unbound, bound, and refused composition", async () => {
    await expect(inspectDeliveryReopen(plan.workUnitId, dependencies())).resolves.toMatchObject({
      status: "reopen-permitted",
      composition: "absent",
      nextAction: "continue-reopen",
    });

    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryReopen(plan.workUnitId, dependencies({
      taskList,
      resolvedPlan: plan,
      authoring: "match",
      authoringPlanDigest: plan.planDigest,
    }))).resolves.toMatchObject({
      status: "reopen-permitted",
      composition: "unbound",
      planId: plan.planId,
      nextAction: "continue-reopen",
    });

    await expect(inspectDeliveryReopen(plan.workUnitId, dependencies({
      taskList,
      resolvedPlan: plan,
      state: deliveryStateFixture(plan),
      stateRevision: 7,
    }))).resolves.toMatchObject({
      status: "reopen-bound",
      planId: plan.planId,
      stateRevision: 7,
      nextAction: "stop",
      recommendedActionText: expect.stringContaining("member requests"),
    });

    const incoherent = deliveryStateFixture(plan);
    incoherent.boundPlan.planDigest = `sha256:${"0".repeat(64)}`;
    await expect(inspectDeliveryReopen(plan.workUnitId, dependencies({
      taskList,
      resolvedPlan: plan,
      state: incoherent,
    }))).resolves.toMatchObject({ status: "refused", reason: "state-incoherent" });
    await expect(inspectDeliveryReopen(plan.workUnitId, dependencies({
      resolvedPlan: "indeterminate",
    }))).resolves.toMatchObject({ status: "refused", reason: "evidence-unavailable" });
  });

  it("selects private candidate preparation only when pre-publication has a canonical plan", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "prepublication",
    }, dependencies({ taskList, resolvedPlan: plan }))).resolves.toMatchObject({
      status: "validate-canonical",
      nextAction: "validate-eligibility",
      planId: plan.planId,
      planDigest: plan.planDigest,
    });

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "prepublication",
    }, dependencies())).resolves.toMatchObject({
      status: "not-applicable",
      nextAction: "continue-work-unit",
      recommendedActionText: expect.stringContaining("singleton pre-publication"),
    });
  });

  it("consumes an exact pending publication action before bound position routing", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    const boundary = projectPublicationBoundary({
      workUnit: plan.workUnitId,
      branch: "feat/delivery-plan-record",
      candidateId: `sha256:${"a".repeat(64)}`,
      candidateSubjectDigest: `sha256:${"b".repeat(64)}`,
      reservation: null,
      changeRequest: null,
    });
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      state: deliveryStateFixture(plan),
      integrationBoundary: boundary,
    }))).resolves.toMatchObject({
      status: "continue-publication",
      nextAction: "continue-publication",
      planId: plan.planId,
      stateRevision: 3,
      publicationAction: boundary.nextAction,
    });
  });

  it("consumes an exact corrective hosted-member continuation before publication or position routing", async () => {
    const state = publicState();
    const stateRevision = 7;
    const continuation = projectDeliveryPublicReviewContinuation({ plan, state, stateRevision });
    if (continuation.status !== "projected") throw new Error("fixture continuation must project");
    const sourceCandidateId = `sha256:${"a".repeat(64)}`;
    const candidateId = `sha256:${"b".repeat(64)}`;
    const candidateSubjectDigest = `sha256:${"c".repeat(64)}`;
    const source = projectPublicationBoundary({
      workUnit: plan.workUnitId,
      branch: "feat/delivery-plan-record",
      candidateId: sourceCandidateId,
      candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
      reservation: {
        schemaVersion: 1,
        semanticsVersion: "standard-review-reservation/v1",
        reservationId: `sha256:${"e".repeat(64)}`,
        sources: ["codex-pr"],
        target: {
          kind: "delivery",
          repository: "arc-framework/example",
          workUnitId: plan.workUnitId,
          planId: plan.planId,
        },
        obligation: {
          obligation: "required",
          reasons: ["sensitive-change-set"],
          rubricVersion: "standard-review/v1",
          rubricDigest: `sha256:${"f".repeat(64)}`,
          retrigger: "full-final",
          count: 1,
        },
      },
      changeRequest: null,
    });
    const boundary = projectCorrectiveDeliveryReviewBoundary({
      workUnit: plan.workUnitId,
      candidateId,
      candidateSubjectDigest,
      supersedesCandidateId: sourceCandidateId,
      sourceBoundary: source,
      deliveryContinuation: continuation.continuation,
    });

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`,
      resolvedPlan: plan,
      state,
      stateRevision,
      integrationBoundary: boundary,
      candidate: { candidateId, subjectDigest: candidateSubjectDigest },
    }))).resolves.toMatchObject({
      status: "continue-hosted-review",
      nextAction: "continue-hosted-review",
      planId: plan.planId,
      stateRevision,
      hostedReviewAction: boundary.nextAction,
    });
  });

  it("keeps an ordinary hosted delivery without a corrective binding on its established route", async () => {
    const fixture = publicContinuationFixture();
    const { deliveryContinuation: omitted, ...ordinaryBoundary } = fixture.boundary;
    expect(omitted).toBeDefined();

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`,
      resolvedPlan: plan,
      state: fixture.state,
      stateRevision: fixture.stateRevision,
      integrationBoundary: ordinaryBoundary,
    }))).resolves.toMatchObject({
      status: "resume-bound",
      nextAction: "read-position-and-reconcile",
    });
  });

  it("recovers Candidate renewal after scoped verification acknowledgment clears delivery state", async () => {
    const fixture = publicContinuationFixture();
    const { deliveryContinuation: omitted, ...acknowledgedBoundary } = fixture.boundary;
    expect(omitted).toBeDefined();

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`,
      resolvedPlan: plan,
      state: fixture.state,
      stateRevision: fixture.stateRevision + 1,
      integrationBoundary: acknowledgedBoundary,
      candidate: {
        candidateId: fixture.candidateId,
        subjectDigest: `sha256:${"1".repeat(64)}`,
        verificationResponseCurrent: true,
      },
    }))).resolves.toMatchObject({
      status: "candidate-renewal-required",
      nextAction: "renew-public-continuation",
      planId: plan.planId,
      stateRevision: fixture.stateRevision + 1,
      attestationAction: {
        argv: ["arc", "attest", plan.workUnitId, "--json"],
      },
    });
  });

  it("routes an older exact public continuation to Candidate renewal", async () => {
    const fixture = publicContinuationFixture();

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`,
      resolvedPlan: plan,
      state: fixture.state,
      stateRevision: fixture.stateRevision + 1,
      integrationBoundary: fixture.boundary,
      candidate: {
        candidateId: fixture.candidateId,
        subjectDigest: fixture.candidateSubjectDigest,
      },
    }))).resolves.toMatchObject({
      status: "candidate-renewal-required",
      nextAction: "renew-public-continuation",
      planId: plan.planId,
      stateRevision: fixture.stateRevision + 1,
      attestationAction: {
        argv: ["arc", "attest", plan.workUnitId, "--json"],
      },
    });
  });

  it("preserves hosted review across a proven same-Candidate terminal record advance", async () => {
    const fixture = publicContinuationFixture();
    const priorHead = fixture.state.members.at(-1)!.coordinates!.head;
    const currentHead = "f".repeat(40);
    const advanced = structuredClone(fixture.state);
    advanced.members.at(-1)!.coordinates = {
      ...advanced.members.at(-1)!.coordinates!,
      head: currentHead,
      tree: "e".repeat(40),
    };
    const inspectionDependencies = dependencies({
      taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`,
      resolvedPlan: plan,
      state: advanced,
      stateRevision: fixture.stateRevision + 1,
      integrationBoundary: fixture.boundary,
      candidate: {
        candidateId: fixture.candidateId,
        subjectDigest: fixture.candidateSubjectDigest,
        terminalCoordinateAdvance: {
          priorHead,
          priorTree: fixture.state.members.at(-1)!.coordinates!.tree,
          currentHead,
          currentTree: "e".repeat(40),
          proof: "subject-equality",
        },
      },
      candidateTerminalCoordinates: advanced.members.at(-1)!.coordinates!,
    });

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, inspectionDependencies)).resolves.toMatchObject({
      status: "continue-hosted-review",
      nextAction: "continue-hosted-review",
      planId: plan.planId,
      stateRevision: fixture.stateRevision + 1,
    });
  });

  it("routes a non-current Candidate to verification closeout", async () => {
    const fixture = publicContinuationFixture();

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`,
      resolvedPlan: plan,
      state: fixture.state,
      stateRevision: fixture.stateRevision,
      integrationBoundary: fixture.boundary,
      candidate: "non-current",
    }))).resolves.toMatchObject({
      status: "candidate-verification-required",
      nextAction: "verify-work-unit",
      planId: plan.planId,
      stateRevision: fixture.stateRevision,
    });
  });

  it.each([
    ["different current Candidate", { candidateId: `sha256:${"0".repeat(64)}`, stateRevision: 7 }],
    ["non-forward state revision", { candidateId: `sha256:${"b".repeat(64)}`, stateRevision: 6 }],
  ])("refuses a corrective hosted continuation with %s", async (_name, stale) => {
    const fixture = publicContinuationFixture();

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`,
      resolvedPlan: plan,
      state: fixture.state,
      stateRevision: stale.stateRevision,
      integrationBoundary: fixture.boundary,
      candidate: {
        candidateId: stale.candidateId,
        subjectDigest: fixture.candidateSubjectDigest,
      },
    }))).resolves.toMatchObject({
      status: "refused",
      reason: "public-continuation-mismatch",
    });
  });

  it("prepares corrective attestation only from a canonical public delivery and complete bound state", async () => {
    const state = publicState();
    const stateRevision = 7;
    const sourceCandidateId = `sha256:${"a".repeat(64)}`;
    const source = projectPublicationBoundary({
      workUnit: plan.workUnitId,
      branch: "feat/delivery-plan-record",
      candidateId: sourceCandidateId,
      candidateSubjectDigest: `sha256:${"d".repeat(64)}`,
      reservation: {
        schemaVersion: 1,
        semanticsVersion: "standard-review-reservation/v1",
        reservationId: `sha256:${"e".repeat(64)}`,
        sources: ["codex-pr"],
        target: {
          kind: "delivery",
          repository: "arc-framework/example",
          workUnitId: plan.workUnitId,
          planId: plan.planId,
        },
        obligation: {
          obligation: "required",
          reasons: ["sensitive-change-set"],
          rubricVersion: "standard-review/v1",
          rubricDigest: `sha256:${"f".repeat(64)}`,
          retrigger: "full-final",
          count: 1,
        },
      },
      changeRequest: null,
    });

    await expect(inspectDeliveryCandidateRenewal(
      plan.workUnitId,
      source,
      dependencies({
        taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`,
        resolvedPlan: plan,
        state,
        stateRevision,
      }),
    )).resolves.toEqual({
      status: "ready",
      planId: plan.planId,
      stateRevision,
      deliveryContinuation: expect.objectContaining({
        planId: plan.planId,
        stateRevision,
        memberEvidenceDigest: canonicalDigest(state.members),
      }),
    });
  });

  it("refuses an unreadable pending-publication boundary before bound position routing", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      state: deliveryStateFixture(plan),
      integrationBoundary: "refused",
    }))).resolves.toMatchObject({
      status: "refused",
      reason: "evidence-unavailable",
    });
  });

  it("routes bound execution from the exact open parent task to its owning delivery member", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}`
      + "## **Phase 1:** Build\n\n### `[ ]` **1.1 Work**\n\n"
      + "    - `[ ]` **1.1.R.a Repair the member**\n";
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "execution",
    }, dependencies({ taskList, resolvedPlan: plan, state: deliveryStateFixture(plan) })))
      .resolves.toMatchObject({
        status: "correction-routing-required",
        nextAction: "plan-review-fix",
        planId: plan.planId,
        stateRevision: 3,
        selectedDeliverableId: plan.members[0]?.deliverableId,
        entryMode: "execution",
        derivedFrom: { kind: "open-task", taskId: "1.1", leafTaskId: "1.1.R.a" },
      });
  });

  it("resumes exact pending review-fix verification before correction replanning", async () => {
    const multiPlan = deliveryFourMemberStackPlanFixture();
    const selectedDeliverableId = multiPlan.members[0]!.deliverableId;
    const memberDeliverableIds = [selectedDeliverableId, multiPlan.members[1]!.deliverableId];
    const initialState = deliveryStateFixture(multiPlan);
    const terminal = initialState.members.at(-1)!.coordinates!;
    const state = {
      ...initialState,
      pendingReviewFixVerification: { selectedDeliverableId, memberDeliverableIds },
    } as unknown as ReturnType<typeof deliveryStateFixture>;
    const taskList = `${prefix}${renderDeliveryPlanSection(multiPlan)}`
      + "## **Phase 1:** Build\n\n### `[ ]` **1.1 Work**\n";

    await expect(inspectDeliveryEntry({
      workUnitId: multiPlan.workUnitId,
      entryMode: "execution",
    }, dependencies({ taskList, resolvedPlan: multiPlan, state, stateRevision: 9 })))
      .resolves.toMatchObject({
        status: "review-fix-verification-required",
        nextAction: "verify-review-fix",
        planId: multiPlan.planId,
        stateRevision: 9,
        selectedDeliverableId,
        verification: {
          memberDeliverableIds,
          tier1Required: true,
          target: { head: terminal.head, tree: terminal.tree },
          tier1Reuse: {
            kind: "exact-tree",
            targetTree: terminal.tree,
            requiredResult: "passed",
            coveredInputs: "unchanged",
          },
        },
        acknowledgementInput: {
          planId: multiPlan.planId,
          selectedDeliverableId,
          memberDeliverableIds,
          expectedStateRevision: 9,
          continuationDigest: canonicalDigest(state),
        },
      });
  });

  it("resumes an active correction before planning another bound execution change", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}`
      + "## **Phase 1:** Build\n\n### `[ ]` **1.1 Work**\n";
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "execution",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      state: stateWithActiveCorrection(),
      stateRevision: 4,
    })))
      .resolves.toMatchObject({
        status: "resume-bound",
        nextAction: "read-position-and-reconcile",
        planId: plan.planId,
        stateRevision: 4,
      });
  });

  it("keeps unbound and work-unit-verification execution on the ordinary task route", async () => {
    const implementationTaskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "execution",
    }, dependencies({ taskList: implementationTaskList, resolvedPlan: plan }))).resolves.toMatchObject({
      status: "not-applicable",
      nextAction: "continue-work-unit",
    });

    const verificationTaskList = `${prefix}${renderDeliveryPlanSection(plan)}`
      + "## **Phase 2:** Verification\n\n### `[ ]` **2.1 Verify**\n";
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "execution",
    }, dependencies({
      taskList: verificationTaskList,
      resolvedPlan: plan,
      state: deliveryStateFixture(plan),
    }))).resolves.toMatchObject({
      status: "not-applicable",
      nextAction: "continue-work-unit",
    });
  });

  it("continues singleton integration only from exact authored-evidence absence", async () => {
    const absent = dependencies();
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, absent)).resolves.toMatchObject({
      status: "not-applicable",
      nextAction: "continue-work-unit",
      recommendedActionText: expect.stringContaining("singleton integration"),
    });
    expect(absent.readState).not.toHaveBeenCalled();

    const cases = [
      dependencies({ resolvedPlan: "indeterminate" }),
      dependencies({ authoring: "indeterminate" }),
      dependencies({ authoring: "match" }),
      dependencies({ taskList: `${prefix}## Delivery Plan\n\nUnconfirmed.\n\n${suffix}` }),
      dependencies({ taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}` }),
    ];
    for (const deps of cases) {
      await expect(inspectDeliveryEntry({
        workUnitId: plan.workUnitId,
        entryMode: "integrating",
      }, deps)).resolves.toMatchObject({ status: "refused" });
    }
  });

  it("recovers an interrupted canonical publication during integration from its exact receipt", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      authoring: "match",
      authoringPlanDigest: plan.planDigest,
    }))).resolves.toMatchObject({
      status: "canonicalize-provisional",
      authoringMapId: "map-1",
    });
  });

  it("refuses unavailable or incoherent state after integration selects a canonical plan", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    const incoherent = deliveryStateFixture(plan);
    incoherent.boundPlan.planDigest = `sha256:${"0".repeat(64)}`;

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      authoring: "match",
      authoringPlanDigest: plan.planDigest,
      state: "refused",
    })))
      .resolves.toMatchObject({ status: "refused", reason: "evidence-unavailable" });
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      authoring: "match",
      authoringPlanDigest: plan.planDigest,
      state: incoherent,
    })))
      .resolves.toMatchObject({ status: "refused", reason: "state-incoherent" });
  });

  it("recovers a canonical plan only from its exact authoring receipt", async () => {
    const taskList = `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`;
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      authoring: "match",
      authoringPlanDigest: plan.planDigest,
    }))).resolves.toMatchObject({
      status: "canonicalize-provisional",
      authoringMapId: "map-1",
    });

    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies({
      taskList,
      resolvedPlan: plan,
      authoring: "match",
      authoringPlanDigest: `sha256:${"0".repeat(64)}`,
    }))).resolves.toMatchObject({ status: "refused", reason: "evidence-conflict" });
  });

  it("refuses ambiguity, incoherence, and unconfirmed provisional prose rather than treating them as absence", async () => {
    const cases = [
      dependencies({ resolvedPlan: "indeterminate" }),
      dependencies({ authoring: "indeterminate" }),
      dependencies({ taskList: `${prefix}## Delivery Plan\n\nUnconfirmed.\n\n${suffix}` }),
      dependencies({ taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}` }),
    ];
    const reasons = [
      "evidence-unavailable",
      "evidence-unavailable",
      "provisional-unconfirmed",
      "canonical-plan-missing",
    ];
    for (const [index, deps] of cases.entries()) {
      const result = await inspectDeliveryEntry({
        workUnitId: plan.workUnitId,
        boundaryDisposition: "delivery-candidate",
        provisionalDisposition: "not-applicable",
      }, deps);
      expect(result).toMatchObject({ status: "refused", reason: reasons[index] });
    }
  });

  it("returns not-applicable only for an explicit noncandidate with no authored evidence", async () => {
    await expect(inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      boundaryDisposition: "not-delivery-candidate",
      provisionalDisposition: "not-applicable",
    }, dependencies())).resolves.toMatchObject({
      status: "not-applicable",
      nextAction: "continue-work-unit",
    });
  });
});

describe("selectOutstandingNonTerminalDeliveryMember", () => {
  function bind(
    boundPlan: ReturnType<typeof deliveryThreeMemberStackPlanFixture>,
    boundIndexes: readonly number[],
  ) {
    const state = deliveryStateFixture(boundPlan);
    return {
      ...state,
      members: state.members.map((member, index) => ({
        ...member,
        changeRequest: boundIndexes.includes(index)
          ? { providerId: "github", changeRequestId: String(index + 101) }
          : null,
      })),
    };
  }

  it("selects the first plan-ordered non-terminal member carrying a bound request", () => {
    const threeMemberPlan = deliveryThreeMemberStackPlanFixture();

    expect(selectOutstandingNonTerminalDeliveryMember({
      plan: threeMemberPlan,
      state: bind(threeMemberPlan, [0, 1, 2]),
    })).toEqual({
      deliverableId: threeMemberPlan.members[0]?.deliverableId,
      changeRequest: { providerId: "github", changeRequestId: "101" },
    });
  });

  it("skips an unbound non-terminal member and selects the next bound one", () => {
    const threeMemberPlan = deliveryThreeMemberStackPlanFixture();

    expect(selectOutstandingNonTerminalDeliveryMember({
      plan: threeMemberPlan,
      state: bind(threeMemberPlan, [1, 2]),
    })).toEqual({
      deliverableId: threeMemberPlan.members[1]?.deliverableId,
      changeRequest: { providerId: "github", changeRequestId: "102" },
    });
  });

  it("selects nothing when only the terminal member carries a bound request", () => {
    const threeMemberPlan = deliveryThreeMemberStackPlanFixture();

    expect(selectOutstandingNonTerminalDeliveryMember({
      plan: threeMemberPlan,
      state: bind(threeMemberPlan, [2]),
    })).toBeNull();
  });

  it("selects nothing from a terminal-only plan whose single member is bound", () => {
    const singleMemberPlan = deliverySingleMemberStackPlanFixture();

    expect(selectOutstandingNonTerminalDeliveryMember({
      plan: singleMemberPlan,
      state: bind(singleMemberPlan, [0]),
    })).toBeNull();
  });

  it("selects nothing when no member carries a bound request", () => {
    const threeMemberPlan = deliveryThreeMemberStackPlanFixture();

    expect(selectOutstandingNonTerminalDeliveryMember({
      plan: threeMemberPlan,
      state: bind(threeMemberPlan, []),
    })).toBeNull();
  });
});

describe("inspectDeliveryEntry — non-current Candidate classification", () => {
  const carriesNonLifecycle = {
    kind: "carries-non-lifecycle" as const,
    lifecyclePaths: [".arc/active/tasks-example.md"],
    nonLifecyclePaths: ["packages/arc-framework/src/lib/delivery/review-fix.ts"],
  };

  function integratingEntry(overrides: Parameters<typeof dependencies>[0]) {
    const fixture = publicContinuationFixture();
    return inspectDeliveryEntry({
      workUnitId: plan.workUnitId,
      entryMode: "integrating",
    }, dependencies({
      taskList: `${prefix}${renderDeliveryPlanSection(plan)}${suffix}`,
      resolvedPlan: plan,
      state: fixture.state,
      stateRevision: fixture.stateRevision,
      integrationBoundary: fixture.boundary,
      candidate: "non-current",
      ...overrides,
    }));
  }

  it("stops ambiguously when carried content meets an outstanding non-terminal member", async () => {
    const result = await integratingEntry({ candidateTerminalDelta: carriesNonLifecycle });

    expect(result).toMatchObject({
      status: "correction-route-ambiguous",
      nextAction: "stop",
      planId: plan.planId,
      terminalDelta: carriesNonLifecycle,
      outstandingMember: {
        deliverableId: plan.members[0]?.deliverableId,
        changeRequest: { providerId: "github", changeRequestId: "101" },
      },
      routes: [
        { kind: "candidate-verification", nextAction: "verify-work-unit" },
        {
          kind: "member-correction",
          nextAction: "plan-review-fix",
          command: "arc delivery review-fix continue - --json",
        },
      ],
    });
  });

  it("names both candidate routes in the rendered stop text", async () => {
    const result = await integratingEntry({ candidateTerminalDelta: carriesNonLifecycle });

    expect(result).toMatchObject({
      recommendedActionText: expect.stringContaining("verification closeout"),
    });
    expect(result).toMatchObject({
      recommendedActionText: expect.stringContaining("arc delivery review-fix continue - --json"),
    });
  });

  it("retains verification closeout for a delta reaching only lifecycle artifacts", async () => {
    await expect(integratingEntry({
      candidateTerminalDelta: {
        kind: "lifecycle-only",
        lifecyclePaths: [".arc/active/tasks-example.md"],
      },
    })).resolves.toMatchObject({
      status: "candidate-verification-required",
      nextAction: "verify-work-unit",
    });
  });

  it("retains verification closeout when no non-terminal member review is outstanding", async () => {
    const fixture = publicContinuationFixture();
    const terminalOnly = {
      ...fixture.state,
      members: fixture.state.members.map((member, index) => ({
        ...member,
        changeRequest: index === fixture.state.members.length - 1 ? member.changeRequest : null,
      })),
    };

    await expect(integratingEntry({
      state: terminalOnly,
      candidateTerminalDelta: carriesNonLifecycle,
    })).resolves.toMatchObject({
      status: "candidate-verification-required",
      nextAction: "verify-work-unit",
    });
  });
});
