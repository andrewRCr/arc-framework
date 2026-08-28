import { describe, expect, it } from "vitest";

import type { DeliveryContributionEndpoints } from "../../../src/lib/delivery/contribution-proof.js";
import { DeliveryStateV1Schema } from "../../../src/lib/delivery/schema.js";
import {
  assessDeliveryTerminalChecks,
  assessDeliveryTerminalTop,
  classifyDeliveryTerminalDrift,
  composeDeliveryTerminalClaim,
  rebindDeliveryTerminalCoordinates,
} from "../../../src/lib/delivery/terminal-integration.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  projectCandidateCurrentness,
  type CandidateManagedRecordV1,
} from "../../../src/lib/work-unit/candidate-attestation.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import {
  deliverySingleMemberStackPlanFixture,
  deliveryThreeMemberStackPlanFixture,
} from "../../fixtures/delivery-plan.js";
import { deliveryStateFixture } from "../../fixtures/delivery-state.js";

const CANDIDATE_HEAD = "a".repeat(40);
const CANDIDATE_TREE = "b".repeat(40);

function candidateRecord(): CandidateManagedRecordV1 {
  const subject = createCandidateSubjectSnapshot([{
    path: "feature.ts",
    digest: canonicalDigest({ content: "candidate" }),
    mode: "100644",
    treatment: "reviewable",
  }]);
  return {
    schemaVersion: 1,
    semanticsVersion: "candidate-attestation/v1",
    attestation: createCandidateAttestation({
      workUnit: "delivery-plan-record",
      subject,
      baseRevision: CANDIDATE_HEAD,
      attestedBy: "reviewer",
      attestedAt: "2026-08-21T12:00:00.000Z",
      verificationEvidenceRef: "verification://candidate",
    }),
    subject,
    transitions: [],
    lineageAttestations: [],
  };
}

function fixture(plan = deliveryThreeMemberStackPlanFixture()) {
  const initial = deliveryStateFixture(plan);
  const state = {
    ...initial,
    members: initial.members.map((member, index) => ({
      ...member,
      changeRequest: { providerId: "github", changeRequestId: String(401 + index) },
    })),
  };
  const record = candidateRecord();
  const candidate = projectCandidateCurrentness({
    record,
    current: { revision: CANDIDATE_HEAD, subject: record.subject },
  });
  if (candidate.status !== "current") throw new Error("fixture Candidate must be current");
  const predecessor = state.members.at(-2)?.coordinates ?? state.target?.coordinates;
  if (predecessor === null || predecessor === undefined) {
    throw new Error("fixture predecessor must be available");
  }
  const endpoints: DeliveryContributionEndpoints = {
    before: {
      predecessor: { head: predecessor.head, tree: predecessor.tree },
      member: { head: CANDIDATE_HEAD, tree: CANDIDATE_TREE },
    },
    after: {
      predecessor: { head: predecessor.head, tree: predecessor.tree },
      member: { head: CANDIDATE_HEAD, tree: CANDIDATE_TREE },
    },
  };
  return { plan, state, record, candidate, endpoints };
}

async function terminalBoundaryFixture() {
  const f = fixture();
  const state = {
    ...f.state,
    members: f.state.members.map((member, index, members) => index === members.length - 1
      ? {
          ...member,
          coordinates: { ...member.coordinates!, head: CANDIDATE_HEAD, tree: CANDIDATE_TREE },
        }
      : member),
  };
  const claim = await composeDeliveryTerminalClaim({
    record: f.record,
    candidate: f.candidate,
    plan: f.plan,
    state,
    landings: state.members.slice(0, -1).map((member) => ({
      deliverableId: member.deliverableId,
      head: member.coordinates!.head,
    })),
    terminalDelta: f.endpoints.after,
    readCandidateCoordinate: async () => ({ head: CANDIDATE_HEAD, tree: CANDIDATE_TREE }),
    proveResidual: async () => ({ status: "accepted", proof: "tree-equality" }),
  });
  if (claim.status !== "composed") throw new Error("fixture claim must compose");
  const targets = state.members.map((member) => ({
    deliverableId: member.deliverableId,
    providerId: member.changeRequest!.providerId,
    changeRequestId: member.changeRequest!.changeRequestId,
    head: member.coordinates!.head,
  }));
  return { state, claim, targets };
}

