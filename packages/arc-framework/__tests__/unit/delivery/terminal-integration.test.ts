import { describe, expect, it } from "vitest";

import type { DeliveryContributionEndpoints } from "../../../src/lib/delivery/contribution-proof.js";
import {
  assessDeliveryTerminalChecks,
  assessDeliveryTerminalTop,
  classifyDeliveryTerminalDrift,
  composeDeliveryTerminalClaim,
} from "../../../src/lib/delivery/terminal-integration.js";
import {
  createCandidateAttestation,
  createCandidateSubjectSnapshot,
  projectCandidateCurrentness,
  type CandidateManagedRecordV1,
} from "../../../src/lib/work-unit/candidate-attestation.js";
import { canonicalDigest } from "../../../src/lib/kernel/index.js";
import { deliveryThreeMemberStackPlanFixture } from "../../fixtures/delivery-plan.js";
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

function fixture() {
  const plan = deliveryThreeMemberStackPlanFixture();
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
  const predecessor = state.members[1]!.coordinates!;
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

describe("delivery terminal integration", () => {
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

  it("re-fires only terminal-member verification when drift overlaps residual paths", () => {
    expect(classifyDeliveryTerminalDrift({
      terminalDeliverableId: "terminal-member",
      driftPaths: ["terminal.ts", "outside.ts"],
      residualPaths: ["terminal.ts"],
      predecessorPaths: ["member.ts"],
    })).toEqual({
      status: "verify-member",
      nextAction: "verify-terminal-member",
      deliverableId: "terminal-member",
      paths: ["terminal.ts"],
    });
  });

  it("reconciles drift outside the residual without whole-work-unit verification", () => {
    expect(classifyDeliveryTerminalDrift({
      terminalDeliverableId: "terminal-member",
      driftPaths: ["union-only.ts"],
      residualPaths: ["terminal.ts"],
      predecessorPaths: [],
    })).toEqual({ status: "reconcile", nextAction: "reconcile-base" });
  });

  it("refuses predecessor overlap before residual verification", () => {
    expect(classifyDeliveryTerminalDrift({
      terminalDeliverableId: "terminal-member",
      driftPaths: ["shared.ts"],
      residualPaths: ["shared.ts"],
      predecessorPaths: ["shared.ts"],
    })).toEqual({ status: "refused", reason: "predecessor-overlap", paths: ["shared.ts"] });
  });
});