function terminalRebindFixture(plan = deliveryThreeMemberStackPlanFixture()) {
  const f = fixture(plan);
  const terminal = f.state.members.at(-1)!;
  const candidate = {
    schemaVersion: 1 as const,
    mode: "candidate-effective-target" as const,
    state: "current" as const,
    nextAction: "continue" as const,
    candidateId: f.record.attestation.candidateId,
    durableBaselineTarget: { revision: CANDIDATE_HEAD, subject: f.record.subject },
    recognizedTarget: { revision: CANDIDATE_HEAD, subject: f.record.subject },
    recognition: { kind: "durable" as const },
    implementationChanged: false,
    convergenceVerification: "satisfied" as const,
  };
  const coordinates = {
    base: f.state.target!.coordinates!.head,
    head: CANDIDATE_HEAD,
    tree: CANDIDATE_TREE,
  };
  return {
    ...f,
    candidate,
    coordinates,
    input: {
      plan: f.plan,
      state: f.state,
      candidate,
      publication: {
        settled: true,
        candidateId: candidate.candidateId,
        candidateSubjectDigest: candidate.recognizedTarget.subject.subjectDigest,
      },
      repository: "owner/repo",
      request: {
        binding: terminal.changeRequest!,
        repository: "owner/repo",
        headRepository: "owner/repo",
        headRef: terminal.ref!.replace(/^refs\/heads\//u, ""),
        headSha: CANDIDATE_HEAD,
        baseRef: f.state.target!.ref.replace(/^refs\/heads\//u, ""),
        state: "open" as const,
      },
      coordinates,
    },
  };
}

describe("delivery terminal integration", () => {
  it("rebinds only the terminal coordinates to the settled current Candidate", () => {
    const f = terminalRebindFixture();
    const result = rebindDeliveryTerminalCoordinates(f.input);

    expect(result).toEqual({
      status: "rebound",
      state: {
        ...f.state,
        members: f.state.members.map((member, index, members) => index === members.length - 1
          ? { ...member, coordinates: f.coordinates }
          : member),
      },
      nextAction: "rerun-checkpoint",
    });
  });

  it("rebinds the terminal while its request targets the exact immediate predecessor", () => {
    const f = terminalRebindFixture();
    const predecessor = f.state.members.at(-2)!;
    const coordinates = { ...f.coordinates, base: predecessor.coordinates!.head };
    const result = rebindDeliveryTerminalCoordinates({
      ...f.input,
      request: {
        ...f.input.request,
        baseRef: predecessor.ref!.replace(/^refs\/heads\//u, ""),
      },
      coordinates,
    });

    expect(result).toEqual({
      status: "rebound",
      state: {
        ...f.state,
        members: f.state.members.map((member, index, members) => index === members.length - 1
          ? { ...member, coordinates }
          : member),
      },
      nextAction: "rerun-checkpoint",
    });
  });

  it("preserves the exact protected-target path for a single-member delivery", () => {
    const f = terminalRebindFixture(deliverySingleMemberStackPlanFixture());

    expect(rebindDeliveryTerminalCoordinates(f.input)).toMatchObject({
      status: "rebound",
      state: { members: [{ coordinates: f.coordinates }] },
      nextAction: "rerun-checkpoint",
    });
  });

  it("returns the same checkpoint continuation when the exact rebind is rerun", () => {
    const f = terminalRebindFixture();
    const first = rebindDeliveryTerminalCoordinates(f.input);
    if (first.status !== "rebound") throw new Error("fixture rebind must succeed");

    expect(rebindDeliveryTerminalCoordinates({ ...f.input, state: first.state })).toEqual(first);
  });

  it.each([
    ["active operation", (f: ReturnType<typeof terminalRebindFixture>) => ({
      ...f.input,
      state: {
        ...f.state,
        activeOperation: {
          operationId: "operation-1",
          kind: "materialize" as const,
          affectedDeliverableIds: [f.state.members[0]!.deliverableId],
          stateRevision: 1,
          boundPlanDigest: f.plan.planDigest,
          before: { target: f.state.target, members: f.state.members },
          requested: { target: f.state.target, members: f.state.members },
        },
      },
    }), "operation-active"],
    ["pending changed-member verification", (f: ReturnType<typeof terminalRebindFixture>) => ({
      ...f.input,
      state: {
        ...f.state,
        pendingReviewFixVerification: {
          selectedDeliverableId: f.state.members[0]!.deliverableId,
          memberDeliverableIds: [f.state.members[0]!.deliverableId],
        },
      },
    }), "pending-review-fix-verification"],
    ["moved request", (f: ReturnType<typeof terminalRebindFixture>) => ({
      ...f.input,
      request: { ...f.input.request, headSha: "f".repeat(40) },
    }), "top-request-mismatch"],
    ["unrelated request base", (f: ReturnType<typeof terminalRebindFixture>) => ({
      ...f.input,
      request: { ...f.input.request, baseRef: "unrelated" },
    }), "top-request-mismatch"],
    ["stale protected-target coordinate base", (f: ReturnType<typeof terminalRebindFixture>) => ({
      ...f.input,
      coordinates: { ...f.coordinates, base: "f".repeat(40) },
    }), "top-request-mismatch"],
    ["incoherent predecessor coordinate base", (f: ReturnType<typeof terminalRebindFixture>) => ({
      ...f.input,
      request: {
        ...f.input.request,
        baseRef: f.state.members.at(-2)!.ref!.replace(/^refs\/heads\//u, ""),
      },
      coordinates: { ...f.coordinates, base: f.state.target!.coordinates!.head },
    }), "top-request-mismatch"],
    ["incoherent state", (f: ReturnType<typeof terminalRebindFixture>) => ({
      ...f.input,
      state: DeliveryStateV1Schema.parse({ ...f.state, workUnitId: "other-work-unit" }),
    }), "state-mismatch"],
    ["unsettled publication boundary", (f: ReturnType<typeof terminalRebindFixture>) => ({
      ...f.input,
      publication: { ...f.input.publication, settled: false },
    }), "publication-boundary-unsettled"],
    ["different publication subject", (f: ReturnType<typeof terminalRebindFixture>) => ({
      ...f.input,
      publication: {
        ...f.input.publication,
        candidateSubjectDigest: `sha256:${"f".repeat(64)}`,
      },
    }), "publication-boundary-mismatch"],
    ["non-current Candidate", (f: ReturnType<typeof terminalRebindFixture>) => ({
      ...f.input,
      candidate: {
        schemaVersion: 1 as const,
        mode: "candidate-effective-target" as const,
        state: "changed" as const,
        nextAction: "establish-new-root" as const,
        candidateId: f.candidate.candidateId,
        durableBaselineTarget: f.candidate.durableBaselineTarget,
        currentTarget: {
          revision: "f".repeat(40),
          subject: f.candidate.recognizedTarget.subject,
        },
        projectionDigest: f.candidate.candidateId,
        residualDigest: f.candidate.candidateId,
        selectedBy: "owner",
      },
    }), "candidate-not-current"],
    ["Candidate coordinate movement", (f: ReturnType<typeof terminalRebindFixture>) => ({
      ...f.input,
      coordinates: { ...f.coordinates, head: "f".repeat(40) },
    }), "candidate-coordinate-mismatch"],
    ["missing terminal request binding", (f: ReturnType<typeof terminalRebindFixture>) => ({
      ...f.input,
      state: {
        ...f.state,
        members: f.state.members.map((member, index, members) => index === members.length - 1
          ? { ...member, changeRequest: null }
          : member),
      },
    }), "terminal-binding-missing"],
  ])("refuses rebind with %s", (_name, build, reason) => {
    const f = terminalRebindFixture();
    expect(rebindDeliveryTerminalCoordinates(build(f))).toEqual({ status: "refused", reason });
  });

  it("composes the residual from the Candidate and retained non-terminal member heads", async () => {
    const f = fixture();
    const result = await composeDeliveryTerminalClaim({
      record: f.record,
      candidate: f.candidate,
      plan: f.plan,
      state: f.state,
      landings: f.state.members.slice(0, -1).map((member) => ({
        deliverableId: member.deliverableId,
        head: member.coordinates!.head,
      })),
      terminalDelta: f.endpoints.after,
      readCandidateCoordinate: async (head) => head === CANDIDATE_HEAD
        ? { head, tree: CANDIDATE_TREE }
        : null,
      proveResidual: async (endpoints) => JSON.stringify(endpoints) === JSON.stringify(f.endpoints)
        ? { status: "accepted", proof: "tree-equality" }
        : { status: "refused", reason: "contribution-endpoints-unverified" },
    });

    expect(result).toEqual({
      status: "composed",
      candidateId: f.record.attestation.candidateId,
      endpoints: f.endpoints,
      proof: { status: "accepted", proof: "tree-equality" },
    });
  });

  it("refuses a terminal claim while selected-member verification is pending", async () => {
    const f = fixture();
    await expect(composeDeliveryTerminalClaim({
      record: f.record,
      candidate: f.candidate,
      plan: f.plan,
      state: {
        ...f.state,
        pendingReviewFixVerification: {
          selectedDeliverableId: f.state.members[0]!.deliverableId,
          memberDeliverableIds: [f.state.members[0]!.deliverableId],
        },
      },
      landings: [],
      terminalDelta: f.endpoints.after,
      readCandidateCoordinate: async () => null,
      proveResidual: async () => ({ status: "refused", reason: "contribution-endpoints-unverified" }),
    })).resolves.toEqual({ status: "refused", reason: "pending-review-fix-verification" });
  });

  it("refuses when a landed member does not match its retained bound head", async () => {
    const f = fixture();
    const first = f.state.members[0]!;
    const result = await composeDeliveryTerminalClaim({
      record: f.record,
      candidate: f.candidate,
      plan: f.plan,
      state: f.state,
      landings: [
        { deliverableId: first.deliverableId, head: "f".repeat(40) },
        {
          deliverableId: f.state.members[1]!.deliverableId,
          head: f.state.members[1]!.coordinates!.head,
        },
      ],
      terminalDelta: f.endpoints.after,
      readCandidateCoordinate: async () => ({ head: CANDIDATE_HEAD, tree: CANDIDATE_TREE }),
      proveResidual: async () => ({ status: "accepted", proof: "tree-equality" }),
    });

    expect(result).toEqual({
      status: "refused",
      reason: "landed-head-mismatch",
      deliverableId: first.deliverableId,
    });
  });

  it("uses retained bindings after the landed member ref has been reaped", async () => {
    const f = fixture();
    const state = {
      ...f.state,
      members: f.state.members.map((member, index) => index === 0
        ? { ...member, ref: "refs/heads/reaped-member" }
        : member),
    };
    const result = await composeDeliveryTerminalClaim({
      record: f.record,
      candidate: f.candidate,
      plan: f.plan,
      state,
      landings: state.members.slice(0, -1).map((member) => ({
        deliverableId: member.deliverableId,
        head: member.coordinates!.head,
      })),
      terminalDelta: f.endpoints.after,
      readCandidateCoordinate: async () => ({ head: CANDIDATE_HEAD, tree: CANDIDATE_TREE }),
      proveResidual: async () => ({ status: "accepted", proof: "tree-equality" }),
    });

    expect(result.status).toBe("composed");
  });

  it("surfaces the eligibility comparator's residual refusal", async () => {
    const f = fixture();
    const result = await composeDeliveryTerminalClaim({
      record: f.record,
      candidate: f.candidate,
      plan: f.plan,
      state: f.state,
      landings: f.state.members.slice(0, -1).map((member) => ({
        deliverableId: member.deliverableId,
        head: member.coordinates!.head,
      })),
      terminalDelta: f.endpoints.after,
      readCandidateCoordinate: async () => ({ head: CANDIDATE_HEAD, tree: CANDIDATE_TREE }),
      proveResidual: async () => ({
        status: "refused",
        reason: "contribution-diverged",
        paths: ["unexpected.ts"],
      }),
    });

    expect(result).toEqual({
      status: "refused",
      reason: "residual-mismatch",
      proof: {
        status: "refused",
        reason: "contribution-diverged",
        paths: ["unexpected.ts"],
      },
    });
  });

  it("leaves the singleton checkpoint path not applicable", async () => {
    const f = fixture();
    await expect(composeDeliveryTerminalClaim({
      record: f.record,
      candidate: f.candidate,
      plan: null,
      state: null,
      landings: [],
      terminalDelta: f.endpoints.after,
      readCandidateCoordinate: async () => { throw new Error("must not read"); },
      proveResidual: async () => { throw new Error("must not prove"); },
    })).resolves.toEqual({ status: "not-applicable" });
  });

  it("passes only the publication-bound Candidate and complete member-review target set", async () => {
    const { state, claim, targets } = await terminalBoundaryFixture();

    expect(assessDeliveryTerminalChecks({
      claim,
      state,
      publication: { candidateId: claim.candidateId, head: CANDIDATE_HEAD },
      review: { status: "discharged", targets },
    })).toEqual({ status: "ready", candidateId: claim.candidateId, targets });
  });

  it("refuses a Candidate other than the currently bound publication Candidate", async () => {
    const { state, claim, targets } = await terminalBoundaryFixture();
    expect(assessDeliveryTerminalChecks({
      claim,
      state,
      publication: { candidateId: `sha256:${"f".repeat(64)}`, head: CANDIDATE_HEAD },
      review: { status: "discharged", targets },
    })).toEqual({ status: "refused", reason: "publication-candidate-mismatch" });
  });

  it("refuses a review conjunction whose derived member target moved", async () => {
    const { state, claim, targets } = await terminalBoundaryFixture();
    const first = targets[0]!;
    expect(assessDeliveryTerminalChecks({
      claim,
      state,
      publication: { candidateId: claim.candidateId, head: CANDIDATE_HEAD },
      review: {
        status: "discharged",
        targets: [{ ...first, head: "f".repeat(40) }, ...targets.slice(1)],
      },
    })).toEqual({
      status: "refused",
      reason: "member-review-target-mismatch",
      deliverableId: first.deliverableId,
    });
  });

  it("refuses while the derived member-review conjunction remains outstanding", async () => {
    const { state, claim, targets } = await terminalBoundaryFixture();
    expect(assessDeliveryTerminalChecks({
      claim,
      state,
      publication: { candidateId: claim.candidateId, head: CANDIDATE_HEAD },
      review: { status: "outstanding", targets },
    })).toEqual({ status: "refused", reason: "member-review-outstanding" });
  });

  it("allows the top to target a member branch while the landing window remains open", () => {
    expect(assessDeliveryTerminalTop({
      terminal: false,
      protectedBaseRef: "main",
      publicationHead: CANDIDATE_HEAD,
      request: {
        binding: { providerId: "github", changeRequestId: "403" },
        repository: "owner/repo",
        headRef: "feature",
        headSha: CANDIDATE_HEAD,
        baseRef: "member-2",
        state: "open",
      },
    })).toEqual({ status: "window-open" });
  });

  it("accepts an open top freshly observed at the protected base", () => {
    const request = {
      binding: { providerId: "github", changeRequestId: "403" },
      repository: "owner/repo",
      headRef: "feature",
      headSha: CANDIDATE_HEAD,
      baseRef: "main",
      state: "open" as const,
    };
    expect(assessDeliveryTerminalTop({
      terminal: true,
      protectedBaseRef: "refs/heads/main",
      publicationHead: CANDIDATE_HEAD,
      request,
    })).toEqual({ status: "ready", request });
  });

  it("returns only the retarget remedy for an open top still on a member base", () => {
    expect(assessDeliveryTerminalTop({
      terminal: true,
      protectedBaseRef: "refs/heads/main",
      publicationHead: CANDIDATE_HEAD,
      request: {
        binding: { providerId: "github", changeRequestId: "403" },
        repository: "owner/repo",
        headRef: "feature",
        headSha: CANDIDATE_HEAD,
        baseRef: "member-2",
        state: "open",
      },
    })).toEqual({
      status: "refused",
      reason: "top-target-mismatch",
      remedy: {
        nextAction: "retarget",
        repository: "owner/repo",
        changeRequestId: "403",
        protectedBaseRef: "main",
      },
    });
  });

  it("returns reopen-and-retarget for a closed-unmerged top", () => {
    expect(assessDeliveryTerminalTop({
      terminal: true,
      protectedBaseRef: "refs/heads/main",
      publicationHead: CANDIDATE_HEAD,
      request: {
        binding: { providerId: "github", changeRequestId: "403" },
        repository: "owner/repo",
        headRef: "feature",
        headSha: CANDIDATE_HEAD,
        baseRef: "member-2",
        state: "closed",
      },
    })).toMatchObject({
      status: "refused",
      reason: "top-target-mismatch",
      remedy: { nextAction: "reopen-and-retarget" },
    });
  });

  it("routes residual overlap through the guarded base reconcile", () => {
    expect(classifyDeliveryTerminalDrift({
      substantivePaths: ["terminal.ts"],
      regenerablePaths: ["ROADMAP.md"],
      residualPaths: ["terminal.ts"],
      predecessorPaths: ["member.ts"],
    })).toEqual({
      status: "reconcile",
      nextAction: "reconcile-base",
      safetyClass: "residual-contained",
    });
  });

  it("reconciles drift outside the residual without whole-work-unit verification", () => {
    expect(classifyDeliveryTerminalDrift({
      substantivePaths: [],
      regenerablePaths: ["ROADMAP.md"],
      residualPaths: ["terminal.ts"],
      predecessorPaths: [],
    })).toEqual({ status: "reconcile", nextAction: "reconcile-base", safetyClass: "generic" });
  });

  it("keeps substantive paths outside the residual under generic reconcile safety", () => {
    expect(classifyDeliveryTerminalDrift({
      substantivePaths: ["terminal.ts", "union-only.ts"],
      regenerablePaths: [],
      residualPaths: ["terminal.ts"],
      predecessorPaths: [],
    })).toEqual({ status: "reconcile", nextAction: "reconcile-base", safetyClass: "generic" });
  });

  it("refuses predecessor overlap before residual verification", () => {
    expect(classifyDeliveryTerminalDrift({
      substantivePaths: ["shared.ts"],
      regenerablePaths: [],
      residualPaths: ["shared.ts"],
      predecessorPaths: ["shared.ts"],
    })).toEqual({ status: "refused", reason: "predecessor-overlap", paths: ["shared.ts"] });
  });
});
